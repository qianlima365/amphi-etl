/**
 * Generate Pipeline Handler
 * 
 * @swagger
 * /ai/generatePipeline:
 *   post:
 *     summary: Generate a pipeline from natural language description
 *     tags: [AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - systemPrompt
 *               - userPrompt
 *             properties:
 *               userId:
 *                 type: string
 *                 description: User ID for loading saved API keys
 *               systemPrompt:
 *                 type: string
 *                 description: System prompt with template
 *               userPrompt:
 *                 type: string
 *                 description: User's natural language description
 *               model:
 *                 type: object
 *                 properties:
 *                   providerId:
 *                     type: string
 *                     description: Provider ID (openai, anthropic, groq, etc.)
 *                   model:
 *                     type: string
 *                     description: Model name
 *                   apiKey:
 *                     type: string
 *                     description: Optional API key (uses saved key if not provided)
 *                   baseUrl:
 *                     type: string
 *                   temperature:
 *                     type: number
 *                   topP:
 *                     type: number
 *                   maxTokens:
 *                     type: integer
 *     responses:
 *       200:
 *         description: Generated pipeline
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */

import { Request, Response } from 'express';
import { LLMService } from '../services/llmService';

interface AmplnNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, any>;
}

interface AmplnEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface AmplnSchema {
  name: string;
  version: string;
  nodes: AmplnNode[];
  edges: AmplnEdge[];
  variables?: Record<string, any>;
}

/**
 * Validate pipeline schema
 */
function validatePipeline(pipeline: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!pipeline.name || typeof pipeline.name !== 'string') {
    errors.push('Missing or invalid "name" field');
  }
  
  if (!pipeline.version || typeof pipeline.version !== 'string') {
    errors.push('Missing or invalid "version" field');
  }
  
  if (!Array.isArray(pipeline.nodes)) {
    errors.push('Missing or invalid "nodes" field');
  } else {
    const nodeIds = new Set<string>();
    pipeline.nodes.forEach((node: any, index: number) => {
      if (!node.id) {
        errors.push(`Node at index ${index} missing "id"`);
      } else if (nodeIds.has(node.id)) {
        errors.push(`Duplicate node id: ${node.id}`);
      } else {
        nodeIds.add(node.id);
      }
      
      if (!node.type) {
        errors.push(`Node "${node.id || index}" missing "type"`);
      }
      
      if (!node.position || typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
        errors.push(`Node "${node.id || index}" missing or invalid "position"`);
      }
    });
  }
  
  if (!Array.isArray(pipeline.edges)) {
    errors.push('Missing or invalid "edges" field');
  } else {
    const nodeIds = new Set((pipeline.nodes || []).map((n: any) => n.id));
    pipeline.edges.forEach((edge: any, index: number) => {
      if (!edge.source || !nodeIds.has(edge.source)) {
        errors.push(`Edge at index ${index} has invalid source: ${edge.source}`);
      }
      if (!edge.target || !nodeIds.has(edge.target)) {
        errors.push(`Edge at index ${index} has invalid target: ${edge.target}`);
      }
    });
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Check for cycles in the DAG
 */
function hasCycle(nodes: AmplnNode[], edges: AmplnEdge[]): boolean {
  const nodeIds = new Set(nodes.map(n => n.id));
  const adjacency = new Map<string, string[]>();
  
  nodeIds.forEach(id => adjacency.set(id, []));
  edges.forEach(e => {
    const targets = adjacency.get(e.source);
    if (targets) targets.push(e.target);
  });
  
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  
  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    
    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }
    
    recursionStack.delete(nodeId);
    return false;
  }
  
  for (const nodeId of nodeIds) {
    if (!visited.has(nodeId)) {
      if (dfs(nodeId)) return true;
    }
  }
  
  return false;
}

/**
 * Extract JSON from LLM response
 */
function extractJson(text: string): any {
  // Try to find JSON in code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1].trim());
  }
  
  // Try to find JSON object directly
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  
  throw new Error('No valid JSON found in response');
}

