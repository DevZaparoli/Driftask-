import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const uri = process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET || 'driftask_secret_super_key';

let client;
let clientPromise;

if (!uri) {
  throw new Error('Por favor, define a variável de ambiente MONGODB_URI no painel da Vercel.');
}

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri);
  clientPromise = client.connect();
}

export default async function handler(req, res) {
  // Habilitar CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const connectedClient = await clientPromise;
    // Força o cruzamento correto usando a mesma base de dados das tarefas
    const db = connectedClient.db('driftask_db');
    const usersCollection = db.collection('users');

    // ─── MÉTODO POST: REGISTRO OU LOGIN ───
    if (req.method === 'POST') {
      const { email, password, isRegister } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
      }

      // 1. MODO REGISTRO
      if (isRegister) {
        const emailExists = await usersCollection.findOne({ email: email.toLowerCase().trim() });
        if (emailExists) {
          return res.status(400).json({ error: 'Este e-mail já está cadastrado.' });
        }

        // Criptografa a senha antes de salvar
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
          email: email.toLowerCase().trim(),
          password: hashedPassword,
          createdAt: new Date()
        };

        await usersCollection.insertOne(newUser);
        const token = jwt.sign({ email: newUser.email }, jwtSecret, { expiresIn: '7d' });

        return res.status(201).json({ message: 'Conta criada com sucesso!', token, email: newUser.email });
      }

      // 2. MODO LOGIN
      const inputSearch = email.toLowerCase().trim();
      let user = null;

      if (inputSearch.includes('@')) {
        user = await usersCollection.findOne({ email: inputSearch });
      } else {
        const cleanPrefix = inputSearch.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&');
        user = await usersCollection.findOne({ 
          email: { $regex: `^${cleanPrefix}[\\.@ ]`, $options: 'i' }
        });
      }

      if (!user) {
        return res.status(404).json({ error: 'Nenhuma conta encontrada. Verifique os dados ou faça o cadastro.' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Senha incorreta. Acesso negado.' });
      }

      const token = jwt.sign({ email: user.email }, jwtSecret, { expiresIn: '7d' });
      return res.status(200).json({ token, email: user.email });
    }

    return res.status(405).json({ error: `Método ${req.method} não permitido.` });

  } catch (error) {
    console.error('Erro na API de Auth:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.', details: error.message });
  }
}