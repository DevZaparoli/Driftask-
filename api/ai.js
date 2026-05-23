// api/ai.js  —  POST /api/ai
// Body: { ping: true }               → health check
//       { system, messages: [...] }  → conversa com histórico completo

import jwt from 'jsonwebtoken';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const JWT_SECRET    = process.env.JWT_SECRET;
const MODEL         = 'claude-haiku-4-5-20251001';
const MAX_TOKENS    = 1024;
const MAX_HISTORY   = 20; // máximo de trocas (40 mensagens) para não estourar contexto

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(body));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return json(res, 405, { error: 'Método não permitido.' });

  // ── Health check ──────────────────────────────────────────────────────────
  if (req.body?.ping) {
    if (!ANTHROPIC_KEY) return json(res, 503, { ok: false, error: 'ANTHROPIC_API_KEY não configurada.' });
    return json(res, 200, { ok: true, model: MODEL });
  }

  // ── Chave obrigatória ─────────────────────────────────────────────────────
  if (!ANTHROPIC_KEY) {
    return json(res, 503, { ok: false, fallback: true, error: 'ANTHROPIC_API_KEY ausente.' });
  }

  const { system, messages, message } = req.body || {};

  // Suporta tanto { messages: [...] } (novo, com histórico) quanto { message: '...' } (legado)
  let history = [];
  if (Array.isArray(messages) && messages.length > 0) {
    // Valida e sanitiza o histórico
    history = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: String(m.content).slice(0, 3000) }))
      .slice(-(MAX_HISTORY * 2)); // mantém apenas as últimas N trocas
  } else if (typeof message === 'string' && message.trim()) {
    history = [{ role: 'user', content: message.slice(0, 3000) }];
  } else {
    return json(res, 400, { error: 'Campo "messages" ou "message" é obrigatório.' });
  }

  // Garante que começa com 'user' e alterna corretamente (requirement da API Anthropic)
  if (history[0]?.role !== 'user') {
    return json(res, 400, { error: 'O histórico deve começar com uma mensagem do usuário.' });
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
        system:     system || 'Você é um assistente de produtividade integrado ao Driftask. Responda em português brasileiro, de forma objetiva.',
        messages:   history,
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
