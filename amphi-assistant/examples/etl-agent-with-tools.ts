/**
 * ETL Agent 工具调用示例
 * 
 * 展示如何使用执行层工具增强 ETL Agent 的能力
 */

import { SmartETLAgent } from '../agents/etl-agent';
import {
  OpenAILLMService,
  Neo4jKnowledgeGraph,
} from '../src';
import { createPostgresRepositoryFromEnv } from '../src/repositories/dialogue';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║     🤖 智能ETL编排Agent - 工具调用增强版                         ║');
  console.log('║     集成执行层工具：本体查询 | 组件搜索 | 参数验证 | Pipeline生成  ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // 初始化基础服务
  const llm = new OpenAILLMService({
    apiKey: process.env.SILICONFLOW_API_KEY!,
    model: process.env.SILICONFLOW_MODEL || 'deepseek-ai/DeepSeek-V2.5',
    baseURL: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
    temperature: 0.7,
  });

  const kg = new Neo4jKnowledgeGraph(
    process.env.NEO4J_URI!,
    process.env.NEO4J_USER!,
    process.env.NEO4J_PASSWORD!
  );

  const pgRepo = await createPostgresRepositoryFromEnv();

  // 创建 ETL Agent
  const agent = new SmartETLAgent(llm, kg, pgRepo, 'demo-user');
  
  // 初始化（会加载本体、注册工具）
  console.log('正在初始化 Agent...');
  await agent.initialize();
  console.log('Agent 初始化完成！\n');

  // 示例 1: 使用工具增强的意图理解
  console.log('═'.repeat(60));
  console.log('示例 1: 工具增强的意图理解');
  console.log('═'.repeat(60));
  
  const userInput1 = '我需要从 MySQL 数据库同步数据到 Elasticsearch';
  console.log(`\n用户: ${userInput1}\n`);
  
  const result1 = await agent.processWithTools(userInput1);
  console.log(`\n助手: ${result1.response}`);
  
  if (result1.toolCalls && result1.toolCalls.length > 0) {
    console.log('\n📋 调用的工具:');
    result1.toolCalls.forEach((call, i) => {
      console.log(`  ${i + 1}. ${call.tool}`);
      console.log(`     参数: ${JSON.stringify(call.params)}`);
      console.log(`     结果: ${call.result.success !== false ? '成功' : '失败'}`);
    });
  }

  // 示例 2: 使用工具搜索组件
  console.log('\n' + '═'.repeat(60));
  console.log('示例 2: 工具搜索组件');
  console.log('═'.repeat(60));
  
  console.log('\n搜索 MySQL 输入组件...\n');
  const searchResult = await agent.searchComponentsWithTools('mysql', 'input');
  console.log(`找到 ${searchResult.components.length} 个组件:`);
  searchResult.components.forEach((comp, i) => {
    console.log(`  ${i + 1}. ${comp.name} (${comp.category})`);
    console.log(`     ${comp.description?.slice(0, 100)}...`);
  });

  // 示例 3: 使用工具验证参数
  console.log('\n' + '═'.repeat(60));
  console.log('示例 3: 工具验证参数');
  console.log('═'.repeat(60));
  
  const testParams = {
    host: 'localhost',
    port: 3306,
    databaseName: 'test_db',
    // username 缺失（假设是必填项）
  };
  
  console.log('\n验证参数:', JSON.stringify(testParams, null, 2));
  
  if (searchResult.components.length > 0) {
    const validation = await agent.validateParamsWithTools(
      searchResult.components[0].id,
      testParams
    );
    
    console.log(`\n验证结果:`);
    console.log(`  是否有效: ${validation.valid ? '是' : '否'}`);
    if (validation.errors.length > 0) {
      console.log(`  错误:`);
      validation.errors.forEach(e => console.log(`    - ${e}`));
    }
    if (validation.warnings.length > 0) {
      console.log(`  警告:`);
      validation.warnings.forEach(w => console.log(`    - ${w}`));
    }
  }

  // 示例 4: 标准对话流程（带工具）
  console.log('\n' + '═'.repeat(60));
  console.log('示例 4: 完整对话流程（带工具）');
  console.log('═'.repeat(60));

  // 模拟对话
  const dialogues = [
    '帮我创建一个从 MySQL 到 PostgreSQL 的数据同步任务',
    '主机是 localhost，端口 3306，数据库是 sales',
    '目标数据库在 warehouse.db.internal',
    '需要过滤掉 deleted=true 的数据',
    '看起来可以，确认生成',
  ];

  for (const input of dialogues) {
    console.log(`\n👤 用户: ${input}`);
    
    const result = await agent.processWithTools(input);
    
    console.log(`\n🤖 助手: ${result.response}`);
    
    if (result.toolCalls && result.toolCalls.length > 0) {
      console.log('\n🔧 工具调用:');
      result.toolCalls.forEach((call, i) => {
        console.log(`   ${i + 1}. ${call.tool} - ${call.result.success !== false ? '✅' : '❌'}`);
      });
    }
    
    if (result.isComplete && result.pipelineFile) {
      console.log(`\n📁 Pipeline 文件: ${result.pipelineFile}`);
    }
  }

  // 总结
  console.log('\n' + '═'.repeat(60));
  console.log('总结');
  console.log('═'.repeat(60));
  console.log('✅ 执行层工具已集成到 ETL Agent');
  console.log('✅ 大模型可以自主决定调用哪些工具');
  console.log('✅ 工具包括:');
  console.log('   - query_ontology: 本体查询');
  console.log('   - search_components: 组件搜索');
  console.log('   - validate_params: 参数验证');
  console.log('   - check_connection: 连接检查');
  console.log('   - generate_pipeline: Pipeline 生成');
  console.log('   - recommend_transforms: 转换推荐');
  console.log('   - analyze_lineage: 血缘分析');
  console.log('   - get_component_detail: 组件详情');
  console.log('\n工具调用流程:');
  console.log('1. 用户输入 → 2. 大模型分析意图 → 3. 决定调用哪些工具');
  console.log('4. 执行工具 → 5. 获取结果 → 6. 大模型生成回复');

  await pgRepo.close();
  await kg.close();
}

main().catch(console.error);
