const express  = require('express');
const cors     = require('cors');
const fetch    = require('node-fetch');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

// Permite chamadas do seu frontend hospedado
// Troque pela URL real do seu frontend após hospedar
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',');

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Origem não permitida pelo CORS'));
    }
  }
}));

app.use(express.json({ limit: '10kb' }));

// Health check
app.get('/', (req, res) => res.json({ status: 'ok', service: 'Driftask AI Proxy' }));

// Proxy para a API da Anthropic
app.post('/api/ai', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor.' });
  }

  const { system, messages, max_tokens = 1000 } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Campo "messages" é obrigatório e deve ser um array.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens,
        system,
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Erro na API da Anthropic.' });
    }

    res.json(data);

  } catch (err) {
    console.error('Erro ao chamar a API:', err);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.listen(PORT, () => console.log(`Driftask AI Proxy rodando na porta ${PORT}`));
