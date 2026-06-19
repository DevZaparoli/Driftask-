// api/tasks.js
// Endpoint : GET  /api/tasks  → retorna tarefas do usuário autenticado
//            POST /api/tasks  → salva/sobrescreve tarefas do usuário autenticado
// Auth     : Bearer JWT no header Authorization

import { connectToDatabase } from '../lib/mongodb.js';
import jwt                   from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

const _ORIGIN = process.env.ALLOWED_ORIGIN || 'https://driftask.vercel.app';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(body));
}

function verifyToken(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) throw Object.assign(new Error('Token não fornecido.'), { status: 401 });

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    throw Object.assign(new Error('Sessão inválida ou expirada. Faça o login novamente.'), { status: 401 });
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', _ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!JWT_SECRET) {
    return json(res, 500, { error: 'Configuração interna inválida.' });
  }

  // ── Verifica autenticação ─────────────────────────────────────────────────
  let decoded;
  try {
    decoded = verifyToken(req);
  } catch (err) {
    return json(res, err.status || 401, { error: err.message });
  }

  const userId = decoded.userId;

  // ── Conexão ───────────────────────────────────────────────────────────────
  let db;
  try {
    ({ db } = await connectToDatabase());
  } catch (err) {
    console.error('[tasks] MongoDB connection error:', err);
    return json(res, 503, { error: 'Serviço de banco de dados indisponível.' });
  }

  const tasksCol = db.collection('tasks');

  // ══════════════════════════════════════════════════════════════════════════
  //  GET — Busca tarefas do usuário
  // ══════════════════════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    const doc = await tasksCol.findOne({ userId });

    return json(res, 200, {
      ok:    true,
      tasks: doc ? doc.tasks : [],
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  POST — Upsert das tarefas do usuário (substitui tudo)
  // ══════════════════════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    const { tasks } = req.body || {};

    if (!Array.isArray(tasks)) {
      return json(res, 400, { error: 'Campo "tasks" deve ser um array.' });
    }

    // Limite de segurança: evita payload malicioso ou runaway de dados
    const TASK_LIMIT = 500;
    if (tasks.length > TASK_LIMIT) {
      return json(res, 400, { error: `Limite de ${TASK_LIMIT} tarefas por usuário atingido.` });
    }

    // Limpa campos potencialmente perigosos de cada tarefa
    const safeTasks = tasks.map(t => ({
      id:          String(t.id       || ''),
      text:        String(t.text     || '').slice(0, 500),
      notes:       String(t.notes    || '').slice(0, 2000),
      col:         ['todo','doing','done'].includes(t.col) ? t.col : 'todo',
      priority:    ['low','medium','high'].includes(t.priority) ? t.priority : 'medium',
      profile:     ['pessoal','profissional'].includes(t.profile) ? t.profile : 'pessoal',
      date:        t.date  || new Date().toISOString(),
      due:         t.due   || null,
      starred:     t.starred === true,
      completedAt: t.completedAt || null,
      tags:        Array.isArray(t.tags) ? t.tags.slice(0,5).map(tag => String(tag).slice(0,20)) : [],
    }));

    await tasksCol.updateOne(
      { userId },
      { $set: { userId, tasks: safeTasks, updatedAt: new Date() } },
      { upsert: true }
    );

    return json(res, 200, { ok: true, saved: safeTasks.length });
  }

  return json(res, 405, { error: 'Método não permitido.' });
}
