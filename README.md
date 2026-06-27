# Apollo AI — Backend

Backend serverless untuk Apollo AI. Di-deploy di **Vercel** menggunakan Node.js serverless functions.

---

## Struktur

```
apollo-ai-backend/
├── api/
│   ├── index.js      → Health check
│   ├── chat.js       → Chat AI + Jailbreak Detection + Rate Limit
│   ├── auth.js       → Login, Register, Refresh Token
│   ├── user.js       → Profil user (GET, PATCH, DELETE)
│   └── history.js    → Riwayat chat (GET, POST, DELETE)
├── lib/
│   ├── supabase.js   → Koneksi Supabase (service role)
│   └── ai.js         → Koneksi Groq + Jailbreak detector
├── package.json
├── vercel.json
├── .gitignore
└── README.md
```

---

## Environment Variables

> ⚠️ **JANGAN commit `.env` ke GitHub!**
> Pasang langsung di **Vercel Dashboard → Settings → Environment Variables**

Hubungi admin untuk informasi konfigurasi environment.

---

## Setup & Deploy

```bash
# 1. Clone repo
git clone https://github.com/USERNAME/apollo-ai-backend.git
cd apollo-ai-backend

# 2. Install dependencies
npm install

# 3. Jalankan lokal (buat file .env dulu)
npx vercel dev

# 4. Deploy production
vercel --prod
```

---

## Endpoints

### `GET /` — Health Check
```json
{ "status": "ok", "name": "Apollo AI Backend", "version": "2.0.0" }
```

---

### `POST /api/chat` — Chat AI
Header: `Authorization: Bearer <token>` (opsional, tanpa login rate limit lebih ketat)

**Body:**
```json
{
  "messages": [{ "role": "user", "content": "Halo!" }],
  "system": "Kamu adalah Apollo AI.",
  "model": "llama-3.3-70b-versatile",
  "max_tokens": 2048
}
```
**Response:**
```json
{ "reply": "Halo! Ada yang bisa saya bantu?", "model": "...", "usage": {} }
```
**Jailbreak terdeteksi (high/med):**
```json
{ "error": "Pesan kamu melanggar kebijakan.", "jailbreak": true, "risk": "high" }
```

---

### `POST /api/auth` — Login / Register / Refresh

**Login:**
```json
{ "action": "login", "email": "user@mail.com", "password": "123456" }
```
**Register:**
```json
{ "action": "register", "email": "user@mail.com", "password": "123456", "name": "Budi" }
```
**Refresh Token:**
```json
{ "action": "refresh", "email": "-", "refresh_token": "..." }
```

---

### `GET /api/user` — Profil User
Header: `Authorization: Bearer <token>`

### `PATCH /api/user` — Update Profil
```json
{ "name": "Nama Baru", "avatar_url": "https://..." }
```

### `DELETE /api/user` — Hapus Akun

---

### `GET /api/history` — Daftar Sesi Chat
Header: `Authorization: Bearer <token>`

**Dengan session_id (ambil pesan):**
`GET /api/history?session_id=uuid`

### `POST /api/history` — Simpan Pesan
```json
{
  "session_id": "uuid-atau-null",
  "title": "Judul sesi",
  "messages": [
    { "role": "user", "content": "Halo" },
    { "role": "assistant", "content": "Halo juga!" }
  ]
}
```

### `DELETE /api/history` — Hapus Sesi
```json
{ "session_id": "uuid" }
```

---

## Rate Limit

| Tipe User | Limit |
|-----------|-------|
| Tanpa login | 5 req/menit |
| Free | 15 req/menit |
| Pro | 60 req/menit |

---

## Jailbreak Detection

Otomatis mendeteksi percobaan bypass AI. Level risiko:
- 🔴 **High** — diblokir + log ke Supabase
- 🟡 **Med** — diblokir + log
- 🔵 **Low** — diteruskan + warning di response

---

*Apollo AI Indonesia — © 2025*
