// api/ai.js  —  POST /api/ai  (powered by Groq — gratuito)
// { ping: true }              → health check
// { system, messages: [...] } → conversa com histórico completo

const GROQ_KEY   = process.env.GROQ_API_KEY;

const _ORIGIN = process.env.ALLOWED_ORIGIN || 'https://driftask.vercel.app';
const MODEL      = 'llama-3.3-70b-versatile';
const MAX_TOKENS = 1024;
const MAX_HIST   = 20;
const TIMEOUT_MS = 25000; // Groq é rápido — 25s é mais que suficiente

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(body));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', _ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return json(res, 405, { error: 'Método não permitido.' });

  // ── Health check ──────────────────────────────────────────────
  if (req.body?.ping) {
    if (!GROQ_KEY) return json(res, 503, { ok: false, error: 'GROQ_API_KEY não configurada na Vercel.' });
    return json(res, 200, { ok: true, model: MODEL });
  }

  if (!GROQ_KEY) {
    return json(res, 503, { ok: false, error: 'GROQ_API_KEY não configurada na Vercel.' });
  }

  const { system, messages, message } = req.body || {};

  let history = [];
  if (Array.isArray(messages) && messages.length > 0) {
    history = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: String(m.content).slice(0, 3000) }))
      .slice(-(MAX_HIST * 2));
  } else if (typeof message === 'string' && message.trim()) {
    history = [{ role: 'user', content: message.slice(0, 3000) }];
  } else {
    return json(res, 400, { error: 'Envie "messages" (array) ou "message" (string).' });
  }

  const systemMsg = system || 'Você é uma IA assistente de uso geral integrada ao Driftask. Responda qualquer pergunta em português brasileiro de forma clara e útil.';

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      signal:  controller.signal,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model:       MODEL,
        max_tokens:  MAX_TOKENS,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemMsg },
          ...history
        ],
      }),
    });

    clearTimeout(timeoutId);
    const data = await r.json();

    if (!r.ok) {
      const errMsg = data?.error?.message || `Erro HTTP ${r.status}`;
      console.error('[ai] Groq error:', errMsg);
      return json(res, 502, { error: errMsg });
    }

    const reply = data.choices?.[0]?.message?.content?.trim() || '';
    if (!reply) return json(res, 502, { error: 'Resposta vazia do Groq.' });

    return json(res, 200, { ok: true, reply, model: MODEL });

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return json(res, 504, { error: 'A IA demorou demais para responder. Tente novamente.' });
    }
    console.error('[ai] fetch error:', err.message);
    return json(res, 502, { error: 'Erro ao conectar com o Groq: ' + err.message });
  }
}