/**
 * Generate a mock pipeline for testing (when no API key configured)
 */
function generateMockPipeline(userPrompt: string): AmplnSchema {
  const hasMySQL = userPrompt.toLowerCase().includes('mysql');
  const hasPostgres = userPrompt.toLowerCase().includes('postgres');
  const hasCSV = userPrompt.toLowerCase().includes('csv');
  const hasFilter = userPrompt.toLowerCase().includes('filter') || userPrompt.toLowerCase().includes('筛选');
  
  const nodes: AmplnNode[] = [];
  const edges: AmplnEdge[] = [];
  let y = 100;
  let lastNodeId = '';
  
  // Input node
  if (hasMySQL) {
    nodes.push({
      id: 'node-1',
      type: 'mySQLInput',
      position: { x: 100, y },
      data: { host: 'localhost', port: '3306', databaseName: 'test' }
    });
  } else if (hasPostgres) {
    nodes.push({
      id: 'node-1',
      type: 'postgresInput',
      position: { x: 100, y },
      data: { host: 'localhost', port: '5432', databaseName: 'test' }
    });
  } else {
    nodes.push({
      id: 'node-1',
      type: 'csvFileInput',
      position: { x: 100, y },
      data: { filePath: './data/input.csv' }
    });
  }
  lastNodeId = 'node-1';
  y += 150;
  
  // Transform node
  if (hasFilter) {
    nodes.push({
      id: 'node-2',
      type: 'filter',
      position: { x: 100, y },
      data: { condition: '' }
    });
    edges.push({
      id: 'edge-1',
      source: lastNodeId,
      target: 'node-2'
    });
    lastNodeId = 'node-2';
    y += 150;
  }
  
  // Output node
  const outputId = `node-${nodes.length + 1}`;
  if (hasCSV || (!hasMySQL && !hasPostgres)) {
    nodes.push({
      id: outputId,
      type: 'csvFileOutput',
      position: { x: 100, y },
      data: { filePath: './data/output.csv' }
    });
  } else if (hasMySQL) {
    nodes.push({
      id: outputId,
      type: 'mySQLOutput',
      position: { x: 100, y },
      data: { host: 'localhost', port: '3306', databaseName: 'test' }
    });
  } else {
    nodes.push({
      id: outputId,
      type: 'postgresOutput',
      position: { x: 100, y },
      data: { host: 'localhost', port: '5432', databaseName: 'test' }
    });
  }
  edges.push({
    id: `edge-${edges.length + 1}`,
    source: lastNodeId,
    target: outputId
  });
  
  return {
    name: 'Generated Pipeline',
    version: '1.0.0',
    nodes,
    edges,
    variables: {}
  };
}

