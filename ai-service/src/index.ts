/**
 * AI Service - Main Entry Point
 * 
 * Provides API endpoints for:
 * - /ai/optimizePrompt - Prompt optimization
 * - /ai/generatePipeline - Pipeline generation from prompts
 * - /ai/renderPipeline - Pipeline rendering/saving
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import dotenv from 'dotenv';

import { optimizePromptHandler } from './handlers/optimizePrompt';
import { generatePipelineHandler } from './handlers/generatePipeline';
import { renderPipelineHandler } from './handlers/renderPipeline';
import {
  getProvidersHandler,
  saveApiKeyHandler,
  getApiKeysHandler,
  deleteApiKeyHandler,
  testApiKeyHandler,
  savePreferencesHandler,
  getPreferencesHandler
} from './handlers/providers';
import {
  adminPageHandler,
  listTablesHandler,
  getTableHandler,
  executeQueryHandler
} from './handlers/dbAdmin';
import {
  intentsHandler,
  generateHandler as agentGenerateHandler,
  validateHandler,
  templatesHandler,
  templateDetailHandler,
  nodesHandler,
  nodeDetailHandler,
  previewHandler
} from './handlers/agentHandlers';
import { chatHandler } from './handlers/chatHandler';

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Amphi AI Service API',
      version: '1.0.0',
      description: 'AI Assistant Backend Service for Amphi ETL Pipeline Generation',
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server',
      },
    ],
  },
  apis: ['./src/handlers/*.ts'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// CORS 必须最先挂载，确保 8889 -> 3000 跨域请求和 OPTIONS 预检都能通过
const corsOrigin = process.env.CORS_ORIGIN;
const corsOrigins = corsOrigin ? corsOrigin.split(',').map(s => s.trim()).filter(Boolean) : [];

function corsOriginCheck(origin: string | undefined, cb: (err: Error | null, allow?: boolean | string) => void) {
  if (!origin) return cb(null, true);
  if (corsOrigins.includes('*')) return cb(null, true);
  if (corsOrigins.includes(origin)) return cb(null, origin);
  const isLocalhost = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
  if (isLocalhost && (process.env.NODE_ENV !== 'production' || corsOrigins.length === 0)) {
    return cb(null, origin);
  }
  cb(null, false);
}

app.use(cors({
  origin: corsOriginCheck,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  exposedHeaders: ['Content-Length'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/ai', limiter);
app.use('/agent', limiter);

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes - AI Operations
app.post('/ai/optimizePrompt', optimizePromptHandler);
app.post('/ai/generatePipeline', generatePipelineHandler);
app.post('/ai/renderPipeline', renderPipelineHandler);

// API Routes - Provider & API Key Management
app.get('/ai/providers', getProvidersHandler);
app.post('/ai/apikeys', saveApiKeyHandler);
app.get('/ai/apikeys/:userId', getApiKeysHandler);
app.delete('/ai/apikeys/:userId/:providerId', deleteApiKeyHandler);
app.post('/ai/apikeys/test', testApiKeyHandler);
app.post('/ai/preferences', savePreferencesHandler);
app.get('/ai/preferences/:userId', getPreferencesHandler);

// Database Admin Routes (development only)
app.get('/db-admin', adminPageHandler);
app.get('/db-admin/tables', listTablesHandler);
app.get('/db-admin/tables/:name', getTableHandler);
app.post('/db-admin/query', executeQueryHandler);

// Agent API Routes - Pipeline Generation Agent
app.post('/agent/chat', chatHandler);  // 统一对话入口（自动判断意图）
app.post('/agent/intents', intentsHandler);
app.post('/agent/generate', agentGenerateHandler);
app.post('/agent/validate', validateHandler);
app.get('/agent/templates', templatesHandler);
app.get('/agent/templates/:id', templateDetailHandler);
app.get('/agent/nodes', nodesHandler);
app.get('/agent/nodes/:id', nodeDetailHandler);
app.post('/agent/preview', previewHandler);

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: true,
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: true, message: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AI Service running on http://localhost:${PORT}`);
  console.log(`📚 API Docs available at http://localhost:${PORT}/api-docs`);
  console.log(`🗄️ DB Admin available at http://localhost:${PORT}/db-admin`);
  console.log(`🤖 Agent API available at http://localhost:${PORT}/agent/*`);
  console.log('   - POST /agent/chat      统一对话 (自动判断意图)');
  console.log('   - POST /agent/intents   意图识别');
  console.log('   - POST /agent/generate  Pipeline 生成');
  console.log('   - POST /agent/validate  Pipeline 验证');
  console.log('   - GET  /agent/templates 模板列表');
  console.log('   - GET  /agent/nodes     节点库');
});

export default app;
