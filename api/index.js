// api/index.js — Health check & info endpoint

export default function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const origin = process.env.URL_FRONT_END || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);

  res.status(200).json({
    status: 'ok',
    name: 'Apollo AI Backend',
    version: '2.0.0',
    endpoints: [
      'POST /api/chat      — Chat AI (Groq)',
      'POST /api/auth      — Login & Register',
      'GET  /api/user      — Profil user (butuh token)',
      'PATCH /api/user     — Update profil',
      'GET  /api/history   — Riwayat chat',
      'POST /api/history   — Simpan sesi chat',
      'DELETE /api/history — Hapus sesi chat',
    ],
    timestamp: new Date().toISOString(),
  });
}
