import clientPromise from '../lib/mongodb';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Nunca deixe a chave exposta no código!
});

export default async function handler(req, res) {
  // Configuração de CORS que você já usa
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const { message, tasksContext, currentColumn } = req.body;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // ou o modelo de sua preferência
      messages: [
        {
          role: "system",
          content: `Você é o assistente inteligente do sistema Driftask. Contexto atual: ${JSON.stringify(tasksContext)}. Coluna: "${currentColumn}". Regulamento...`
        },
        { role: "user", content: message }
      ],
      temperature: 0.4,
    });

    return res.status(200).json({ text: response.choices[0].message.content.trim() });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Falha ao processar a IA." });
  }
}
