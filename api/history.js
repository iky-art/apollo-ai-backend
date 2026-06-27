// api/history.js — Riwayat chat: GET, POST, DELETE

import { supabase, verifyToken, getToken } from '../lib/supabase.js';

function cors(res, req) {
  const allowed = process.env.URL_FRONT_END || '*';
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function requireAuth(req, res) {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: 'Token tidak ada. Login dulu.' }); return null; }
  const user = await verifyToken(token);
  if (!user) { res.status(401).json({ error: 'Token tidak valid atau expired.' }); return null; }
  return user;
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  // ───── GET — ambil semua sesi + pesan ─────
  if (req.method === 'GET') {
    const sessionId = req.query?.session_id;

    // Kalau ada session_id → ambil pesan sesi itu
    if (sessionId) {
      const { data, error } = await supabase
        .from('messages')
        .select('id, role, content, created_at, tokens')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ messages: data });
    }

    // Tanpa session_id → ambil semua sesi milik user
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('id, title, mode, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ sessions: data });
  }

  // ───── POST — simpan sesi + pesan baru ─────
  if (req.method === 'POST') {
    const { session_id, title, mode, messages } = req.body || {};

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Field `messages` wajib diisi (array).' });
    }

    let sid = session_id;

    // Buat sesi baru kalau belum ada session_id
    if (!sid) {
      const { data: sess, error: sessErr } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: user.id,
          title: title || messages[0]?.content?.slice(0, 40) || 'Chat Baru',
          mode: mode || 'normal',
        })
        .select()
        .single();

      if (sessErr) return res.status(400).json({ error: sessErr.message });
      sid = sess.id;
    } else {
      // Update timestamp sesi
      await supabase
        .from('chat_sessions')
        .update({ updated_at: new Date().toISOString(), ...(title ? { title } : {}) })
        .eq('id', sid)
        .eq('user_id', user.id);
    }

    // Insert pesan-pesan baru
    const rows = messages.map(m => ({
      session_id: sid,
      user_id: user.id,
      role: m.role,
      content: m.content,
      tokens: m.tokens || null,
    }));

    const { error: msgErr } = await supabase.from('messages').insert(rows);
    if (msgErr) return res.status(400).json({ error: msgErr.message });

    return res.status(201).json({ session_id: sid, saved: rows.length });
  }

  // ───── DELETE — hapus sesi ─────
  if (req.method === 'DELETE') {
    const { session_id } = req.body || req.query || {};

    if (!session_id) return res.status(400).json({ error: '`session_id` wajib diisi.' });

    // Hapus messages dulu (cascade), lalu session
    await supabase.from('messages').delete().eq('session_id', session_id).eq('user_id', user.id);
    const { error } = await supabase
      .from('chat_sessions').delete().eq('id', session_id).eq('user_id', user.id);

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ message: 'Sesi dihapus.' });
  }

  return res.status(405).json({ error: 'Method tidak didukung.' });
      }

