/**
 * Amphi ETL Agent - HTTP API 服务
 * 
 * 提供 RESTful API 供第三方接入
 * 
 * 使用方式:
 *   ts-node api/server.ts
 *   或使用 npm run agent:etl:api
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { Server as WebSocketServer } from 'ws';
import { createServer } from 'http';

import {
  OpenAILLMService,
  Neo4jKnowledgeGraph,
  createLogger,
} from '../../../src';
import { createPostgresRepositoryFromEnv } from '../../../src/repositories/dialogue';
import { AmphiETLAgent } from '../src/core';
import { ChatRequest, ChatResponse } from '../src/types';

dotenv.config();

/** 工作空间目录：优先 ETL_WORKSPACE_DIR，否则 config.json，否则默认 */
function getWorkspaceDir(): string {
  if (process.env.ETL_WORKSPACE_DIR) {
    return path.resolve(process.cwd(), process.env.ETL_WORKSPACE_DIR);
  }
  try {
    const configPath = path.join(__dirname, '..', 'config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw) as { workspaceDir?: string };
      if (config.workspaceDir) {
        return path.resolve(path.dirname(configPath), config.workspaceDir);
      }
    }
  } catch (_) {}
  return path.resolve(process.cwd(), 'output');
}

function createRedisFromEnv(): Redis | undefined {
  const host = process.env.REDIS_HOST;
  if (!host) return undefined;
  return new Redis({
    host,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  });
}

const logger = createLogger('ETLAgent:API');

// ========================================
// Express 应用
// ========================================

const app = express();
const PORT = process.env.ETL_API_PORT || 3456;

// 中间件
app.use(helmet());
app.use(cors());
app.use(express.json());

// Agent 实例管理
const agents = new Map<string, AmphiETLAgent>();

// 初始化共享服务
let llm: OpenAILLMService;
let kg: Neo4jKnowledgeGraph;
let repository: ReturnType<typeof createPostgresRepositoryFromEnv>;
let redis: Redis | undefined;
let workspaceDir: string;

// ========================================
// 路由
// ========================================

/**
 * 健康检查
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * 创建会话
 */
app.post('/api/v1/sessions', async (req: Request, res: Response) => {
  try {
    const { userId = 'anonymous' } = req.body;
    const sessionId = uuidv4();
    
    const agent = new AmphiETLAgent({
      llm,
      kg,
      repository,
      redis,
      workspaceDir,
      userId,
      sessionId,
    });
    
    await agent.initialize();
    agents.set(sessionId, agent);
    
    logger.info('会话创建', { sessionId, userId });
    
    res.json({
      success: true,
      data: {
        sessionId,
        userId,
        status: agent.getPhase(),
      },
    });
  } catch (error) {
    logger.error('创建会话失败', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * 发送消息
 */
app.post('/api/v1/chat', async (req: Request<{}, {}, ChatRequest>, res: Response) => {
  try {
    const { sessionId, message, userId, stream = false } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'message is required',
      });
    }

    // 获取或创建 Agent
    let agent: AmphiETLAgent;
    
    if (sessionId && agents.has(sessionId)) {
      agent = agents.get(sessionId)!;
    } else {
      const newSessionId = sessionId || uuidv4();
      agent = new AmphiETLAgent({
        llm,
        kg,
        repository,
        redis,
        workspaceDir,
        userId: userId || 'anonymous',
        sessionId: newSessionId,
      });
      await agent.initialize();
      agents.set(newSessionId, agent);
    }

    // 处理消息
    const result = await agent.process(message);
    
    const response: ChatResponse = {
      sessionId: agent.getSessionId(),
      response: result.response,
      isComplete: result.isComplete,
      phase: result.phase,
      pipelineFile: result.pipelineFile,
      timestamp: Date.now(),
    };

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    logger.error('处理消息失败', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * 获取会话状态
 */
app.get('/api/v1/sessions/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const agent = agents.get(sessionId);
  
  if (!agent) {
    return res.status(404).json({
      success: false,
      error: 'Session not found',
    });
  }

  res.json({
    success: true,
    data: {
      sessionId: agent.getSessionId(),
      userId: agent.getUserId(),
      phase: agent.getPhase(),
      config: {
        input: agent.getConfig().input?.name,
        output: agent.getConfig().output?.name,
        transformations: agent.getConfig().transformations.map(t => t.name),
      },
      history: agent.getHistory(),
    },
  });
});

/**
 * 删除会话
 */
app.delete('/api/v1/sessions/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  
  if (agents.has(sessionId)) {
    agents.delete(sessionId);
    logger.info('会话删除', { sessionId });
  }

  res.json({
    success: true,
    message: 'Session deleted',
  });
});

/**
 * 列出所有组件
 */
app.get('/api/v1/components', async (_req: Request, res: Response) => {
  try {
    // 这里可以通过 componentService 获取
    res.json({
      success: true,
      data: {
        message: '使用 POST /api/v1/chat 与 Agent 交互来搜索组件',
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// 错误处理
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('API错误', { error: err.message });
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

// ========================================
// WebSocket 支持
// ========================================

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  logger.info('WebSocket 连接建立');
  
  let agent: AmphiETLAgent | null = null;

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'init') {
        // 初始化会话
        const { userId = 'anonymous', sessionId = uuidv4() } = message;
        agent = new AmphiETLAgent({
          llm,
          kg,
          repository,
          redis,
          workspaceDir,
          userId,
          sessionId,
        });
        await agent.initialize();
        agents.set(sessionId, agent);
        
        ws.send(JSON.stringify({
          type: 'init',
          sessionId,
          phase: agent.getPhase(),
        }));
      } else if (message.type === 'chat' && agent) {
        // 处理消息（流式）
        const result = await agent.process(message.content);
        
        ws.send(JSON.stringify({
          type: 'response',
          content: result.response,
          phase: result.phase,
          isComplete: result.isComplete,
          pipelineFile: result.pipelineFile,
        }));
      }
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        error: (error as Error).message,
      }));
    }
  });

  ws.on('close', () => {
    logger.info('WebSocket 连接关闭');
  });
});

