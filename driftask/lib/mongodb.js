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

  // Índices garantidos na primeira conexão
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('tasks').createIndex({ userId: 1 });

  cachedClient = client;
  cachedDb     = db;

  return { client, db };
}
