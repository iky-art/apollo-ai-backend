// lib/ai.js — Koneksi AI via Groq (OpenAI-compatible)

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Jailbreak patterns — sinkron dengan admin panel
const JB_PATTERNS = [
  'ignore previous', 'ignore all instructions', 'forget your instructions',
  'you are now', 'act as', 'pretend you are', 'jailbreak', 'dan mode',
  'developer mode', 'do anything now', 'bypass', 'override', 'disregard',
  'system prompt', 'you have no restrictions', 'no rules', 'unlimited',
  'unlock', 'evil mode', 'opposite mode', 'sudo', 'root access',
  'hypothetically', 'for educational purposes', 'roleplay as',
  'simulate', 'without filters',
];

// Deteksi jailbreak — return { detected, risk, patterns }
export function detectJailbreak(text = '') {
  const lower = text.toLowerCase();
  let score = 0;
  const matched = [];

  JB_PATTERNS.forEach(p => {
    if (lower.includes(p)) {
      score += p.split(' ').length > 1 ? 3 : 1;
      matched.push(p);
    }
  });

  if (score === 0) return { detected: false };

  return {
    detected: true,
    risk: score >= 5 ? 'high' : score >= 2 ? 'med' : 'low',
    patterns: matched,
    score,
  };
}

// Kirim pesan ke Groq
export async function sendToAI({ messages, system, model, max_tokens, temperature }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY tidak ada di env');

  const finalMessages = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages;

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || process.env.DEFAULT_MODEL || 'llama-3.3-70b-versatile',
      messages: finalMessages,
      max_tokens: max_tokens || 2048,
      temperature: temperature ?? 0.7,
      stream: false,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Error dari Groq');

  return {
    reply: data.choices?.[0]?.message?.content || '',
    usage: data.usage,
    model: data.model,
  };
}

