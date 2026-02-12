#!/usr/bin/env node
/**
 * Amphi ETL Agent - CLI 入口
 * 
 * 使用方式:
 *   ts-node cli/index.ts
 *   node dist/cli/index.js
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as dotenv from 'dotenv';
import Redis from 'ioredis';
import {
  OpenAILLMService,
  Neo4jKnowledgeGraph,
  createLogger,
} from '../../../src';
import { createPostgresRepositoryFromEnv } from '../../../src/repositories/dialogue';
import { AmphiETLAgent } from '../src/core';

dotenv.config();

/** 工作空间目录：优先环境变量 ETL_WORKSPACE_DIR，否则 config.json 中的 workspaceDir，否则默认 ./output（相对当前工作目录） */
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
  const redis = new Redis({
    host,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  });
  return redis;
}

const logger = createLogger('ETLAgent:CLI');

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║     🤖 智能ETL编排Agent - Pipeline Builder                              ║');
  console.log('║     像你与开发者协作一样工作                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // 检查环境变量
  const requiredEnv = ['SILICONFLOW_API_KEY', 'NEO4J_URI'];
  const missing = requiredEnv.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`❌ 缺少环境变量: ${missing.join(', ')}`);
    console.log('请检查 .env 文件');
    process.exit(1);
  }

  // 初始化服务
  const llm = new OpenAILLMService({
    apiKey: process.env.SILICONFLOW_API_KEY!,
    model: process.env.SILICONFLOW_MODEL || 'deepseek-ai/DeepSeek-V2.5',
    baseURL: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
    temperature: 0.7,
  });

  const kg = new Neo4jKnowledgeGraph({
    uri: process.env.NEO4J_URI!,
    username: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
  });

  const repository = createPostgresRepositoryFromEnv();
  
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

  const redis = createRedisFromEnv();
  if (redis) console.log('✅ Redis 已启用（本体库短期缓存 30 分钟）\n');

  const workspaceDir = getWorkspaceDir();
  console.log(`📁 工作空间目录: ${workspaceDir}\n`);

  // 创建 Agent
  const agent = new AmphiETLAgent({
    llm,
    kg,
    repository,
    redis,
    workspaceDir,
    userId: process.env.USER_ID || 'anonymous',
  });

  // 初始化
  console.log('🚀 初始化 Agent...');
  await agent.initialize();
  console.log('✅ Agent 就绪\n');

  // 显示帮助
  console.log('💡 提示：');
  console.log('   • 输入 exit 退出');
  console.log('   • 输入 help 查看帮助');
  console.log('   • 描述你的数据处理需求，如"把CSV导入MySQL"\n');

  // 创建交互界面
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = () => {
    rl.question('> ', async (input) => {
      const trimmed = input.trim();
      
      if (!trimmed) {
        askQuestion();
        return;
      }

      if (trimmed.toLowerCase() === 'exit') {
        console.log('\n👋 再见！');
        rl.close();
        await repository.close();
        process.exit(0);
      }

      if (trimmed.toLowerCase() === 'help') {
        showHelp();
        askQuestion();
        return;
      }

      try {
        const result = await agent.process(trimmed);
        console.log(`\n🤖 ${result.response}\n`);
        
        if (result.isComplete && result.pipelineFile) {
          console.log(`📁 Pipeline 文件: ${result.pipelineFile}\n`);
        }
      } catch (error) {
        console.error('\n❌ 处理出错:', (error as Error).message);
        logger.error('处理失败', { error: (error as Error).message });
      }

      askQuestion();
    });
  };

  askQuestion();
}

function showHelp() {
  console.log('\n📖 使用帮助：');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('你可以这样描述需求：');
  console.log('  • "把CSV文件导入MySQL数据库"');
  console.log('  • "从PostgreSQL导出数据到CSV"');
  console.log('  • "同步两个数据库的表数据"');
  console.log('');
  console.log('常用命令：');
  console.log('  • 确认 / 可以 / 是的  →  接受当前方案');
  console.log('  • 直接生成           →  使用默认值生成');
  console.log('  • 添加组件           →  添加中间转换组件');
  console.log('  • 修改参数           →  修改配置参数');
  console.log('  • 不对 / 错了        →  拒绝当前方案');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch((error) => {
  console.error('❌ 程序异常:', error);
  logger.error('程序异常', { error: error.message, stack: error.stack });
  process.exit(1);
});
