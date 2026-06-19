// api/auth.js  —  POST /api/auth
// Actions : register | login
// Login aceita e-mail completo OU qualquer prefixo antes do PRIMEIRO separador
// Ex: kauan.cubo@gmail.com → aceita "kauan", "kauan.cubo", "kauan.cubo@gmail.com"

import { connectToDatabase } from '../lib/mongodb.js';
import bcrypt                from 'bcryptjs';
import jwt                   from 'jsonwebtoken';

const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES || '30d';

const _ORIGIN = process.env.ALLOWED_ORIGIN || 'https://driftask.vercel.app';
// SALT_ROUNDS = 10 é o padrão recomendado pela OWASP para bcrypt em 2024+.
// Cada round dobra o tempo de processamento: 12 rounds custava ~300-400ms
// por hash/compare em CPU serverless compartilhada (Vercel), causando login
// perceptivelmente lento. 10 rounds mantém proteção forte contra brute-force
// (ainda ordens de magnitude mais lento que SHA simples) com ~65-100ms.
const SALT_ROUNDS = 10;

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', _ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return json(res, 405, { error: 'Método não permitido.' });

  if (!JWT_SECRET) {
    return json(res, 500, { error: 'Configuração interna inválida (JWT_SECRET ausente).' });
  }

  const { action, email, emailPrefix, password, newPassword } = req.body || {};

  if (!action) {
    return json(res, 400, { error: 'Campo action é obrigatório.' });
  }
  // reset-password e delete-account têm validação própria de password
  if (action !== 'reset-password' && action !== 'delete-account' && !password) {
    return json(res, 400, { error: 'Campos obrigatórios não enviados.' });
  }

  let db;
  try {
    ({ db } = await connectToDatabase());
  } catch (err) {
    console.error('[auth] MongoDB:', err.message);
    return json(res, 503, { error: 'Banco de dados indisponível.' });
  }

  const users = db.collection('users');

  // ══════════════════════════════════════════
  //  CADASTRO
  // ══════════════════════════════════════════
  if (action === 'register') {
    if (!email || !isValidEmail(email)) {
      return json(res, 400, { error: 'O cadastro exige um e-mail válido (ex: nome@dominio.com).' });
    }
    if (!password || password.length < 6) {
      return json(res, 400, { error: 'A senha deve ter no mínimo 6 caracteres.' });
    }

    const emailLower = email.toLowerCase().trim();
    const existing   = await users.findOne({ email: emailLower });
    if (existing) {
      return json(res, 409, { error: 'Este e-mail já está cadastrado. Faça o login.' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await users.insertOne({ email: emailLower, password: hash, createdAt: new Date() });
    return json(res, 201, { ok: true, message: 'Conta criada com sucesso!' });
  }

  // ══════════════════════════════════════════
  //  LOGIN — e-mail completo OU qualquer prefixo
  //
  //  Lógica do prefixo:
  //  "kauan"       → regex ^kauan[.@+]   encontra kauan.cubo@gmail.com
  //  "kauan.cubo"  → regex ^kauan\.cubo[.@+]  encontra kauan.cubo@gmail.com
  //  "kauan.cubo@gmail.com" → busca exata
  // ══════════════════════════════════════════
  if (action === 'login') {
    let user = null;

    if (email) {
      // E-mail completo
      if (!isValidEmail(email)) {
        return json(res, 400, { error: 'Formato de e-mail inválido.' });
      }
      user = await users.findOne({ email: email.toLowerCase().trim() });

    } else if (emailPrefix) {
      const raw = emailPrefix.toLowerCase().trim();

      if (!raw || raw.length < 2) {
        return json(res, 400, { error: 'O nome de usuário deve ter pelo menos 2 caracteres.' });
      }

      // Tenta busca exata primeiro (caso seja e-mail completo passado como prefix)
      if (isValidEmail(raw)) {
        user = await users.findOne({ email: raw });
      }

      // Se não achou, tenta prefixo: ^raw[.@+\-] para bater com qualquer separador
      if (!user) {
        const safePrefix = escapeRegex(raw);
        // [.@+\-] = próximo char após o prefixo é ponto, @, + ou -
        user = await users.findOne({
          email: { $regex: `^${safePrefix}[.@+\\-]`, $options: 'i' }
        });
      }

    } else {
      return json(res, 400, { error: 'Informe um e-mail ou nome de usuário.' });
    }

    if (!user) {
      return json(res, 401, {
        error: 'Você não tem acesso. Favor verificar o e-mail correto ou fazer um cadastro.'
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return json(res, 401, {
        error: 'Você não tem acesso. Favor verificar a senha correta ou fazer um cadastro.'
      });
    }

    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    await users.updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } });

    return json(res, 200, { ok: true, token, email: user.email });
  }

  // ══════════════════════════════════════════
  //  REDEFINIR SENHA
  // ══════════════════════════════════════════
  if (action === 'reset-password') {
    if (!email || !isValidEmail(email)) {
      return json(res, 400, { error: 'Informe um e-mail válido.' });
    }
    if (!newPassword || newPassword.length < 6) {
      return json(res, 400, { error: 'A nova senha deve ter no mínimo 6 caracteres.' });
    }
    const user = await users.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return json(res, 404, { error: 'Nenhuma conta encontrada com este e-mail.' });
    }
    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await users.updateOne({ _id: user._id }, { $set: { password: hash, updatedAt: new Date() } });
    return json(res, 200, { ok: true, message: 'Senha redefinida com sucesso.' });
  }

  // ══════════════════════════════════════════
  //  EXCLUIR CONTA
  // ══════════════════════════════════════════
  if (action === 'delete-account') {
    const auth = req.headers['authorization'] || '';
    if (!auth.startsWith('Bearer ')) return json(res, 401, { error: 'Autenticação necessária.' });
    let decoded;
    try { decoded = jwt.verify(auth.slice(7), JWT_SECRET); }
    catch { return json(res, 401, { error: 'Sessão inválida ou expirada.' }); }

    if (!password) return json(res, 400, { error: 'Confirme sua senha para excluir a conta.' });

    const user = await users.findOne({ email: decoded.email });
    if (!user) return json(res, 404, { error: 'Conta não encontrada.' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return json(res, 401, { error: 'Senha incorreta. Tente novamente.' });

    await users.deleteOne({ _id: user._id });
    await db.collection('tasks').deleteMany({ userId: user._id.toString() });

    return json(res, 200, { ok: true, message: 'Conta excluída permanentemente.' });
  }

  return json(res, 400, { error: `Ação desconhecida: "${action}".` });
}
