// api/groups.js
// GET  (sem auth)                   → lista grupos públicos (nome + nº de tarefas)
// POST { action:'create' }          → cria grupo
// POST { action:'join' }            → entra no grupo → retorna groupToken
// GET  (Authorization: groupToken)  → tarefas do grupo
// POST { action:'save' }            → salva tarefas (requer groupToken)

import { connectToDatabase } from '../lib/mongodb.js';
import bcrypt from 'bcryptjs';
import jwt    from 'jsonwebtoken';

const JWT_SECRET  = process.env.JWT_SECRET;
const SALT_ROUNDS = 10;

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(body));
}

function verifyGroupToken(req) {
  const auth  = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) throw Object.assign(new Error('Token não fornecido.'), { status: 401 });
  try {
    const d = jwt.verify(token, JWT_SECRET);
    if (!d.groupId) throw new Error('Token inválido.');
    return d;
  } catch {
    throw Object.assign(new Error('Sessão do grupo inválida ou expirada.'), { status: 401 });
  }
}

function safeTasks(tasks) {
  return (Array.isArray(tasks) ? tasks : []).map(t => ({
    id:       String(t.id    || ''),
    text:     String(t.text  || '').slice(0, 500),
    notes:    String(t.notes || '').slice(0, 2000),
    col:      ['todo','doing','done'].includes(t.col) ? t.col : 'todo',
    priority: ['low','medium','high'].includes(t.priority) ? t.priority : 'medium',
    profile:  'grupo',
    date:     t.date || new Date().toISOString(),
    due:      t.due  || null,
    starred:  t.starred === true,
    addedBy:  String(t.addedBy || '').slice(0, 60),
  }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!JWT_SECRET) return json(res, 500, { error: 'Configuração interna inválida.' });

  let db;
  try { ({ db } = await connectToDatabase()); }
  catch { return json(res, 503, { error: 'Banco de dados indisponível.' }); }

  const groups = db.collection('groups');

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const auth = req.headers['authorization'] || '';

    // Com token → retorna tarefas do grupo específico
    if (auth.startsWith('Bearer ')) {
      let decoded;
      try { decoded = verifyGroupToken(req); }
      catch (e) { return json(res, e.status || 401, { error: e.message }); }

      const { ObjectId } = await import('mongodb');
      const doc = await groups.findOne({ _id: new ObjectId(decoded.groupId) });
      if (!doc) return json(res, 404, { error: 'Grupo não encontrado.' });
      return json(res, 200, { ok: true, tasks: doc.tasks || [], groupName: doc.name, updatedAt: doc.updatedAt });
    }

    // Sem token → lista pública de grupos (nome + contagem de tarefas)
    const list = await groups.find({}, { projection: { name: 1, tasks: 1, createdAt: 1 } })
      .sort({ createdAt: -1 }).limit(20).toArray();

    return json(res, 200, {
      ok: true,
      groups: list.map(g => ({
        name:      g.name,
        taskCount: (g.tasks || []).length,
      }))
    });
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });

  const { action } = req.body || {};

  // ── CREATE ───────────────────────────────────────────────────────────────
  if (action === 'create') {
    const { name, password } = req.body;
    if (!name || name.trim().length < 3)  return json(res, 400, { error: 'Nome do grupo deve ter pelo menos 3 caracteres.' });
    if (!password || password.length < 4) return json(res, 400, { error: 'Senha deve ter pelo menos 4 caracteres.' });

    const normalName = name.trim().toLowerCase();
    if (await groups.findOne({ normalName })) return json(res, 409, { error: 'Já existe um grupo com este nome.' });

    const hash   = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await groups.insertOne({ name: name.trim(), normalName, password: hash, tasks: [], createdAt: new Date(), updatedAt: new Date() });
    const token  = jwt.sign({ groupId: result.insertedId.toString(), groupName: name.trim() }, JWT_SECRET, { expiresIn: '30d' });
    return json(res, 201, { ok: true, token, groupName: name.trim() });
  }

  // ── JOIN ─────────────────────────────────────────────────────────────────
  if (action === 'join') {
    const { name, password } = req.body;
    if (!name || !password) return json(res, 400, { error: 'Nome e senha são obrigatórios.' });

    const doc = await groups.findOne({ normalName: name.trim().toLowerCase() });
    if (!doc) return json(res, 404, { error: 'Grupo não encontrado. Verifique o nome.' });

    const valid = await bcrypt.compare(password, doc.password);
    if (!valid) return json(res, 401, { error: 'Senha incorreta.' });

    const token = jwt.sign({ groupId: doc._id.toString(), groupName: doc.name }, JWT_SECRET, { expiresIn: '30d' });
    return json(res, 200, { ok: true, token, groupName: doc.name });
  }

  // ── SAVE ─────────────────────────────────────────────────────────────────
  if (action === 'save') {
    let decoded;
    try { decoded = verifyGroupToken(req); }
    catch (e) { return json(res, e.status || 401, { error: e.message }); }

    const { tasks } = req.body;
    if (!Array.isArray(tasks)) return json(res, 400, { error: 'Campo "tasks" deve ser um array.' });

    const { ObjectId } = await import('mongodb');
    await groups.updateOne(
      { _id: new ObjectId(decoded.groupId) },
      { $set: { tasks: safeTasks(tasks), updatedAt: new Date() } }
    );
    return json(res, 200, { ok: true, saved: tasks.length });
  }

  return json(res, 400, { error: `Ação desconhecida: "${action}".` });
}
