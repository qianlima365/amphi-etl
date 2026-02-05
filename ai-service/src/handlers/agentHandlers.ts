/**
 * Agent Handlers - Pipeline Agent API 处理器
 * 
 * 提供以下 API：
 * - POST /agent/intents - 意图识别
 * - POST /agent/generate - Pipeline 生成
 * - POST /agent/validate - Pipeline 验证
 * - GET /agent/templates - 获取模板列表
 * - GET /agent/nodes - 获取节点库
 */

import { Request, Response } from 'express';
import { IntentService, ConversationMessage } from '../services/intentService';
import { TemplateService } from '../services/templateService';
import { DocParser } from '../services/docParser';
import { GraphBuilder, PipelineModel } from '../services/graphBuilder';
import { Validator } from '../services/validator';
import { LLMService } from '../services/llmService';

/**
 * POST /agent/intents
 * 意图识别
 * 
 * @swagger
 * /agent/intents:
 *   post:
 *     summary: 识别用户对话中的意图
 *     tags: [Agent]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messages
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *               threshold:
 *                 type: number
 *                 description: 置信度阈值 (0-1)
 *               userId:
 *                 type: string
 *               providerId:
 *                 type: string
 *                 description: 提供 providerId 时自动启用 LLM 语义理解
 *               model:
 *                 type: string
 *     responses:
 *       200:
 *         description: 意图识别结果
 */
