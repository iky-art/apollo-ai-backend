// lib/supabase.js — Koneksi Supabase (Service Role)
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL) throw new Error('SUPABASE_URL tidak ada di env');
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY tidak ada di env');

// Service Role — bypass RLS, hanya dipakai di server!
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
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

