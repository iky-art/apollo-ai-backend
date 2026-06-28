// api/promo.js — Sistem kode promo Pro

import { supabase, verifyToken, getToken } from '../lib/supabase.js';

const ADMIN_EMAILS = ['gtau22609@gmail.com','kimlana269@gmail.com','kumenomikuroo@gmail.com'];

function cors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
}

async function requireAuth(req,res){
  const token = getToken(req);
  if(!token){ res.status(401).json({error:'Token tidak ada.'}); return null; }
  const user = await verifyToken(token);
  if(!user){ res.status(401).json({error:'Token tidak valid.'}); return null; }
  return user;
}

// Generate kode random
function genCode(prefix='APOLLO'){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = (n) => Array.from({length:n},()=>chars[Math.floor(Math.random()*chars.length)]).join('');
  return `${prefix}-${rand(4)}-${rand(4)}-${rand(4)}`;
}

export default async function handler(req,res){
  cors(res);
  if(req.method==='OPTIONS') return res.status(200).end();

  const user = await requireAuth(req,res);
  if(!user) return;

  const isAdmin = ADMIN_EMAILS.includes(user.email);

  // ── POST /api/promo ──
  if(req.method==='POST'){
    const { action, code, max_uses, expires_days, prefix } = req.body||{};

    // Admin: generate kode baru
    if(action==='generate'){
      if(!isAdmin) return res.status(403).json({error:'Hanya admin.'});
      const newCode = genCode(prefix||'APOLLO-PRO');
      const expiresAt = expires_days
        ? new Date(Date.now() + expires_days*24*60*60*1000).toISOString()
        : null;
      const { data, error } = await supabase.from('promo_codes').insert({
        code: newCode,
        type: 'pro',
        max_uses: max_uses||1,
        uses: 0,
        expires_at: expiresAt,
        created_by: user.id,
      }).select().single();
      if(error) return res.status(400).json({error:error.message});
      return res.status(201).json({ code: data.code, message:'Kode berhasil dibuat.' });
    }

    // User: redeem kode
    if(action==='redeem'){
      if(!code) return res.status(400).json({error:'Kode wajib diisi.'});

      // Cek kode valid
      const { data: promo, error: pe } = await supabase
        .from('promo_codes')
        .select('*')
        .eq('code', code.toUpperCase().trim())
        .single();

      if(pe||!promo) return res.status(404).json({error:'Kode tidak ditemukan atau tidak valid.'});
      if(promo.expires_at && new Date(promo.expires_at) < new Date())
        return res.status(400).json({error:'Kode sudah kedaluwarsa.'});
      if(promo.uses >= promo.max_uses)
        return res.status(400).json({error:'Kode sudah habis digunakan.'});

      // Cek user sudah pakai kode ini
      const { data: existing } = await supabase
        .from('promo_uses')
        .select('id')
        .eq('promo_id', promo.id)
        .eq('user_id', user.id)
        .single();
      if(existing) return res.status(400).json({error:'Kamu sudah pernah menggunakan kode ini.'});

      // Cek user sudah Pro
      const { data: userData } = await supabase
        .from('users').select('plan').eq('id',user.id).single();
      if(userData?.plan==='pro')
        return res.status(400).json({error:'Kamu sudah memiliki akun Pro!'});

      // Upgrade ke Pro
      await supabase.from('users').update({plan:'pro'}).eq('id',user.id);

      // Catat penggunaan
      await supabase.from('promo_uses').insert({
        promo_id: promo.id,
        user_id: user.id,
      });

      // Update jumlah uses
      await supabase.from('promo_codes').update({uses: promo.uses+1}).eq('id',promo.id);

      return res.status(200).json({
        message:'🎉 Selamat! Akun kamu berhasil diupgrade ke Pro!',
        plan:'pro',
      });
    }

    return res.status(400).json({error:'Action tidak valid.'});
  }

  // ── GET /api/promo — Admin: lihat semua kode ──
  if(req.method==='GET'){
    if(!isAdmin) return res.status(403).json({error:'Hanya admin.'});
    const { data, error } = await supabase
      .from('promo_codes')
      .select('*, promo_uses(count)')
      .order('created_at',{ascending:false});
    if(error) return res.status(400).json({error:error.message});
    return res.status(200).json({codes: data});
  }

  return res.status(405).json({error:'Method tidak didukung.'});
}
