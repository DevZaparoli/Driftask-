import clientPromise from '../lib/mongodb';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const jwtSecret = process.env.JWT_SECRET;

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Método não permitido'
    });
  }

  try {

    const client = await clientPromise;
    const db = client.db('driftask_db');

    const usersCollection = db.collection('users');

    const { action, email, password } = req.body;

    if (!action) {
      return res.status(400).json({
        error: 'Action obrigatória'
      });
    }

    if (action === 'register') {

      if (!email || !password) {
        return res.status(400).json({
          error: 'Email e senha obrigatórios'
        });
      }

      const cleanEmail = email.toLowerCase().trim();

      const existingUser = await usersCollection.findOne({
        email: cleanEmail
      });

      if (existingUser) {
        return res.status(409).json({
          error: 'Usuário já existe'
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      await usersCollection.insertOne({
        email: cleanEmail,
        password: hashedPassword,
        createdAt: new Date()
      });

      const token = jwt.sign(
        { email: cleanEmail },
        jwtSecret,
        { expiresIn: '7d' }
      );

      return res.status(201).json({
        token,
        email: cleanEmail
      });
    }

    if (action === 'login') {
      // CAPTURA O IDENTIFICADOR (seja e-mail completo ou prefixo)
      let targetEmail = email;

      // Se o usuário digitou apenas o prefixo no front-end
      if (!targetEmail && req.body.emailPrefix) {
        // Reconstrói o e-mail padrão usando o prefixo (ajuste o domínio se necessário)
        targetEmail = `${req.body.emailPrefix}@gmail.com`; 
      }

      // Validação de segurança para garantir que temos uma string antes de tratar
      if (!targetEmail) {
        return res.status(400).json({
          error: 'E-mail ou nome de usuário é obrigatório'
        });
      }

      const cleanEmail = targetEmail.toLowerCase().trim();

      // Busca o usuário no MongoDB Atlas pelo e-mail final
      const user = await usersCollection.findOne({
        email: cleanEmail
      });

      if (!user) {
        return res.status(404).json({
          error: 'Usuário não encontrado'
        });
      }

      const validPassword = await bcrypt.compare(
        password,
        user.password
      );

      if (!validPassword) {
        return res.status(401).json({
          error: 'Senha inválida'
        });
      }

      const token = jwt.sign(
        { email: user.email },
        jwtSecret,
        { expiresIn: '7d' }
      );

      return res.status(200).json({
        token,
        email: user.email
      });
    }

  } catch (error) {

    console.error('AUTH ERROR:', error);

    return res.status(500).json({
      error: error.message
    });
  }
}