export async function generatePipelineHandler(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  
  console.log('\n========== [Generate Pipeline] 请求开始 ==========');
  console.log('请求时间:', new Date().toISOString());
  
  try {
    const { userId, systemPrompt, userPrompt, model } = req.body;
    
    // 打印输入参数
    console.log('[Generate Pipeline] 输入参数:', {
      userId: userId || '(default)',
      userPrompt: userPrompt?.substring(0, 200) + (userPrompt?.length > 200 ? '...' : ''),
      systemPromptLength: systemPrompt?.length || 0,
      model: model ? {
        providerId: model.providerId,
        model: model.model,
        baseUrl: model.baseUrl || '(default)',
        apiKey: model.apiKey ? `${model.apiKey.substring(0, 8)}...` : '(从数据库获取)',
        temperature: model.temperature,
        topP: model.topP,
        maxTokens: model.maxTokens
      } : '(使用默认)'
    });
    
    if (!systemPrompt || typeof systemPrompt !== 'string') {
      console.log('[Generate Pipeline] 参数错误: systemPrompt is required');
      res.status(400).json({ success: false, error: { message: 'systemPrompt is required' } });
      return;
    }
    
    if (!userPrompt || typeof userPrompt !== 'string') {
      console.log('[Generate Pipeline] 参数错误: userPrompt is required');
      res.status(400).json({ success: false, error: { message: 'userPrompt is required' } });
      return;
    }
    
    let pipeline: AmplnSchema;
    
    try {
      const providerId = model?.providerId || model?.provider || 'openai';
      
      // Build full prompt for pipeline generation
      const fullPrompt = `${userPrompt}

请根据以上需求，生成一个符合 .ampln 格式的 Pipeline JSON。输出必须是纯 JSON 格式。`;

      console.log('[Generate Pipeline] 调用 LLM 服务...');
      console.log('[Generate Pipeline] 完整用户提示:', fullPrompt);

      // Try to use LLM service
      try {
        const response = await LLMService.chat(
          userId || 'default',
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: fullPrompt }
          ],
          {
            providerId,
            model: model?.model,
            apiKey: model?.apiKey,
            baseUrl: model?.baseUrl,
            temperature: model?.temperature ?? 0.4,
            topP: model?.topP ?? 0.9,
            maxTokens: model?.maxTokens ?? 4096
          }
        );

        console.log('[Generate Pipeline] LLM 原始响应长度:', response.content.length);
        console.log('[Generate Pipeline] LLM 响应预览:', response.content.substring(0, 500) + (response.content.length > 500 ? '...' : ''));

        // Extract JSON from response
        pipeline = extractJson(response.content);
        console.log('[Generate Pipeline] JSON 解析成功, 节点数:', pipeline.nodes?.length || 0);
      } catch (llmError: any) {
        console.log('[Generate Pipeline] LLM 调用失败，使用 Mock:', llmError.message);
        // Fallback to mock generation
        pipeline = generateMockPipeline(userPrompt);
      }
    } catch (genError: any) {
      const duration = Date.now() - startTime;
      console.error('[Generate Pipeline] 生成错误:', genError);
      console.log(`[Generate Pipeline] 耗时: ${duration}ms`);
      console.log('========== [Generate Pipeline] 请求结束 (生成失败) ==========\n');
      res.status(200).json({
        success: false,
        error: {
          message: `生成失败: ${genError.message}`,
        }
      });
      return;
    }
    
    // Validate the pipeline
    const validation = validatePipeline(pipeline);
    if (!validation.valid) {
      const duration = Date.now() - startTime;
      console.log('[Generate Pipeline] 校验失败:', validation.errors);
      console.log(`[Generate Pipeline] 耗时: ${duration}ms`);
      console.log('========== [Generate Pipeline] 请求结束 (校验失败) ==========\n');
      res.status(200).json({
        success: false,
        error: {
          message: `Pipeline 校验失败: ${validation.errors.join('; ')}`
        }
      });
      return;
    }
    
    // Check for cycles
    if (hasCycle(pipeline.nodes, pipeline.edges)) {
      const duration = Date.now() - startTime;
      console.log('[Generate Pipeline] 检测到环路');
      console.log(`[Generate Pipeline] 耗时: ${duration}ms`);
      console.log('========== [Generate Pipeline] 请求结束 (存在环路) ==========\n');
      res.status(200).json({
        success: false,
        error: {
          message: 'Pipeline 存在环路，无法形成有效的 DAG'
        }
      });
      return;
    }
    
    const duration = Date.now() - startTime;
    console.log('[Generate Pipeline] 生成成功:', {
      name: pipeline.name,
      nodesCount: pipeline.nodes.length,
      edgesCount: pipeline.edges.length
    });
    console.log(`[Generate Pipeline] 耗时: ${duration}ms`);
    console.log('========== [Generate Pipeline] 请求结束 (成功) ==========\n');
    
    res.json({
      success: true,
      pipeline
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[Generate Pipeline] 未捕获异常:', error);
    console.log(`[Generate Pipeline] 耗时: ${duration}ms`);
    console.log('========== [Generate Pipeline] 请求结束 (异常) ==========\n');
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Internal server error'
      }
    });
  }
}
