const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const uri = process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET;
let cachedClient = null;

async function connectToDatabase() {
  if (cachedClient) return cachedClient.db('driftask_db');
  const client = new MongoClient(uri);
  await client.connect();
  cachedClient = client;
  return client.db('driftask_db');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const db = await connectToDatabase();
    const usersCollection = db.collection('users');
    const { action, email, password } = req.body;

    if (!email || !password) return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
    const cleanEmail = email.toLowerCase().trim();

    // REGISTRAR NOVO USUÁRIO (PRIMEIRO ACESSO)
    if (action === 'register') {
      const userExists = await usersCollection.findOne({ email: cleanEmail });
      if (userExists) return res.status(400).json({ error: 'Usuário já cadastrado com este e-mail' });

      const hashedPassword = await bcrypt.hash(password, 10);
      await usersCollection.insertOne({ email: cleanEmail, password: hashedPassword, createdAt: new Date() });
      
      // Inicializa um documento de tarefas vazio para o usuário
      await db.collection('user_tasks').insertOne({ email: cleanEmail, tasks: [] });
      return res.status(201).json({ message: 'Usuário registrado com sucesso!' });
    }

    // LOGIN DO USUÁRIO
    if (action === 'login') {
      const user = await usersCollection.findOne({ email: cleanEmail });
      if (!user) return res.status(401).json({ error: 'E-mail ou senha incorretos' });

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) return res.status(401).json({ error: 'E-mail ou senha incorretos' });

      // Gera um Token seguro assinado que expira em 7 dias
      const token = jwt.sign({ email: user.email }, jwtSecret, { expiresIn: '7d' });
      return res.status(200).json({ token, email: user.email });
    }

    return res.status(400).json({ error: 'Ação inválida.' });
  } catch (error) {
    return res.status(500).json({ error: 'Erro interno no servidor' });
  }
};