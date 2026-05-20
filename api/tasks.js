import { MongoClient } from 'mongodb';
import jwt from 'jsonwebtoken';

const uri = process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET || 'driftask_secret_super_key';
let cachedClient = null;

if (!uri) {
  throw new Error('Por favor, define a variável de ambiente MONGODB_URI.');
}

async function connectToDatabase() {
  if (cachedClient) return cachedClient.db('driftask_db');
  const client = new MongoClient(uri);
  await client.connect();
  cachedClient = client;
  return client.db('driftask_db');
}

function verifyUserToken(req) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return null;
  try { 
    return jwt.verify(token, jwtSecret); 
  } catch (e) { 
    return null; 
  }
}

export default async function handler(req, res) {
  // Configuração de Headers CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const userSession = verifyUserToken(req);
  if (!userSession) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
  }

  try {
    const db = await connectToDatabase();
    const tasksCollection = db.collection('user_tasks');

    // ─── MÉTODO GET: BUSCAR TAREFAS DO USUÁRIO ───
    if (req.method === 'GET') {
      const userDoc = await tasksCollection.findOne({ email: userSession.email });
      return res.status(200).json({ tasks: userDoc ? userDoc.tasks : [] });
    }

    // ─── MÉTODO POST: SALVAR TAREFAS DO USUÁRIO ───
    if (req.method === 'POST') {
      const { tasks } = req.body;
      if (!Array.isArray(tasks)) {
        return res.status(400).json({ error: 'Formato inválido. O campo tasks precisa ser uma lista.' });
      }

      await tasksCollection.updateOne(
        { email: userSession.email },
        { $set: { tasks, updatedAt: new Date() } },
        { upsert: true }
      );

      return res.status(200).json({ message: 'Tarefas sincronizadas com sucesso!' });
    }

    return res.status(405).json({ error: `Método ${req.method} não suportado.` });

  } catch (error) {
    console.error('Erro na API de Tasks:', error);
    return res.status(500).json({ error: 'Erro interno ao processar tarefas no banco de dados.' });
  }
}