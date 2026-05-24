// api/ai.js  —  POST /api/ai  (powered by OpenAI)
// { ping: true }              → health check
// { system, messages: [...] } → conversa com histórico completo

const OPENAI_KEY  = process.env.OPENAI_API_KEY;
const MODEL       = 'gpt-4o-mini'; // rápido, barato, ótimo para produtividade
const MAX_TOKENS  = 1024;
const MAX_HISTORY = 20; // últimas 20 trocas (40 mensagens)

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
    if (!OPENAI_KEY) return json(res, 503, { ok: false, error: 'OPENAI_API_KEY não configurada na Vercel.' });
    return json(res, 200, { ok: true, model: MODEL });
  }

  // ── Chave obrigatória ─────────────────────────────────────────
  if (!OPENAI_KEY) {
    return json(res, 503, { ok: false, error: 'OPENAI_API_KEY não configurada na Vercel.' });
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

  // OpenAI: sistema vai como primeira mensagem com role "system"
  const systemMsg = system || 'Você é um assistente de produtividade integrado ao Driftask. Responda em português brasileiro de forma objetiva e útil.';

  const openaiMessages = [
    { role: 'system', content: systemMsg },
    ...history
  ];

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        messages:   openaiMessages,
      }),
    });

    const data = await r.json();

    if (!r.ok) {
      const errMsg = data?.error?.message || `Erro HTTP ${r.status}`;
      console.error('[ai] OpenAI error:', errMsg);
      return json(res, 502, { error: errMsg });
    }

    const reply = data.choices?.[0]?.message?.content?.trim() || '';
    if (!reply) return json(res, 502, { error: 'Resposta vazia da OpenAI.' });

    return json(res, 200, { ok: true, reply, model: MODEL });

  } catch (err) {
    console.error('[ai] fetch error:', err.message);
    return json(res, 502, { error: 'Falha de conexão: ' + err.message });
  }
}
