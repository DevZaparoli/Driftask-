import clientPromise from '../lib/mongodb';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  // Configuração de CORS para permitir que o front converse com a API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { message, tasksContext, currentColumn } = req.body;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `Você é o assistente inteligente do sistema Driftask.
          Contexto atual de tarefas salvas no banco: ${JSON.stringify(tasksContext)}.
          Coluna visual selecionada no chat: "${currentColumn}".

          Regras estritas de resposta:
          1. Se o usuário mandar uma mensagem pedindo para criar, adicionar ou anotar uma nova tarefa, você deve identificar o título da tarefa e responder APENAS com o texto no formato "CRIAR: [Título da tarefa]". Não coloque pontos adicionais nem saudações. Exemplo: "CRIAR: Comprar pão doce".
          2. Se o usuário fizer uma pergunta genérica, pedir dicas de organização ou análise das tarefas dele, responda amigavelmente em português, de forma breve (máximo 3 frases).`
        },
        {
          role: "user",
          content: message
        }
      ],
      temperature: 0.4,
    });

    const aiResponseText = response.choices[0].message.content.trim();
    return res.status(200).json({ text: aiResponseText });

  } catch (error) {
    console.error("Erro interno no motor da OpenAI:", error);
    return res.status(500).json({ error: "Falha ao processar a resposta da Inteligência Artificial." });
  }
}
