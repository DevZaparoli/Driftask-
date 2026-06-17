// lib/mongodb.js
// Conexão singleton com MongoDB — reutiliza a conexão entre chamadas serverless (Vercel)

import { MongoClient } from 'mongodb';

const uri    = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'driftask';

if (!uri) {
  throw new Error(
    'Variável de ambiente MONGODB_URI não definida.\n' +
    'Adicione-a em: Vercel Dashboard → Project → Settings → Environment Variables'
  );
}

let cachedClient = null;
let cachedDb     = null;
let indexesEnsured = false;

// Garante os índices em segundo plano, sem bloquear a resposta do request atual.
// Roda só uma vez por instância serverless "quente" (idempotente — createIndex
// não duplica se o índice já existir no servidor).
function ensureIndexesInBackground(db) {
  if (indexesEnsured) return;
  indexesEnsured = true; // marca antes de await: evita disparos concorrentes na mesma instância

  Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('tasks').createIndex({ userId: 1 }),
    db.collection('groups').createIndex({ normalName: 1 }, { unique: true }),
  ]).catch(err => {
    console.error('[mongodb] Falha ao garantir índices em background:', err.message);
    indexesEnsured = false; // permite tentar novamente na próxima chamada
  });
}

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = new MongoClient(uri, {
    // Opções recomendadas para Serverless
    maxPoolSize:       10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS:   45000,
  });

  await client.connect();

  const db = client.db(dbName);

  cachedClient = client;
  cachedDb     = db;

  // Dispara a verificação de índices sem await — o request do usuário
  // não espera por isso. Em cold start, isso elimina o roundtrip extra
  // de rede que antes bloqueava a primeira resposta.
  ensureIndexesInBackground(db);

  return { client, db };
}