// ========================================
// 启动服务
// ========================================

async function startServer() {
  console.log('🚀 启动 TongBase ETL API 服务...\n');

  // 检查环境变量
  const requiredEnv = ['SILICONFLOW_API_KEY', 'NEO4J_URI'];
  const missing = requiredEnv.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`❌ 缺少环境变量: ${missing.join(', ')}`);
    process.exit(1);
  }

  // 初始化服务
  llm = new OpenAILLMService({
    apiKey: process.env.SILICONFLOW_API_KEY!,
    model: process.env.SILICONFLOW_MODEL || 'deepseek-ai/DeepSeek-V2.5',
    baseURL: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
    temperature: 0.2,
  });

  kg = new Neo4jKnowledgeGraph({
    uri: process.env.NEO4J_URI!,
    username: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
  });

  repository = createPostgresRepositoryFromEnv();
  redis = createRedisFromEnv();
  workspaceDir = getWorkspaceDir();
  if (redis) console.log('✅ Redis 已启用（本体库短期缓存 30 分钟）');
  console.log(`📁 工作空间目录: ${workspaceDir}`);

  // 检查连接
  console.log('🔌 检查数据库连接...');
  const [kgConnected, dbConnected] = await Promise.all([
    kg.verifyConnectivity(),
    repository.testConnection()
  ]);
  
  if (!kgConnected || !dbConnected) {
    console.error('❌ 数据库连接失败');
    process.exit(1);
  }
  console.log('✅ 数据库连接正常\n');

  // 启动服务
  server.listen(PORT, () => {
    console.log(`✅ API 服务已启动`);
    console.log(`📍 HTTP: http://localhost:${PORT}`);
    console.log(`📍 WebSocket: ws://localhost:${PORT}/ws`);
    console.log(`\n📖 API 文档:`);
    console.log(`   POST   /api/v1/sessions     创建会话`);
    console.log(`   POST   /api/v1/chat         发送消息`);
    console.log(`   GET    /api/v1/sessions/:id 获取会话状态`);
    console.log(`   DELETE /api/v1/sessions/:id 删除会话`);
    console.log(`   GET    /health              健康检查\n`);
  });

  // 优雅关闭
  process.on('SIGTERM', async () => {
    console.log('\n👋 正在关闭服务...');
    await repository.close();
    server.close(() => {
      process.exit(0);
    });
  });
}

startServer().catch((error) => {
  console.error('❌ 启动失败:', error);
  process.exit(1);
});
