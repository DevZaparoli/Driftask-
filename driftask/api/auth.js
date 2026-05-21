// api/auth.js
// Endpoint: POST /api/auth
// Actions : register | login
// Login aceita: e-mail completo  OU  prefixo (parte antes do @)

import { connectToDatabase } from '../lib/mongodb.js';
import bcrypt                from 'bcryptjs';
import jwt                   from 'jsonwebtoken';

const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES || '30d';
const SALT_ROUNDS = 12;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(body));
}

function isValidEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(str);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Handler principal ────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS básico (ajuste origins conforme necessário)
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  if (!JWT_SECRET) {
    console.error('[auth] JWT_SECRET não definido nas variáveis de ambiente!');
    return json(res, 500, { error: 'Configuração interna inválida.' });
  }

  const { action, email, emailPrefix, password } = req.body || {};

  if (!action || !password) {
    return json(res, 400, { error: 'Campos obrigatórios não enviados.' });
  }

  // ── Conexão ──────────────────────────────────────────────────────────────
  let db;
  try {
    ({ db } = await connectToDatabase());
  } catch (err) {
    console.error('[auth] Falha ao conectar ao MongoDB:', err);
    return json(res, 503, { error: 'Serviço de banco de dados indisponível.' });
  }

  const users = db.collection('users');

  // ══════════════════════════════════════════════════════════════════════════
  //  CADASTRO
  // ══════════════════════════════════════════════════════════════════════════
  if (action === 'register') {
    // Somente e-mail completo e válido é aceito no cadastro
    if (!email || !isValidEmail(email)) {
      return json(res, 400, {
        error: 'O cadastro exige um e-mail válido (ex: nome@dominio.com).'
      });
    }
    if (!password || password.length < 6) {
      return json(res, 400, {
        error: 'A senha deve ter no mínimo 6 caracteres.'
      });
    }

    const emailLower = email.toLowerCase().trim();

    // Verifica duplicidade
    const existing = await users.findOne({ email: emailLower });
    if (existing) {
      return json(res, 409, {
        error: 'Este e-mail já está cadastrado. Faça o login ou use outro endereço.'
      });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    await users.insertOne({
      email:     emailLower,
      password:  hash,
      createdAt: new Date(),
    });

    return json(res, 201, { ok: true, message: 'Conta criada com sucesso!' });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  LOGIN  — aceita e-mail completo OU prefixo (parte antes do @)
  // ══════════════════════════════════════════════════════════════════════════
  if (action === 'login') {
    let user = null;

    if (email) {
      // ── Login por e-mail completo ──────────────────────────────────────
      if (!isValidEmail(email)) {
        return json(res, 400, { error: 'Formato de e-mail inválido.' });
      }
      user = await users.findOne({ email: email.toLowerCase().trim() });

    } else if (emailPrefix) {
      // ── Login por prefixo (ex: "joao" → encontra "joao@qualquer.com") ──
      const safePrefix = escapeRegex(emailPrefix.toLowerCase().trim());
      if (!safePrefix || safePrefix.length < 2) {
        return json(res, 400, {
          error: 'O nome de usuário deve ter pelo menos 2 caracteres.'
        });
      }
      // Busca pelo padrão  ^prefixo@  (case-insensitive)
      user = await users.findOne({
        email: { $regex: `^${safePrefix}@`, $options: 'i' }
      });

    } else {
      return json(res, 400, {
        error: 'Informe um e-mail ou nome de usuário para fazer login.'
      });
    }

    // Usuário não encontrado → acesso negado
    if (!user) {
      return json(res, 401, {
        error: 'Você não tem acesso. Favor verificar o e-mail correto ou fazer um cadastro.'
      });
    }

    // Verifica senha
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return json(res, 401, {
        error: 'Você não tem acesso. Favor verificar a senha correta ou fazer um cadastro.'
      });
    }

    // Gera token JWT
    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    // Atualiza último login
    await users.updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date() } }
    );

    return json(res, 200, {
      ok:    true,
      token,
      email: user.email,
    });
  }

  // Ação desconhecida
  return json(res, 400, { error: `Ação desconhecida: "${action}".` });
}
