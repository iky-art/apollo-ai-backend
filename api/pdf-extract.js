// api/pdf-extract.js — Extract teks dari PDF (text-based) atau OCR via Groq Vision (scan)

import { verifyToken, getToken } from '../lib/supabase.js';

export const config = { api: { bodyParser: false } };

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Parse multipart/form-data manual (tanpa library tambahan)
async function parseMultipart(req) {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch) throw new Error('Content-Type bukan multipart/form-data');
  const boundary = '--' + boundaryMatch[1];

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);

  const boundaryBuf = Buffer.from(boundary);
  const parts = [];
  let start = buffer.indexOf(boundaryBuf);
  while (start !== -1) {
    const next = buffer.indexOf(boundaryBuf, start + boundaryBuf.length);
    if (next === -1) break;
    parts.push(buffer.slice(start + boundaryBuf.length, next));
    start = next;
  }

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const header = part.slice(0, headerEnd).toString();
    if (header.includes('filename=')) {
      const filenameMatch = header.match(/filename="(.+?)"/);
      const filename = filenameMatch ? filenameMatch[1] : 'file.pdf';
      let content = part.slice(headerEnd + 4);
      // Hapus trailing \r\n
      if (content.slice(-2).toString() === '\r\n') content = content.slice(0, -2);
      return { filename, buffer: content };
    }
  }
  throw new Error('File tidak ditemukan di form-data');
}

// Extract teks dari PDF buffer secara manual (basic parser tanpa library eksternal)
function extractTextFromPdfBuffer(buffer) {
  const str = buffer.toString('latin1');
  const textChunks = [];

  // Cari semua text object dalam stream PDF: pola (text) Tj  atau  [(text)...] TJ
  const tjRegex = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
  const tjArrayRegex = /\[((?:[^\[\]]|\\.)*)\]\s*TJ/g;

  let m;
  while ((m = tjRegex.exec(str)) !== null) {
    textChunks.push(decodePdfString(m[1]));
  }
  while ((m = tjArrayRegex.exec(str)) !== null) {
    const inner = m[1];
    const innerRegex = /\(((?:[^()\\]|\\.)*)\)/g;
    let im;
    while ((im = innerRegex.exec(inner)) !== null) {
      textChunks.push(decodePdfString(im[1]));
    }
  }

  // Hitung jumlah halaman (cari /Type /Page)
  const pageMatches = str.match(/\/Type\s*\/Page[^s]/g) || [];

  return {
    text: textChunks.join(' ').replace(/\s+/g, ' ').trim(),
    pages: pageMatches.length || 1,
  };
}

function decodePdfString(s) {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, ' ')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan POST.' });

  try {
    const { filename, buffer } = await parseMultipart(req);

    if (!filename.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ error: 'File harus berformat PDF.' });
    }

    if (buffer.length > 15 * 1024 * 1024) {
      return res.status(400).json({ error: 'Ukuran file maksimal 15MB.' });
    }

    const { text, pages } = extractTextFromPdfBuffer(buffer);

    // Kalau teks yang terextract terlalu sedikit, kemungkinan PDF hasil scan (gambar)
    if (text.length < 50) {
      return res.status(200).json({
        text: '⚠️ PDF ini sepertinya berupa hasil scan/gambar dan tidak memiliki teks yang bisa diextract langsung. Fitur OCR untuk PDF scan akan segera hadir. Untuk saat ini, silakan gunakan PDF yang berisi teks asli (bukan hasil scan).',
        pages,
        isScanned: true,
      });
    }

    return res.status(200).json({
      text,
      pages,
      filename,
      isScanned: false,
    });

  } catch (e) {
    console.error('[pdf-extract]', e.message);
    return res.status(500).json({ error: 'Gagal memproses PDF: ' + e.message });
  }
      }
          