export async function intentsHandler(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  
  try {
    const { messages, threshold, userId, providerId, model } = req.body;

    console.log('\n========== [Agent API] /agent/intents ==========');
    console.log('消息数量:', messages?.length || 0);
    console.log('使用 LLM:', providerId ? '是' : '否');

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({
        success: false,
        error: { message: 'messages 是必填项' }
      });
      return;
    }

    const result = await IntentService.recognizeIntent(
      messages as ConversationMessage[],
      { threshold, userId, providerId, model }
    );

    const shouldTrigger = IntentService.shouldTrigger(result, threshold);

    const duration = Date.now() - startTime;
    console.log(`[Agent API] 意图识别完成 (${duration}ms):`, result.intent, result.confidence);

    res.json({
      success: true,
      result: {
        ...result,
        shouldTrigger,
        suggestedTemplate: result.suggestedTemplate ? 
          TemplateService.getTemplate(result.suggestedTemplate) : undefined
      }
    });
  } catch (error: any) {
    console.error('[Agent API] intents error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
}

/**
 * POST /agent/generate
 * Pipeline 生成
 * 
 * @swagger
 * /agent/generate:
 *   post:
 *     summary: 根据需求生成 Pipeline
 *     tags: [Agent]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - requirement
 *             properties:
 *               requirement:
 *                 type: string
 *                 description: 用户需求描述
 *               templateId:
 *                 type: string
 *                 description: 模板 ID
 *               variables:
 *                 type: object
 *                 description: 模板变量
 *               userId:
 *                 type: string
 *               model:
 *                 type: object
 *                 description: 提供 model.providerId 时自动启用 LLM 生成
 *                 properties:
 *                   providerId:
 *                     type: string
 *                   model:
 *                     type: string
 *                   apiKey:
 *                     type: string
 *                   temperature:
 *                     type: number
 *     responses:
 *       200:
 *         description: 生成的 Pipeline 和验证报告
 */
export async function generateHandler(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();

  try {
    const { 
      requirement, 
      templateId, 
      variables, 
      userId,
      model: modelConfig
    } = req.body;

    const useLLM = !!(userId && modelConfig?.providerId);

    console.log('\n========== [Agent API] /agent/generate ==========');
    console.log('需求:', requirement?.substring(0, 200));
    console.log('模板 ID:', templateId);
    console.log('使用 LLM:', useLLM ? '是' : '否');

    if (!requirement || typeof requirement !== 'string') {
      res.status(400).json({
        success: false,
        error: { message: 'requirement 是必填项' }
      });
      return;
    }

    let pipeline: PipelineModel | null = null;
    let generationMethod = 'rule';

    // 方法 1: 使用 LLM 生成（当配置了模型时）
    if (useLLM) {
      try {
        // 获取模板
        const template = templateId ? 
          TemplateService.getTemplate(templateId) : 
          TemplateService.recommendTemplate(requirement);

        let systemPrompt = '';
        if (template) {
          const renderResult = TemplateService.renderTemplateContent(template, variables || {});
          if (renderResult.success) {
            systemPrompt = renderResult.renderedPrompt!;
          } else {
            systemPrompt = template.systemPrompt;
          }
        } else {
          // 使用默认通用模板
          const generalTemplate = TemplateService.getTemplate('general');
          systemPrompt = generalTemplate?.systemPrompt || '';
        }

        console.log('[Agent API] 调用 LLM 生成...');

        const llmResponse = await LLMService.chat(
          userId,
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: requirement + '\n\n请生成 Pipeline JSON。' }
          ],
          {
            providerId: modelConfig.providerId,
            model: modelConfig.model,
            apiKey: modelConfig.apiKey,
            baseUrl: modelConfig.baseUrl,
            temperature: modelConfig.temperature ?? 0.3,
            maxTokens: modelConfig.maxTokens ?? 4096
          }
        );

        // 从 LLM 响应中提取 JSON
        const jsonMatch = llmResponse.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            pipeline = JSON.parse(jsonMatch[0]);
            generationMethod = 'llm';
            console.log('[Agent API] LLM 生成成功');
          } catch (parseError) {
            console.log('[Agent API] LLM 响应 JSON 解析失败，回退到规则生成');
          }
        }
      } catch (llmError: any) {
        console.log('[Agent API] LLM 生成失败:', llmError.message, '，回退到规则生成');
      }
    }

    // 方法 2: 使用规则生成（作为后备或主要方法）
    if (!pipeline) {
      console.log('[Agent API] 使用规则生成...');
      const buildResult = GraphBuilder.buildFromRequirement({
        requirement,
        variables
      });

      if (buildResult.success && buildResult.pipeline) {
        pipeline = buildResult.pipeline;
        generationMethod = 'rule';
      } else {
        res.status(200).json({
          success: false,
          error: {
            message: buildResult.errors?.join('; ') || '生成失败',
            suggestions: buildResult.suggestions
          }
        });
        return;
      }
    }

    // 验证生成的 Pipeline
    const validationResult = Validator.validate(pipeline);

    // 如果有可自动修复的问题，尝试修复
    if (validationResult.fixable && validationResult.summary.errors > 0) {
      const fixedPipeline = Validator.applyAutoFixes(pipeline, validationResult.issues);
      const revalidation = Validator.validate(fixedPipeline);
      
      if (revalidation.summary.errors < validationResult.summary.errors) {
        pipeline = fixedPipeline;
        console.log('[Agent API] 已应用自动修复');
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Agent API] 生成完成 (${duration}ms), 方法: ${generationMethod}`);
    console.log('========== [Agent API] 生成结束 ==========\n');

    res.json({
      success: validationResult.valid,
      pipeline,
      validation: validationResult,
      metadata: {
        generationMethod,
        duration,
        templateUsed: templateId || 'auto'
      }
    });
  } catch (error: any) {
    console.error('[Agent API] generate error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
}

/**
 * POST /agent/validate
 * Pipeline 验证
 * 
 * @swagger
 * /agent/validate:
 *   post:
 *     summary: 验证 Pipeline 配置
 *     tags: [Agent]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pipeline
 *             properties:
 *               pipeline:
 *                 type: object
 *                 description: Pipeline 配置对象
 *               autoFix:
 *                 type: boolean
 *                 description: 是否自动修复问题
 *     responses:
 *       200:
 *         description: 验证结果
 */
export async function validateHandler(req: Request, res: Response): Promise<void> {
  try {
    const { pipeline, autoFix = false } = req.body;

    console.log('\n========== [Agent API] /agent/validate ==========');

    if (!pipeline || typeof pipeline !== 'object') {
      res.status(400).json({
        success: false,
        error: { message: 'pipeline 是必填项' }
      });
      return;
    }

    let result = Validator.validate(pipeline);
    let fixedPipeline = null;

    if (autoFix && result.fixable) {
      fixedPipeline = Validator.applyAutoFixes(pipeline, result.issues);
      result = Validator.validate(fixedPipeline);
    }

    console.log('[Agent API] 验证结果:', result.summary);
    console.log('========== [Agent API] 验证结束 ==========\n');

    res.json({
      success: result.valid,
      validation: result,
      fixedPipeline: autoFix ? fixedPipeline : undefined
    });
  } catch (error: any) {
    console.error('[Agent API] validate error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
}

/**
 * GET /agent/templates
 * 获取模板列表
 * 
 * @swagger
 * /agent/templates:
 *   get:
 *     summary: 获取所有可用模板
 *     tags: [Agent]
 *     parameters:
 *       - name: category
 *         in: query
 *         schema:
 *           type: string
 *         description: 按分类筛选
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *         description: 搜索关键词
 *     responses:
 *       200:
 *         description: 模板列表
 */
export function templatesHandler(req: Request, res: Response): void {
  try {
    const { category, search } = req.query;

    let templates = TemplateService.getAllTemplates();

    if (category && typeof category === 'string') {
      templates = templates.filter(t => t.category === category);
    }

    if (search && typeof search === 'string') {
      templates = TemplateService.searchTemplates(search);
    }

    // 简化输出，不返回完整的 systemPrompt
    const simplifiedTemplates = templates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      version: t.version,
      variables: t.variables,
      tags: t.tags
    }));

    res.json({
      success: true,
      templates: simplifiedTemplates,
      total: simplifiedTemplates.length
    });
  } catch (error: any) {
    console.error('[Agent API] templates error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
}

/**
 * GET /agent/templates/:id
 * 获取单个模板详情
 */
export function templateDetailHandler(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const template = TemplateService.getTemplate(id);

    if (!template) {
      res.status(404).json({
        success: false,
        error: { message: `模板 ${id} 不存在` }
      });
      return;
    }

    res.json({
      success: true,
      template
    });
  } catch (error: any) {
    console.error('[Agent API] template detail error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
}

/**
 * GET /agent/nodes
 * 获取节点库
 * 
 * @swagger
 * /agent/nodes:
 *   get:
 *     summary: 获取所有可用节点类型
 *     tags: [Agent]
 *     parameters:
 *       - name: category
 *         in: query
 *         schema:
 *           type: string
 *           enum: [inputs, transforms, outputs]
 *         description: 按分类筛选
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *         description: 搜索关键词
 *     responses:
 *       200:
 *         description: 节点库列表
 */
export function nodesHandler(req: Request, res: Response): void {
  try {
    const { category, search } = req.query;

    let nodes = DocParser.getBuiltinNodes();

    if (category && typeof category === 'string') {
      nodes = nodes.filter(n => n.category === category);
    }

    if (search && typeof search === 'string') {
      nodes = DocParser.searchNodes(search);
    }

    res.json({
      success: true,
      nodes,
      total: nodes.length,
      categories: {
        inputs: DocParser.getNodesByCategory('inputs').length,
        transforms: DocParser.getNodesByCategory('transforms').length,
        outputs: DocParser.getNodesByCategory('outputs').length
      }
    });
  } catch (error: any) {
    console.error('[Agent API] nodes error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
}

/**
 * GET /agent/nodes/:id
 * 获取单个节点详情
 */
export function nodeDetailHandler(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const node = DocParser.getNodeById(id);

    if (!node) {
      res.status(404).json({
        success: false,
        error: { message: `节点 ${id} 不存在` }
      });
      return;
    }

    res.json({
      success: true,
      node
    });
  } catch (error: any) {
    console.error('[Agent API] node detail error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
}

/**
 * POST /agent/preview
 * 生成可视化布局（可选）
 */
export function previewHandler(req: Request, res: Response): void {
  try {
    const { pipeline } = req.body;

    if (!pipeline || !pipeline.nodes) {
      res.status(400).json({
        success: false,
        error: { message: 'pipeline 是必填项' }
      });
      return;
    }

    // 计算自动布局
    const layout = calculateLayout(pipeline);

    res.json({
      success: true,
      layout
    });
  } catch (error: any) {
    console.error('[Agent API] preview error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
}

/**
 * 计算节点布局
 */
function calculateLayout(pipeline: PipelineModel): { nodes: Array<{ id: string; x: number; y: number }> } {
  const nodes: Array<{ id: string; x: number; y: number }> = [];
  
  // 简单的分层布局
  const inputNodes = pipeline.nodes.filter(n => {
    const spec = DocParser.getNodeById(n.type);
    return spec?.category === 'inputs';
  });
  
  const transformNodes = pipeline.nodes.filter(n => {
    const spec = DocParser.getNodeById(n.type);
    return spec?.category === 'transforms';
  });
  
  const outputNodes = pipeline.nodes.filter(n => {
    const spec = DocParser.getNodeById(n.type);
    return spec?.category === 'outputs';
  });

  // 布局参数
  const startX = 100;
  const startY = 100;
  const layerGap = 250;
  const nodeGap = 150;

  // 输入层
  inputNodes.forEach((node, i) => {
    nodes.push({
      id: node.id,
      x: startX,
      y: startY + i * nodeGap
    });
  });

  // 转换层
  transformNodes.forEach((node, i) => {
    nodes.push({
      id: node.id,
      x: startX + layerGap,
      y: startY + i * nodeGap
    });
  });

  // 输出层
  outputNodes.forEach((node, i) => {
    nodes.push({
      id: node.id,
      x: startX + layerGap * 2,
      y: startY + i * nodeGap
    });
  });

  return { nodes };
}

export default {
  intentsHandler,
  generateHandler,
  validateHandler,
  templatesHandler,
  templateDetailHandler,
  nodesHandler,
  nodeDetailHandler,
  previewHandler
};
