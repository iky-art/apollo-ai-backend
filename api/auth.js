// api/auth.js — Login & Register via Supabase

import { supabase } from '../lib/supabase.js';

function cors(res, req) {
  const allowed = process.env.URL_FRONT_END || '*';
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan POST.' });

  const { action, email, password, name } = req.body || {};

  if (!action) return res.status(400).json({ error: 'Field `action` wajib (login/register/logout).' });
  if (!email)  return res.status(400).json({ error: 'Email wajib diisi.' });

  // ───── LOGIN ─────
  if (action === 'login') {
    if (!password) return res.status(400).json({ error: 'Password wajib diisi.' });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message });

    // Cek ban status
    const { data: userData } = await supabase
      .from('users').select('plan,is_banned,name').eq('id', data.user.id).single();

    if (userData?.is_banned) {
      return res.status(403).json({ error: 'Akun kamu telah dibanned. Hubungi admin.' });
    }

    return res.status(200).json({
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: userData?.name || data.user.user_metadata?.name || email.split('@')[0],
        plan: userData?.plan || 'free',
      },
    });
  }

  // ───── REGISTER ─────
  if (action === 'register') {
    if (!password) return res.status(400).json({ error: 'Password wajib diisi.' });
    if (!name)     return res.status(400).json({ error: 'Nama wajib diisi.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter.' });

    // Buat user di Supabase Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      email_confirm: false,
    });
    if (error) return res.status(400).json({ error: error.message });

    // Insert ke tabel public.users
    await supabase.from('users').insert({
      id: data.user.id,
      email,
      name,
      plan: 'free',
    }).catch(() => {});

    // Auto login setelah register
    const { data: session } = await supabase.auth.signInWithPassword({ email, password });

    return res.status(201).json({
      message: 'Akun berhasil dibuat!',
      token: session?.session?.access_token || null,
      user: { id: data.user.id, email, name, plan: 'free' },
    });
  }

  // ───── REFRESH TOKEN ─────
  if (action === 'refresh') {
    const { refresh_token } = req.body || {};
    if (!refresh_token) return res.status(400).json({ error: 'refresh_token wajib.' });

    const { data, error } = await supabase.auth.refreshSession({ refresh_token });
    if (error) return res.status(401).json({ error: 'Token expired, silakan login ulang.' });

    return res.status(200).json({
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    });
  }

  return res.status(400).json({ error: `Action tidak dikenal: ${action}` });
      }
      
