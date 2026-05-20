const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const uri = process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET || 'chave_fallback_segura_123';
let cachedClient = null;

async function connectToDatabase() {
  if (cachedClient) return cachedClient.db('driftask_db');
  const client = new MongoClient(uri);
  await client.connect();
  cachedClient = client;
  return client.db('driftask_db');
}

module.exports = async (req, res) => {
  // Configuração de CORS para permitir que o Front-end comunique com a API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const db = await connectToDatabase();
    const usersCollection = db.collection('users');
    const { action, email, emailPrefix, password } = req.body;

    // ====================================================================
    // AÇÃO 1: CADASTRO (REGISTRO) - Aceita APENAS E-mail Completo
    // ====================================================================
    if (action === 'register') {
      if (!email || !password) {
        return res.status(400).json({ error: 'E-mail e senha são obrigatórios para cadastro.' });
      }

      const cleanEmail = email.toLowerCase().trim();
      
      // Verifica se o usuário já existe no MongoDB
      const userExists = await usersCollection.findOne({ email: cleanEmail });
      if (userExists) {
        // Retorna status 409 (Conflict) para o frontend ativar a janela de erro
        return res.status(409).json({ error: 'Este e-mail já possui uma conta. Faça o login ou use outro endereço.' });
      }

      // Criptografa a senha antes de salvar
      const hashedPassword = await bcrypt.hash(password, 10);
      await usersCollection.insertOne({ 
        email: cleanEmail, 
        password: hashedPassword, 
        createdAt: new Date() 
      });
      
      // Cria o documento vazio de tarefas para este novo usuário
      await db.collection('user_tasks').insertOne({ email: cleanEmail, tasks: [] });
      return res.status(201).json({ message: 'Usuário registrado com sucesso!' });
    }

    // ====================================================================
    // AÇÃO 2: LOGIN - Aceita E-mail Completo OU apenas a primeira frase
    // ====================================================================
    if (action === 'login') {
      if (!password) {
        return res.status(400).json({ error: 'A senha é obrigatória.' });
      }

      let user = null;

      // Se o usuário digitou o e-mail completo (ex: joao@email.com)
      if (email) {
        user = await usersCollection.findOne({ email: email.toLowerCase().trim() });
      } 
      // Se o usuário digitou apenas o prefixo/primeira frase (ex: joao)
      else if (emailPrefix) {
        // Limpa a string para evitar injeção de caracteres especiais no banco
        const cleanPrefix = emailPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toLowerCase().trim();
        
        // Busca no MongoDB usando Regex (Expressão Regular) que comece com o prefixo seguido de "@"
        user = await usersCollection.findOne({ 
          email: { $regex: `^${cleanPrefix}@`, $options: 'i' } 
        });
      } else {
        return res.status(400).json({ error: 'Informe um e-mail ou nome de usuário válido.' });
      }

      // Se não encontrou o usuário, retorna 404 (Not Found)
      if (!user) {
        return res.status(404).json({ error: 'Nenhuma conta encontrada. Você não tem acesso, favor verificar ou fazer cadastro.' });
      }

      // Verifica se a senha bate com a criptografia
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        // Retorna 401 (Unauthorized) para o frontend acionar a caixa vermelha
        return res.status(401).json({ error: 'Senha incorreta. Você não tem acesso, favor verificar.' });
      }

      // Gerar Token de Sessão válido por 7 dias
      const token = jwt.sign({ email: user.email }, jwtSecret, { expiresIn: '7d' });
      return res.status(200).json({ token, email: user.email });
    }

    return res.status(400).json({ error: 'Ação inválida.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno no servidor da Vercel' });
  }
};
