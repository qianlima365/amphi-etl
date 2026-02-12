/**
 * Next.js API Route 示例
 * 在 Next.js 项目中使用
 */

import { NextApiRequest, NextApiResponse } from 'next';

const ETL_API_BASE = process.env.ETL_API_URL || 'http://localhost:3456';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // 处理跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId, message, action } = req.body;

    // 根据 action 执行不同操作
    switch (action) {
      case 'createSession':
        const sessionRes = await fetch(`${ETL_API_BASE}/api/v1/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: req.body.userId || 'anonymous' }),
        });
        const sessionData = await sessionRes.json();
        return res.status(200).json(sessionData);

      case 'chat':
        const chatRes = await fetch(`${ETL_API_BASE}/api/v1/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            message,
            userId: req.body.userId || 'anonymous',
          }),
        });
        const chatData = await chatRes.json();
        return res.status(200).json(chatData);

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
