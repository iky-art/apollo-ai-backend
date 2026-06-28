// api/email.js — SMTP Email (konfirmasi, notifikasi, OTP)
// Pakai nodemailer via SMTP (Gmail, Mailtrap, dll)

import { supabase, verifyToken, getToken } from '../lib/supabase.js';

const ADMIN_EMAILS = ['gtau22609@gmail.com','kimlana269@gmail.com','kumenomikuroo@gmail.com'];

function cors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
}

// Kirim email via SMTP (pakai fetch ke SMTP relay / API)
async function sendEmail({ to, subject, html }){
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = process.env.SMTP_PORT || '587';
  const fromName = process.env.SMTP_FROM_NAME || 'Apollo AI';
  const fromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;

  if(!smtpUser||!smtpPass) throw new Error('SMTP belum dikonfigurasi.');

  // Gunakan Nodemailer via dynamic import
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.default.createTransport({
    host: smtpHost,
    port: Number(smtpPort),
    secure: smtpPort==='465',
    auth: { user: smtpUser, pass: smtpPass },
  });

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
  });
}

// Template email
function templateBase(title, body, btnText='', btnUrl=''){
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<style>
  body{font-family:'Segoe UI',sans-serif;background:#06060E;margin:0;padding:20px}
  .wrap{max-width:520px;margin:0 auto;background:#0E0C1A;border:1px solid #2A2545;border-radius:14px;overflow:hidden}
  .header{background:linear-gradient(135deg,#7C3AED,#06B6D4);padding:28px 32px;text-align:center}
  .header h1{color:#fff;font-size:22px;margin:0;font-weight:700}
  .header p{color:rgba(255,255,255,.8);font-size:12px;margin:6px 0 0}
  .body{padding:28px 32px;color:#F1F5F9}
  .body h2{font-size:18px;margin:0 0 12px;color:#fff}
  .body p{font-size:14px;line-height:1.7;color:#94A3B8;margin:0 0 16px}
  .otp{font-size:36px;font-weight:700;letter-spacing:10px;color:#fff;background:#1A1A2E;border:2px solid #7C3AED;border-radius:10px;padding:16px;text-align:center;margin:20px 0;font-family:monospace}
  .btn{display:block;background:linear-gradient(135deg,#7C3AED,#6D28D9);color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:600;font-size:14px;text-align:center;margin:20px 0}
  .footer{padding:16px 32px;text-align:center;font-size:11px;color:#475569;border-top:1px solid #1E1E2E}
</style></head>
<body><div class="wrap">
  <div class="header">
    <h1>✦ Apollo AI</h1>
    <p>Asisten AI Cerdas Indonesia</p>
  </div>
  <div class="body">
    <h2>${title}</h2>
    ${body}
    ${btnText&&btnUrl?`<a class="btn" href="${btnUrl}">${btnText}</a>`:''}
  </div>
  <div class="footer">© 2025 Apollo AI · Jangan balas email ini · <a href="https://apollo-ai-nine.vercel.app" style="color:#7C3AED">apollo-ai-nine.vercel.app</a></div>
</div></body></html>`;
}

// Generate OTP 6 digit
function genOTP(){ return Math.floor(100000 + Math.random() * 900000).toString(); }

export default async function handler(req,res){
  cors(res);
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).json({error:'Gunakan POST.'});

  const { action, email, name } = req.body||{};
  if(!action||!email) return res.status(400).json({error:'action dan email wajib.'});

  // ── Kirim OTP verifikasi ──
  if(action==='send_otp'){
    const otp = genOTP();
    const expiresAt = new Date(Date.now() + 10*60*1000).toISOString(); // 10 menit

    // Simpan OTP ke Supabase
    await supabase.from('email_otps').upsert({
      email,
      otp,
      expires_at: expiresAt,
      used: false,
    },{ onConflict:'email' });

    try{
      await sendEmail({
        to: email,
        subject: 'Kode OTP Apollo AI',
        html: templateBase(
          `Halo${name?', '+name:''}! 👋`,
          `<p>Gunakan kode OTP berikut untuk verifikasi akun kamu di Apollo AI:</p>
           <div class="otp">${otp}</div>
           <p>Kode berlaku selama <strong>10 menit</strong>. Jangan bagikan kode ini kepada siapapun.</p>
           <p style="font-size:12px;color:#64748B">Jika kamu tidak meminta kode ini, abaikan email ini.</p>`
        ),
      });
      return res.status(200).json({message:'OTP terkirim ke email kamu.'});
    } catch(e){
      return res.status(500).json({error:'Gagal kirim email: '+e.message});
    }
  }

  // ── Verifikasi OTP ──
  if(action==='verify_otp'){
    const { otp } = req.body||{};
    if(!otp) return res.status(400).json({error:'OTP wajib diisi.'});

    const { data, error } = await supabase
      .from('email_otps')
      .select('*')
      .eq('email', email)
      .eq('otp', otp)
      .eq('used', false)
      .single();

    if(error||!data) return res.status(400).json({error:'OTP salah atau tidak ditemukan.'});
    if(new Date(data.expires_at) < new Date()) return res.status(400).json({error:'OTP sudah kedaluwarsa.'});

    // Tandai sudah dipakai
    await supabase.from('email_otps').update({used:true}).eq('email',email);

    return res.status(200).json({message:'OTP valid.',verified:true});
  }

  // ── Kirim email konfirmasi registrasi ──
  if(action==='confirm_register'){
    const frontendUrl = process.env.URL_FRONT_END||'https://apollo-ai-nine.vercel.app';
    try{
      await sendEmail({
        to: email,
        subject: 'Selamat datang di Apollo AI! 🎉',
        html: templateBase(
          `Selamat datang, ${name||'Pengguna'}! 🎉`,
          `<p>Akun Apollo AI kamu berhasil dibuat. Kamu sekarang bisa menikmati semua fitur AI canggih Apollo AI secara gratis!</p>
           <p><strong>Email:</strong> ${email}</p>
           <p>Mulai chat dengan AI sekarang dan rasakan pengalaman terbaik!</p>`,
          '🚀 Mulai Chat Sekarang',
          frontendUrl
        ),
      });
      return res.status(200).json({message:'Email konfirmasi terkirim.'});
    } catch(e){
      return res.status(500).json({error:'Gagal kirim email: '+e.message});
    }
  }

  // ── Kirim email upgrade Pro ──
  if(action==='confirm_pro'){
    const token = getToken(req);
    const user = token ? await verifyToken(token) : null;
    try{
      await sendEmail({
        to: email,
        subject: '🎉 Akun kamu sudah upgrade ke Pro!',
        html: templateBase(
          'Selamat, kamu sekarang Pro! 💎',
          `<p>Halo ${name||''}! Akun Apollo AI kamu berhasil diupgrade ke <strong>Pro</strong>.</p>
           <p>Kamu sekarang mendapatkan:</p>
           <ul style="color:#94A3B8;font-size:14px;line-height:2">
             <li>✅ Limit chat 60 request/menit (4x lebih banyak)</li>
             <li>✅ Prioritas akses ke model AI terbaru</li>
             <li>✅ Fitur eksklusif Pro</li>
           </ul>`,
          '✦ Buka Apollo AI',
          process.env.URL_FRONT_END||'https://apollo-ai-nine.vercel.app'
        ),
      });
      return res.status(200).json({message:'Email Pro terkirim.'});
    } catch(e){
      return res.status(500).json({error:'Gagal kirim email: '+e.message});
    }
  }

  // ── Broadcast email ke semua user (admin only) ──
  if(action==='broadcast'){
    const token = getToken(req);
    const user = token ? await verifyToken(token) : null;
    if(!user||!ADMIN_EMAILS.includes(user.email))
      return res.status(403).json({error:'Hanya admin.'});

    const { subject, html_body, target_plan } = req.body||{};
    if(!subject||!html_body) return res.status(400).json({error:'subject dan html_body wajib.'});

    let query = supabase.from('users').select('email,name');
    if(target_plan) query = query.eq('plan',target_plan);
    const { data:users } = await query;

    let sent=0, failed=0;
    for(const u of (users||[])){
      try{
        await sendEmail({
          to: u.email,
          subject,
          html: templateBase('Pesan dari Apollo AI',`<p>${html_body}</p>`),
        });
        sent++;
        // Delay kecil antar email
        await new Promise(r=>setTimeout(r,200));
      } catch(e){ failed++; }
    }

    return res.status(200).json({message:`Broadcast selesai. Terkirim: ${sent}, Gagal: ${failed}`});
  }

  return res.status(400).json({error:'Action tidak valid.'});
}
