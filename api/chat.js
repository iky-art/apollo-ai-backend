// api/chat.js — Proxy chat ke Groq + Jailbreak Detection + Rate Limit

import { sendToAI, detectJailbreak } from '../lib/ai.js';
import { supabase, verifyToken, getToken } from '../lib/supabase.js';

// Rate limit in-memory (reset tiap cold start)
const rl = new Map();
const RL_FREE  = parseInt(process.env.RL_FREE  || '15');   // request/menit user free
const RL_PRO   = parseInt(process.env.RL_PRO   || '60');   // request/menit user pro
const RL_ANON  = parseInt(process.env.RL_ANON  || '5');    // request/menit tanpa login
const RL_WIN   = 60_000;

function checkRate(key, limit) {
  const now = Date.now();
  const e = rl.get(key) || { count: 0, start: now };
  if (now - e.start > RL_WIN) { rl.set(key, { count: 1, start: now }); return true; }
  if (e.count >= limit) return false;
  e.count++;
  rl.set(key, e);
  return true;
}

function cors(res, req) {
  const origin = req.headers['origin'] || '*';
  const allowed = process.env.URL_FRONT_END || '*';
  res.setHeader('Access-Control-Allow-Origin', allowed === '*' ? '*' : origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan POST.' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';

  // Auth (opsional — chat bisa tanpa login tapi rate limit lebih ketat)
  const token = getToken(req);
  let user = null;
  let userPlan = 'anon';

  if (token) {
    user = await verifyToken(token);
    if (user) {
      const { data } = await supabase.from('users').select('plan,is_banned').eq('id', user.id).single();
      if (data?.is_banned) return res.status(403).json({ error: 'Akun kamu dibanned.' });
      userPlan = data?.plan || 'free';
    }
  }

  // Rate limit
  const rlKey = user ? `user:${user.id}` : `ip:${ip}`;
  const rlMax = userPlan === 'pro' ? RL_PRO : userPlan === 'free' ? RL_FREE : RL_ANON;
  if (!checkRate(rlKey, rlMax)) {
    return res.status(429).json({ error: `Terlalu banyak request. Limit: ${rlMax}/menit.` });
  }

  // Validasi body
  const { messages, system, model, max_tokens } = req.body || {};
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '`messages` wajib diisi (array).' });
  }

  // Jailbreak detection
  const lastMsg = messages[messages.length - 1]?.content || '';
  const jb = detectJailbreak(lastMsg);

  if (jb.detected) {
    // Log ke Supabase jika user login
    if (user) {
      await supabase.from('jailbreak_logs').insert({
        user_id: user.id,
        message: lastMsg,
        risk: jb.risk,
        patterns: jb.patterns,
      }).catch(() => {});
    }

    // Block kalau risiko tinggi atau sedang
    if (jb.risk === 'high' || jb.risk === 'med') {
      return res.status(403).json({
        error: 'Pesan kamu melanggar kebijakan penggunaan Apollo AI.',
        jailbreak: true,
        risk: jb.risk,
      });
    }
  }

  // Kirim ke Groq
  try {
    const result = await sendToAI({
      messages,
      system: system || process.env.SYSTEM_PROMPT || 'Kamu adalah Apollo AI, asisten AI cerdas buatan Indonesia. Jawab dengan bahasa yang natural dan membantu.',
      model,
      max_tokens,
    });

    // Update chat_count user
    if (user) {
      await supabase.rpc('increment_chat_count', { uid: user.id }).catch(() => {});
    }

    return res.status(200).json({
      reply: result.reply,
      model: result.model,
      usage: result.usage,
      ...(jb.detected ? { warning: 'Pesan mengandung pola mencurigakan (low risk).' } : {}),
    });

  } catch (err) {
    console.error('[chat]', err);
    return res.status(500).json({ error: 'Gagal menghubungi AI: ' + err.message });
  }
        }
      
