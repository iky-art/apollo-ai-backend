// api/transcribe.js — Voice to Text via Groq Whisper

import { verifyToken, getToken } from '../lib/supabase.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

function cors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res){
  cors(res);
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).json({error:'Gunakan POST.'});

  const apiKey = process.env.GROQ_API_KEY;
  if(!apiKey) return res.status(500).json({error:'GROQ_API_KEY tidak ada.'});

  try{
    // Baca raw body sebagai buffer
    const chunks = [];
    for await(const chunk of req){ chunks.push(chunk); }
    const rawBody = Buffer.concat(chunks);

    // Ambil content-type dari request untuk forward ke Groq
    const contentType = req.headers['content-type']||'';
    if(!contentType.includes('multipart/form-data')){
      return res.status(400).json({error:'Content-Type harus multipart/form-data.'});
    }

    // Forward langsung ke Groq Whisper
    const groqRes = await fetch(GROQ_URL,{
      method:'POST',
      headers:{
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': contentType,
      },
      body: rawBody,
    });

    const data = await groqRes.json();
    if(!groqRes.ok){
      return res.status(groqRes.status).json({error: data?.error?.message||'Groq Whisper error.'});
    }

    return res.status(200).json({
      text: data.text||'',
      language: data.language||'id',
    });

  } catch(e){
    console.error('[transcribe]', e.message);
    return res.status(500).json({error:'Gagal proses audio: '+e.message});
  }
}
