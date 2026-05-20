import clientPromise from '../lib/mongodb';
import jwt from 'jsonwebtoken';

const jwtSecret = process.env.JWT_SECRET;

function verifyUserToken(req) {

  const authHeader = req.headers.authorization;

  if (!authHeader) return null;

  const token = authHeader.split(' ')[1];

  if (!token) return null;

  try {
    return jwt.verify(token, jwtSecret);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const userSession = verifyUserToken(req);

  if (!userSession) {
    return res.status(401).json({
      error: 'Token inválido'
    });
  }

  try {

    const client = await clientPromise;

    const db = client.db('driftask_db');

    const tasksCollection = db.collection('user_tasks');

    if (req.method === 'GET') {

      const userDoc = await tasksCollection.findOne({
        email: userSession.email
      });

      return res.status(200).json({
        tasks: userDoc?.tasks || []
      });
    }

    if (req.method === 'POST') {

      const { tasks } = req.body;

      if (!Array.isArray(tasks)) {
        return res.status(400).json({
          error: 'Tasks inválidas'
        });
      }

      await tasksCollection.updateOne(
        { email: userSession.email },
        {
          $set: {
            tasks,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );

      return res.status(200).json({
        success: true
      });
    }

    return res.status(405).json({
      error: 'Método não permitido'
    });

  } catch (error) {

    console.error('TASK ERROR:', error);

    return res.status(500).json({
      error: error.message
    });
  }
}
