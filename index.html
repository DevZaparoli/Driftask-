// api/ai.js  —  POST /api/ai
// Proxy seguro: ANTHROPIC_API_KEY fica na variável de ambiente, nunca no browser
// Body: { ping:true }  →  health check
//       { system, message }  →  chat com Claude Haiku

import jwt from 'jsonwebtoken';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const JWT_SECRET    = process.env.JWT_SECRET;
const MODEL         = 'claude-haiku-4-5-20251001';
const MAX_TOKENS    = 1024;

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(body));
}

function tryGetUser(req) {
  try {
    const auth = (req.headers['authorization'] || '').replace('Bearer ', '');
    if (!auth || !JWT_SECRET) return null;
    return jwt.verify(auth, JWT_SECRET);
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return json(res, 405, { error: 'Método não permitido.' });

  // ── Health check ──────────────────────────────────────────
  if (req.body?.ping) {
    if (!ANTHROPIC_KEY) return json(res, 503, { ok: false, error: 'ANTHROPIC_API_KEY não configurada.' });
    return json(res, 200, { ok: true, model: MODEL, provider: 'Anthropic Claude' });
  }

  // ── Chave obrigatória ─────────────────────────────────────
  if (!ANTHROPIC_KEY) {
    return json(res, 503, {
      ok: false, fallback: true,
      error: 'ANTHROPIC_API_KEY ausente. Configure nas variáveis de ambiente do Vercel.'
    });
  }

  const { system, message } = req.body || {};
  if (!message || typeof message !== 'string') {
    return json(res, 400, { error: 'Campo "message" é obrigatório.' });
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        system:     system || 'Você é um assistente de produtividade. Responda em português brasileiro.',
        messages:   [{ role: 'user', content: message.slice(0, 3000) }]
      })
    });

    const data = await r.json();

    if (!r.ok) {
      console.error('[ai] Anthropic error:', JSON.stringify(data));
      return json(res, 502, { error: data?.error?.message || 'Erro na API Anthropic.', fallback: true });
    }

    const reply = data.content?.map(b => b.text || '').join('') || '';
    return json(res, 200, { ok: true, reply, model: MODEL });

  } catch (err) {
    console.error('[ai] fetch error:', err.message);
    return json(res, 502, { error: 'Falha de conexão com Anthropic.', fallback: true });
  }
}
