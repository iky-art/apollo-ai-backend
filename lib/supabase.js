// lib/supabase.js — Koneksi Supabase (Service Role)
import { createClient } from '@supabase/supabase-js';

// Validasi env — tidak throw, supaya tidak crash saat cold start
const SUPABASE_URL_VAL = process.env.SUPABASE_URL;
const SUPABASE_KEY_VAL = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL_VAL || !SUPABASE_KEY_VAL) {
  console.error('[supabase] WARNING: SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY tidak ada!');
}

// Service Role — bypass RLS, hanya dipakai di server!
export const supabase = createClient(
  SUPABASE_URL_VAL || '',
  SUPABASE_KEY_VAL || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Helper: verifikasi JWT token dari user
export async function verifyToken(token) {
  if (!token) return null;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

// Helper: ambil token dari header Authorization
export function getToken(req) {
  const auth = req.headers['authorization'] || '';
  return auth.replace('Bearer ', '').trim() || null;
}
