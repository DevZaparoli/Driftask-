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
  // Habilitar CORS se necessário
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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Utilize POST.' });
  }

  try {
    const mongoClient = await clientPromise;
    const db = mongoClient.db('driftask_db');
    const usersCollection = db.collection('users');

    const { action, email, password } = req.body;

    // ====================================================================
    // AÇÃO 1: CADASTRO / REGISTO
    // ====================================================================
    if (action === 'register') {
      if (!email || !password) {
        return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
      }

      const cleanEmail = email.toLowerCase().trim();
      
      // Verifica se o utilizador já existe
      const existingUser = await usersCollection.findOne({ email: cleanEmail });
      if (existingUser) {
        return res.status(409).json({ error: 'Este e-mail já possui uma conta. Faça o login ou use outro endereço.' });
      }

      // Encripta a senha antes de salvar
      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = {
        email: cleanEmail,
        password: hashedPassword,
        createdAt: new Date().toISOString()
      };

      await usersCollection.insertOne(newUser);
      
      const token = jwt.sign({ email: cleanEmail }, jwtSecret, { expiresIn: '7d' });
      return res.status(201).json({ token, email: cleanEmail, message: 'Conta criada com sucesso!' });
    }

    // ====================================================================
    // AÇÃO 2: LOGIN (Aceita e-mail completo, prefixo ou primeiro nome)
    // ====================================================================
    if (action === 'login') {
      if (!email || !password) {
        return res.status(400).json({ error: 'E-mail/Utilizador e senha são obrigatórios.' });
      }

      const inputSearch = email.toLowerCase().trim();
      let user = null;

      if (inputSearch.includes('@')) {
        // Se digitou o e-mail completo
        user = await usersCollection.findOne({ email: inputSearch });
      } else {
        // Se digitou apenas o primeiro nome ou o prefixo antes do arroba.
        // O Regex valida se começa com o termo digitado E se o próximo caractere é um ponto (.) ou arroba (@)
        const cleanPrefix = inputSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        user = await usersCollection.findOne({ 
          email: { $regex: `^${cleanPrefix}[\\.@ ]`, $options: 'i' } 
        });
      }

      if (!user) {
        return res.status(404).json({ error: 'Nenhuma conta encontrada. Verifique os dados ou faça o cadastro.' });
      }

      // Valida a senha encriptada
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Senha incorreta. Acesso negado.' });
      }

      // Gera o token de acesso válido por 7 dias
      const token = jwt.sign({ email: user.email }, jwtSecret, { expiresIn: '7d' });
      return res.status(200).json({ token, email: user.email });
    }

    return res.status(400).json({ error: 'Ação inválida ou não informada.' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno no servidor de autenticação.' });
  }
}
