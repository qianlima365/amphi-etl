/**
 * Express 代理服务器示例
 * 第三方应用后端代理，处理认证和转发请求到 Amphi ETL API
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Amphi ETL API 配置
const ETL_API_BASE = process.env.ETL_API_URL || 'http://localhost:3456';
const ETL_API_KEY = process.env.ETL_API_KEY;

// 创建会话
app.post('/api/chat/session', async (req, res) => {
  try {
    const { userId } = req.body;
    const response = await axios.post(`${ETL_API_BASE}/api/v1/sessions`, {
      userId: userId || req.user?.id || 'guest'
    }, {
      headers: ETL_API_KEY ? { 'Authorization': `Bearer ${ETL_API_KEY}` } : {}
    });
    
    res.json({
      success: true,
      sessionId: response.data.data.sessionId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 发送消息
app.post('/api/chat/message', async (req, res) => {
  try {
    const { sessionId, message, userId } = req.body;
    
    const response = await axios.post(`${ETL_API_BASE}/api/v1/chat`, {
      sessionId,
      message,
      userId: userId || req.user?.id || 'guest'
    }, {
      headers: ETL_API_KEY ? { 'Authorization': `Bearer ${ETL_API_KEY}` } : {}
    });
    
    res.json({
      success: true,
      data: response.data.data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取会话状态
app.get('/api/chat/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const response = await axios.get(`${ETL_API_BASE}/api/v1/sessions/${sessionId}`, {
      headers: ETL_API_KEY ? { 'Authorization': `Bearer ${ETL_API_KEY}` } : {}
    });
    
    res.json({
      success: true,
      data: response.data.data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`代理服务器运行在 http://localhost:${PORT}`);
});
