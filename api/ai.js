// api/ai.js  —  POST /api/ai
// { ping: true }              → health check
// { system, messages: [...] } → conversa com histórico

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL         = 'claude-haiku-4-5-20251001';
const MAX_TOKENS    = 1024;
const MAX_HISTORY   = 20; // últimas 20 trocas (40 mensagens)

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

  // ── Health check ──────────────────────────────────────────────
  if (req.body?.ping) {
    if (!ANTHROPIC_KEY) return json(res, 503, { ok: false, error: 'ANTHROPIC_API_KEY não configurada.' });
    return json(res, 200, { ok: true, model: MODEL });
  }

  // ── Chave obrigatória ─────────────────────────────────────────
  if (!ANTHROPIC_KEY) {
    return json(res, 503, { ok: false, fallback: true, error: 'ANTHROPIC_API_KEY ausente.' });
  }

  const { system, messages, message } = req.body || {};

  // Aceita { messages:[...] } com histórico OU { message:'...' } legado
  let history = [];
  if (Array.isArray(messages) && messages.length > 0) {
    history = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: String(m.content).slice(0, 3000) }))
      .slice(-(MAX_HISTORY * 2));
  } else if (typeof message === 'string' && message.trim()) {
    history = [{ role: 'user', content: message.slice(0, 3000) }];
  } else {
    return json(res, 400, { error: 'Envie "messages" (array) ou "message" (string).' });
  }

  // API Anthropic exige: começa com 'user', alterna user/assistant
  history = history.filter((m, i, a) => i === 0 || m.role !== a[i - 1].role);
  if (history[0]?.role !== 'user') {
    return json(res, 400, { error: 'O histórico deve começar com mensagem do usuário.' });
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
        system:     system || 'Você é um assistente de produtividade integrado ao Driftask. Responda em português brasileiro de forma objetiva e útil.',
        messages:   history,
      }),
    });

    const data = await r.json();

    if (!r.ok) {
      const errMsg = data?.error?.message || `HTTP ${r.status}`;
      console.error('[ai] Anthropic error:', errMsg);
      return json(res, 502, { error: errMsg, fallback: false });
    }

    const reply = (data.content || []).map(b => b.text || '').join('').trim();
    if (!reply) return json(res, 502, { error: 'Resposta vazia da API.', fallback: false });

    return json(res, 200, { ok: true, reply, model: MODEL });

  } catch (err) {
    console.error('[ai] fetch error:', err.message);
    return json(res, 502, { error: 'Falha de conexão: ' + err.message, fallback: false });
  }
}
