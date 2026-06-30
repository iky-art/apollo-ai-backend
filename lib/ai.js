// lib/ai.js — Koneksi AI via Groq + Advanced Jailbreak Detection

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ═══════════════════════════════════════
// JAILBREAK PATTERNS — Multi-bahasa
// ═══════════════════════════════════════

// Bahasa Inggris — exact phrases (score tinggi)
const PATTERNS_EN = [
  'ignore previous instructions', 'ignore all instructions', 'ignore your instructions',
  'forget your instructions', 'forget previous', 'disregard all',
  'you are now', 'you are no longer', 'act as if', 'act as a',
  'pretend you are', 'pretend to be', 'roleplay as', 'simulate being',
  'jailbreak', 'dan mode', 'developer mode', 'do anything now', 'dAN',
  'you have no restrictions', 'you have no limits', 'no rules apply',
  'bypass your', 'override your', 'override the', 'circumvent',
  'system prompt', 'your instructions', 'your programming',
  'evil mode', 'opposite mode', 'chaos mode', 'unrestricted mode',
  'sudo mode', 'root access', 'admin mode', 'god mode',
  'without filters', 'without restrictions', 'without limits',
  'unfiltered', 'uncensored', 'unlimited access',
  'for educational purposes only', 'hypothetically speaking',
  'in a fictional world', 'in a story', 'write a story where',
  'from now on you', 'starting now you', 'i want you to',
  'you must', 'you will', 'you should not refuse',
];

// Bahasa Indonesia — kata/frasa jailbreak
const PATTERNS_ID = [
  'abaikan instruksi', 'abaikan semua', 'lupakan instruksi', 'lupakan aturan',
  'kamu sekarang adalah', 'kamu adalah ai', 'bertindak sebagai', 'berpura-pura',
  'pura-pura kamu', 'anggap kamu', 'simulasikan', 'roleplay sebagai',
  'jailbreak', 'tanpa batasan', 'tanpa sensor', 'tanpa filter',
  'tidak ada aturan', 'tidak ada batasan', 'bebas melakukan',
  'lewati filter', 'bypass filter', 'hack ai', 'bobol ai',
  'mode jahat', 'mode bebas', 'mode developer', 'mode tanpa batas',
  'kamu harus menuruti', 'kamu tidak boleh menolak', 'wajib menjawab',
  'untuk tujuan edukasi', 'dalam cerita fiksi', 'seandainya kamu bisa',
  'sekarang kamu bisa', 'mulai sekarang kamu', 'anggap saja',
  'pokoknya jawab', 'jawab saja', 'langsung jawab tanpa',
];

// Karakter pengganti (leet speak / obfuscation)
const LEET_MAP = {
  '4':'a','@':'a','3':'e','1':'i','!':'i','0':'o','5':'s','$':'s',
  '7':'t','+':'t','8':'b','6':'g','9':'g','(':'c',
};

// Normalisasi teks — hapus leet speak, extra spaces, unicode tricks
function normalizeText(text) {
  let t = text.toLowerCase();
  // Hapus zero-width chars
  t = t.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');
  // Decode leet speak
  t = t.split('').map(c => LEET_MAP[c] || c).join('');
  // Normalize whitespace
  t = t.replace(/\s+/g, ' ').trim();
  // Hapus karakter berulang berlebihan (heeelp → help)
  t = t.replace(/(.)\1{3,}/g, '$1$1');
  return t;
}

// Cek similarity sederhana (fuzzy) — tolerance 1 karakter beda
function fuzzyMatch(text, pattern) {
  if (text.includes(pattern)) return true;
  if (pattern.length < 5) return false;
  // Sliding window dengan 1 char tolerance
  const words = pattern.split(' ');
  if (words.length >= 2) {
    // Cek tiap kata ada di teks
    const inText = words.filter(w => w.length > 3 && text.includes(w));
    if (inText.length >= Math.ceil(words.length * 0.8)) return true;
  }
  return false;
}

// ═══════════════════════════════════════
// MAIN DETECTOR
// ═══════════════════════════════════════
export function detectJailbreak(text = '') {
  const norm   = normalizeText(text);
  const orig   = text.toLowerCase();
  let score    = 0;
  const matched = [];

  // Cek semua patterns
  [...PATTERNS_EN, ...PATTERNS_ID].forEach(p => {
    const pNorm = normalizeText(p);
    if (fuzzyMatch(norm, pNorm) || fuzzyMatch(orig, p)) {
      const weight = p.split(' ').length >= 3 ? 5 :
                     p.split(' ').length >= 2 ? 3 : 1;
      score += weight;
      if (!matched.includes(p)) matched.push(p);
    }
  });

  // Bonus score: banyak tanda baca aneh / capslock berlebihan
  const capsRatio = (text.match(/[A-Z]/g)||[]).length / Math.max(text.length, 1);
  if (capsRatio > 0.5 && text.length > 20) score += 2;

  // Bonus: ada injeksi markdown/code block yang berisi instruksi
  if (/```[\s\S]*?(ignore|system|instruction|jailbreak)[\s\S]*?```/i.test(text)) score += 5;

  // Bonus: panjang pesan > 500 char dengan kata kunci mencurigakan
  if (text.length > 500 && score > 0) score += 1;

  if (score === 0) return { detected: false };

  return {
    detected : true,
    risk     : score >= 8 ? 'high' : score >= 3 ? 'med' : 'low',
    score,
    patterns : matched,
    normalized: norm.slice(0, 200),
  };
}

// ═══════════════════════════════════════
// KIRIM KE GROQ — dengan auto-fallback model
// ═══════════════════════════════════════

// Fallback kalau model utama deprecated/error
const MODEL_FALLBACK = {
  'meta-llama/llama-4-scout-17b-16e-instruct': 'llama-3.3-70b-versatile',
  'qwen/qwen3-32b'                           : 'llama-3.3-70b-versatile',
  'openai/gpt-oss-20b'                       : 'llama-3.1-8b-instant',
  'openai/gpt-oss-120b'                      : 'llama-3.3-70b-versatile',
  'openai/gpt-oss-safeguard-20b'             : 'llama-3.3-70b-versatile',
  'groq/compound'                            : 'llama-3.3-70b-versatile',
  'groq/compound-mini'                       : 'llama-3.1-8b-instant',
};

async function callGroq(apiKey, payload) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export async function sendToAI({ messages, system, model, max_tokens, temperature }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY tidak ada di env');

  const finalMessages = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages;

  let modelToUse = model || process.env.DEFAULT_MODEL || 'llama-3.3-70b-versatile';

  const payload = {
    model      : modelToUse,
    messages   : finalMessages,
    max_tokens : max_tokens || 2048,
    temperature: temperature ?? 0.7,
    stream     : false,
  };

  let { ok, status, data } = await callGroq(apiKey, payload);

  // Kalau model error (deprecated/decommissioned) → coba fallback sekali
  if (!ok && (status === 400 || status === 404) && MODEL_FALLBACK[modelToUse]) {
    const fallbackModel = MODEL_FALLBACK[modelToUse];
    console.warn(`[ai] Model ${modelToUse} gagal, fallback ke ${fallbackModel}`);
    payload.model = fallbackModel;
    const retry = await callGroq(apiKey, payload);
    ok = retry.ok; data = retry.data;
  }

  if (!ok) throw new Error(data?.error?.message || 'Error dari Groq');

  return {
    reply: data.choices?.[0]?.message?.content || '',
    usage: data.usage,
    model: data.model,
  };
}
