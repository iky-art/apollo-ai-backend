// api/user.js — Profil & update data user (butuh token)

import { supabase, verifyToken, getToken } from '../lib/supabase.js';

function cors(res, req) {
  const allowed = process.env.URL_FRONT_END || '*';
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
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

  // ───── GET profil ─────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, plan, chat_count, avatar_url, created_at')
      .eq('id', user.id)
      .single();

    if (error) return res.status(404).json({ error: 'User tidak ditemukan.' });
    return res.status(200).json({ user: data });
  }

  // ───── PATCH update profil ─────
  if (req.method === 'PATCH') {
    const { name, avatar_url } = req.body || {};
    const updates = {};
    if (name?.trim())   updates.name = name.trim();
    if (avatar_url)     updates.avatar_url = avatar_url;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Tidak ada field yang diupdate.' });
    }

    const { data, error } = await supabase
      .from('users').update(updates).eq('id', user.id).select().single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ user: data, message: 'Profil diperbarui.' });
  }

  // ───── DELETE akun ─────
  if (req.method === 'DELETE') {
    // Hapus dari auth
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) return res.status(500).json({ error: 'Gagal hapus akun: ' + error.message });

    return res.status(200).json({ message: 'Akun berhasil dihapus.' });
  }

  return res.status(405).json({ error: 'Method tidak didukung.' });
}

