// api/jailbreak.js — Kelola jailbreak logs + ban manual dari admin

import { supabase, verifyToken, getToken } from '../lib/supabase.js';

const ADMIN_EMAILS = ['gtau22609@gmail.com', 'kimlana269@gmail.com', 'kumenomikuroo@gmail.com'];

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function requireAdmin(req, res) {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: 'Token tidak ada.' }); return null; }
  const user = await verifyToken(token);
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    res.status(403).json({ error: 'Akses ditolak. Hanya admin.' });
    return null;
  }
  return user;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  // GET — ambil semua log jailbreak
  if (req.method === 'GET') {
    const { risk, limit = 100 } = req.query || {};
    let query = supabase
      .from('jailbreak_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Number(limit));

    if (risk) query = query.eq('risk', risk);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    return res.status(200).json({ logs: data, total: data.length });
  }

  // POST — ban user dari jailbreak log
  if (req.method === 'POST') {
    const { action, user_id, log_id } = req.body || {};

    // Ban user
    if (action === 'ban' && user_id) {
      const { error } = await supabase
        .from('users')
        .update({ is_banned: true })
        .eq('id', user_id);

      if (error) return res.status(400).json({ error: error.message });

      // Log aksi admin
      await supabase.from('jailbreak_logs').insert({
        user_id,
        message: `[MANUAL BAN] oleh admin: ${admin.email}`,
        risk: 'manual_ban',
        patterns: ['manual_ban'],
        score: 999,
      }).catch(() => {});

      return res.status(200).json({ message: 'User berhasil di-ban.' });
    }

    // Unban user
    if (action === 'unban' && user_id) {
      const { error } = await supabase
        .from('users')
        .update({ is_banned: false })
        .eq('id', user_id);

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ message: 'User berhasil di-unban.' });
    }

    // Dismiss log
    if (action === 'dismiss' && log_id) {
      const { error } = await supabase
        .from('jailbreak_logs')
        .delete()
        .eq('id', log_id);

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ message: 'Log dihapus.' });
    }

    return res.status(400).json({ error: 'Action tidak valid.' });
  }

  // DELETE — hapus semua log
  if (req.method === 'DELETE') {
    const { error } = await supabase
      .from('jailbreak_logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ message: 'Semua log dihapus.' });
  }

  return res.status(405).json({ error: 'Method tidak didukung.' });
}
