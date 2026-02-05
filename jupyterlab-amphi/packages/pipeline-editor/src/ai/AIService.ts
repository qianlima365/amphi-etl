/**
 * AI Service - Handles API calls for AI Assistant
 */

import { 
  GeneratePipelineRequest, 
  GeneratePipelineResponse, 
  OptimizePromptResponse,
  RenderPipelineResponse,
  AmplnSchema,
  ModelProvider,
  UserApiKeyConfig
} from './types';

// AI 服务地址：同源时用 /ai（需代理到 AI 服务）；否则用绝对地址（如 http://localhost:3000/ai）
// 可通过页面 data 属性 data-ai-service-url 或 环境覆盖
function getApiBase(): string {
  const host = window.location.hostname;
  const port = window.location.port;
  const fromData = document.documentElement.getAttribute('data-ai-service-url');
  if (fromData) return fromData.replace(/\/$/, '') + '/ai';
  // 与前端同源时走相对路径，依赖服务端把 /ai 代理到 AI 服务
  if (host !== 'localhost' && host !== '127.0.0.1') return '/ai';
  // 本地开发：前端多为 8888/8889，AI 服务另起在 3000，用绝对地址
  const aiPort = '3000';
  return `http://${host}:${aiPort}/ai`;
}
const API_BASE = getApiBase();
const OPTIMIZE_TIMEOUT = 8000; // 8 seconds
const GENERATE_TIMEOUT = 30000; // 30 seconds
const RENDER_TIMEOUT = 15000; // 15 seconds

// Get or create user ID
function getUserId(): string {
  let userId = localStorage.getItem('ai-assistant-user-id');
  if (!userId) {
    userId = 'user-' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('ai-assistant-user-id', userId);
  }
  return userId;
}

/**
 * Local prompt optimization rules (fallback)
 */
function localOptimizePrompt(prompt: string): string {
  let optimized = prompt;
  
  // Normalize punctuation
  optimized = optimized.replace(/,/g, '，').replace(/;/g, '；');
  
  // Add consistent prefixes
  optimized = optimized.replace(/^要求:/gm, '## 要求:');
  optimized = optimized.replace(/^参数:/gm, '## 参数:');
  optimized = optimized.replace(/^输出:/gm, '## 输出:');
  
  // Trim whitespace
  optimized = optimized.split('\n').map(line => line.trim()).join('\n');
  
  // Remove empty lines
  optimized = optimized.replace(/\n{3,}/g, '\n\n');
  
  return optimized.trim();
}

/**
 * Validate .ampln schema
 */
function validatePipeline(pipeline: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!pipeline.name || typeof pipeline.name !== 'string') {
    errors.push('缺少或无效的 name 字段');
  }
  
  if (!pipeline.version || typeof pipeline.version !== 'string') {
    errors.push('缺少或无效的 version 字段');
  }
  
  if (!Array.isArray(pipeline.nodes)) {
    errors.push('缺少或无效的 nodes 字段');
  } else {
    const nodeIds = new Set<string>();
    pipeline.nodes.forEach((node: any, index: number) => {
      if (!node.id) {
        errors.push(`节点 ${index} 缺少 id`);
      } else if (nodeIds.has(node.id)) {
        errors.push(`节点 id "${node.id}" 重复`);
      } else {
        nodeIds.add(node.id);
      }
      if (!node.type) {
        errors.push(`节点 ${node.id || index} 缺少 type`);
      }
    });
  }
  
  if (!Array.isArray(pipeline.edges)) {
    errors.push('缺少或无效的 edges 字段');
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Check for cycles in the pipeline DAG
 */
function hasCycle(nodes: any[], edges: any[]): boolean {
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

export class AIService {
  /**
   * Optimize prompt using service or local fallback
   */
  static async optimizePrompt(prompt: string): Promise<OptimizePromptResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPTIMIZE_TIMEOUT);
    
    try {
      const response = await fetch(`${API_BASE}/optimizePrompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        return {
          optimizedPrompt: data.optimizedPrompt || prompt,
          method: 'service',
          meta: data.meta
        };
      }
      
      // Fallback to local optimization
      console.warn('Prompt optimization service returned non-200, using local optimization');
      return {
        optimizedPrompt: localOptimizePrompt(prompt),
        method: 'local'
      };
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      // Fallback to local optimization
      console.warn('Prompt optimization service failed, using local optimization:', error.message);
      return {
        optimizedPrompt: localOptimizePrompt(prompt),
        method: 'local'
      };
    }
  }
  
  /**
   * Generate pipeline from prompt
   */
  static async generatePipeline(request: GeneratePipelineRequest): Promise<GeneratePipelineResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GENERATE_TIMEOUT);
    
    try {
      const response = await fetch(`${API_BASE}/generatePipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: {
            message: `服务返回错误: ${response.status} ${errorText}`
          }
        };
      }
      
      const data = await response.json();
      
      // If service returned error
      if (data.error) {
        return {
          success: false,
          error: data.error
        };
      }
      
      // Validate the pipeline
      const pipeline = data.pipeline || data;
      const validation = validatePipeline(pipeline);
      
      if (!validation.valid) {
        return {
          success: false,
          error: {
            message: `Pipeline 校验失败: ${validation.errors.join('; ')}`
          }
        };
      }
      
      // Check for cycles
      if (hasCycle(pipeline.nodes, pipeline.edges)) {
        return {
          success: false,
          error: {
            message: 'Pipeline 存在环路，请检查节点连接'
          }
        };
      }
      
      return {
        success: true,
        pipeline: pipeline as AmplnSchema
      };
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: {
            message: '请求超时，请稍后重试'
          }
        };
      }
      
      return {
        success: false,
        error: {
          message: `请求失败: ${error.message || '未知错误'}`
        }
      };
    }
  }
  
  /**
   * Render pipeline to the editor
   */
  static async renderPipeline(pipeline: AmplnSchema, filePath: string): Promise<RenderPipelineResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RENDER_TIMEOUT);
    
    let retryCount = 0;
    const maxRetries = 3;
    
    const attemptRender = async (): Promise<RenderPipelineResponse> => {
      try {
        const response = await fetch(`${API_BASE}/renderPipeline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pipeline, filePath }),
          signal: controller.signal
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          return {
            success: false,
            error: `渲染服务返回错误: ${response.status} ${errorText}`
          };
        }
        
        const data = await response.json();
        return {
          success: data.success !== false,
          message: data.message,
          error: data.error
        };
      } catch (error: any) {
        if (error.name === 'AbortError') {
          throw new Error('渲染请求超时');
        }
        throw error;
      }
    };
    
    try {
      while (retryCount < maxRetries) {
        try {
          const result = await attemptRender();
          clearTimeout(timeoutId);
          return result;
        } catch (error: any) {
          retryCount++;
          if (retryCount >= maxRetries) {
            throw error;
          }
          // Wait before retry
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      
      // Should not reach here
      return {
        success: false,
        error: '渲染失败，已超过最大重试次数'
      };
    } catch (error: any) {
      clearTimeout(timeoutId);
      return {
        success: false,
        error: `渲染失败: ${error.message || '未知错误'}。请下载 .ampln 文件手动导入。`
      };
    }
  }
  
  /**
   * Download pipeline as .ampln file
   */
  static downloadPipeline(pipeline: AmplnSchema, fileName: string): void {
    const content = JSON.stringify(pipeline, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.endsWith('.ampln') ? fileName : `${fileName}.ampln`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Get all available model providers
   */
  static async getProviders(): Promise<ModelProvider[]> {
    try {
      const response = await fetch(`${API_BASE}/providers`);
      if (!response.ok) {
        console.error('Failed to fetch providers');
        return [];
      }
      const data = await response.json();
      return data.providers || [];
    } catch (error) {
      console.error('Error fetching providers:', error);
      return [];
    }
  }

  /**
   * Get user's configured API keys
   */
  static async getUserApiKeys(): Promise<UserApiKeyConfig[]> {
    try {
      const userId = getUserId();
      const response = await fetch(`${API_BASE}/apikeys/${userId}`);
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return data.apiKeys || [];
    } catch (error) {
      console.error('Error fetching API keys:', error);
      return [];
    }
  }

  /**
   * Save API key for a provider
   */
  static async saveApiKey(providerId: string, apiKey: string, baseUrl?: string): Promise<boolean> {
    try {
      const userId = getUserId();
      const response = await fetch(`${API_BASE}/apikeys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, providerId, apiKey, baseUrl })
      });
      const data = await response.json();
      return data.success === true;
    } catch (error) {
      console.error('Error saving API key:', error);
      return false;
    }
  }

  /**
   * Delete API key for a provider
   */
  static async deleteApiKey(providerId: string): Promise<boolean> {
    try {
      const userId = getUserId();
      const response = await fetch(`${API_BASE}/apikeys/${userId}/${providerId}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      return data.success === true;
    } catch (error) {
      console.error('Error deleting API key:', error);
      return false;
    }
  }

  /**
   * Test API key connection. Returns full server response for display (message + detail/models).
   */
  static async testApiKey(
    providerId: string,
    apiKey: string,
    baseUrl?: string
  ): Promise<{ success: boolean; message: string; detail?: string[] }> {
    try {
      const response = await fetch(`${API_BASE}/apikeys/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, apiKey, baseUrl })
      });
      const data = await response.json();
      return {
        success: data.success === true,
        message: data.message ?? (data.success ? '连接测试成功' : '连接测试失败'),
        detail: data.models
      };
    } catch (error: any) {
      return { success: false, message: error.message || '连接测试失败' };
    }
  }

  /**
   * Get user ID for API calls
   */
  static getUserId(): string {
    return getUserId();
  }

  /**
   * Save user model preferences
   */
  static async savePreferences(prefs: {
    defaultProviderId?: string;
    defaultModel?: string;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    customPrompt?: string;
  }): Promise<boolean> {
    try {
      const userId = getUserId();
      const response = await fetch(`${API_BASE}/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...prefs })
      });
      const data = await response.json();
      return data.success === true;
    } catch (error) {
      console.error('Error saving preferences:', error);
      return false;
    }
  }

  /**
   * Get user model preferences
   */
  static async getPreferences(): Promise<{
    defaultProviderId?: string;
    defaultModel?: string;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    customPrompt?: string;
  } | null> {
    try {
      const userId = getUserId();
      const response = await fetch(`${API_BASE}/preferences/${userId}`);
      const data = await response.json();
      if (data.success && data.preferences) {
        const p = data.preferences;
        return {
          defaultProviderId: p.default_provider_id,
          defaultModel: p.default_model,
          temperature: p.temperature,
          topP: p.top_p,
          maxTokens: p.max_tokens,
          customPrompt: p.custom_prompt
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting preferences:', error);
      return null;
    }
  }

  // ==================== Agent API ====================

  /**
   * 获取 Agent API 基础路径
   */
  private static getAgentApiBase(): string {
    return API_BASE.replace('/ai', '/agent');
  }

  /**
   * 统一对话接口 - 自动判断意图
   * 如果是 Pipeline 相关请求，自动生成 Pipeline
   * 否则返回普通对话回复
   */
  static async chat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options?: {
      model?: {
        providerId: string;
        model?: string;
        apiKey?: string;
        baseUrl?: string;
        temperature?: number;
        topP?: number;
        maxTokens?: number;
      };
      customPrompt?: string;
      intentThreshold?: number;
    }
  ): Promise<{
    success: boolean;
    message?: string;
    intent?: {
      type: 'pipeline_generate' | 'pipeline_edit' | 'chat' | 'none';
      confidence: number;
    };
    pipeline?: AmplnSchema;
    validation?: {
      valid: boolean;
      issues: Array<{
        level: 'error' | 'warning' | 'info';
        message: string;
        nodeId?: string;
        suggestion?: string;
      }>;
      summary: { errors: number; warnings: number; infos: number };
    };
    metadata?: {
      generationMethod?: string;
      duration?: number;
      model?: string;
      provider?: string;
    };
    error?: { message: string; suggestions?: string[] };
  }> {
    const AGENT_BASE = this.getAgentApiBase();
    const userId = getUserId();

    console.log('[AIService] 调用统一对话 API...');
    console.log('[AIService] 消息数:', messages.length);

    try {
      const response = await fetch(`${AGENT_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          userId,
          ...options
        })
      });

      const data = await response.json();
      console.log('[AIService] 对话响应:', {
        success: data.success,
        intent: data.intent,
        hasPipeline: !!data.pipeline,
        messagePreview: data.message?.substring(0, 100)
      });
      return data;
    } catch (error: any) {
      console.error('[AIService] 对话错误:', error);
      return {
        success: false,
        error: { message: error.message }
      };
    }
  }

  /**
   * 意图识别
   */
  static async recognizeIntent(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    options?: {
      threshold?: number;
      useLLM?: boolean;
      providerId?: string;
      model?: string;
    }
  ): Promise<{
    success: boolean;
    result?: {
      intent: 'pipeline_generate' | 'pipeline_edit' | 'none';
      confidence: number;
      reasons?: string[];
      shouldTrigger: boolean;
      suggestedTemplate?: any;
    };
    error?: { message: string };
  }> {
    const AGENT_BASE = this.getAgentApiBase();
    const userId = getUserId();

    console.log('[AIService] 调用意图识别 API...');

    try {
      const response = await fetch(`${AGENT_BASE}/intents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          userId,
          ...options
        })
      });

      const data = await response.json();
      console.log('[AIService] 意图识别结果:', data);
      return data;
    } catch (error: any) {
      console.error('[AIService] 意图识别错误:', error);
      return {
        success: false,
        error: { message: error.message }
      };
    }
  }

  /**
   * 使用 Agent 生成 Pipeline
   */
  static async agentGeneratePipeline(
    requirement: string,
    options?: {
      templateId?: string;
      variables?: Record<string, any>;
      useLLM?: boolean;
      model?: {
        providerId: string;
        model?: string;
        apiKey?: string;
        baseUrl?: string;
        temperature?: number;
        maxTokens?: number;
      };
    }
  ): Promise<{
    success: boolean;
    pipeline?: AmplnSchema;
    validation?: {
      valid: boolean;
      issues: Array<{
        level: 'error' | 'warning' | 'info';
        code: string;
        message: string;
        path?: string;
        nodeId?: string;
        suggestion?: string;
      }>;
      summary: { errors: number; warnings: number; infos: number };
    };
    metadata?: {
      generationMethod: string;
      duration: number;
      templateUsed: string;
    };
    error?: { message: string; suggestions?: string[] };
  }> {
    const AGENT_BASE = this.getAgentApiBase();
    const userId = getUserId();

    console.log('[AIService] 调用 Agent 生成 Pipeline...');
    console.log('[AIService] 需求:', requirement.substring(0, 200));

    try {
      const response = await fetch(`${AGENT_BASE}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirement,
          userId,
          ...options
        })
      });

      const data = await response.json();
      console.log('[AIService] Agent 生成结果:', {
        success: data.success,
        hasPoipeline: !!data.pipeline,
        validation: data.validation?.summary
      });
      return data;
    } catch (error: any) {
      console.error('[AIService] Agent 生成错误:', error);
      return {
        success: false,
        error: { message: error.message }
      };
    }
  }

  /**
   * 验证 Pipeline
   */
  static async validatePipeline(
    pipeline: AmplnSchema,
    autoFix = false
  ): Promise<{
    success: boolean;
    validation?: {
      valid: boolean;
      issues: Array<{
        level: 'error' | 'warning' | 'info';
        code: string;
        message: string;
        path?: string;
        nodeId?: string;
        suggestion?: string;
      }>;
      summary: { errors: number; warnings: number; infos: number };
      fixable: boolean;
    };
    fixedPipeline?: AmplnSchema;
    error?: { message: string };
  }> {
    const AGENT_BASE = this.getAgentApiBase();

    console.log('[AIService] 调用 Pipeline 验证...');

    try {
      const response = await fetch(`${AGENT_BASE}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline, autoFix })
      });

      const data = await response.json();
      console.log('[AIService] 验证结果:', data.validation?.summary);
      return data;
    } catch (error: any) {
      console.error('[AIService] 验证错误:', error);
      return {
        success: false,
        error: { message: error.message }
      };
    }
  }

  /**
   * 获取模板列表
   */
  static async getTemplates(options?: {
    category?: string;
    search?: string;
  }): Promise<{
    success: boolean;
    templates?: Array<{
      id: string;
      name: string;
      description: string;
      category: string;
      version: string;
      variables: Array<{
        name: string;
        type: string;
        required: boolean;
        default?: any;
        description?: string;
      }>;
      tags?: string[];
    }>;
    error?: { message: string };
  }> {
    const AGENT_BASE = this.getAgentApiBase();

    try {
      const params = new URLSearchParams();
      if (options?.category) params.append('category', options.category);
      if (options?.search) params.append('search', options.search);

      const url = params.toString() 
        ? `${AGENT_BASE}/templates?${params}` 
        : `${AGENT_BASE}/templates`;

      const response = await fetch(url);
      return await response.json();
    } catch (error: any) {
      console.error('[AIService] 获取模板列表错误:', error);
      return {
        success: false,
        error: { message: error.message }
      };
    }
  }

  /**
   * 获取单个模板详情
   */
  static async getTemplateDetail(templateId: string): Promise<{
    success: boolean;
    template?: any;
    error?: { message: string };
  }> {
    const AGENT_BASE = this.getAgentApiBase();

    try {
      const response = await fetch(`${AGENT_BASE}/templates/${templateId}`);
      return await response.json();
    } catch (error: any) {
      console.error('[AIService] 获取模板详情错误:', error);
      return {
        success: false,
        error: { message: error.message }
      };
    }
  }

  /**
   * 获取节点库
   */
  static async getNodes(options?: {
    category?: 'inputs' | 'transforms' | 'outputs';
    search?: string;
  }): Promise<{
    success: boolean;
    nodes?: Array<{
      id: string;
      name: string;
      category: string;
      description?: string;
      params: Array<{
        key: string;
        type: string;
        required: boolean;
        default?: any;
        description?: string;
      }>;
      inputs: Array<{ name: string; type: string }>;
      outputs: Array<{ name: string; type: string }>;
      tags?: string[];
    }>;
    categories?: { inputs: number; transforms: number; outputs: number };
    error?: { message: string };
  }> {
    const AGENT_BASE = this.getAgentApiBase();

    try {
      const params = new URLSearchParams();
      if (options?.category) params.append('category', options.category);
      if (options?.search) params.append('search', options.search);

      const url = params.toString() 
        ? `${AGENT_BASE}/nodes?${params}` 
        : `${AGENT_BASE}/nodes`;

      const response = await fetch(url);
      return await response.json();
    } catch (error: any) {
      console.error('[AIService] 获取节点库错误:', error);
      return {
        success: false,
        error: { message: error.message }
      };
    }
  }

  /**
   * 获取单个节点详情
   */
  static async getNodeDetail(nodeId: string): Promise<{
    success: boolean;
    node?: any;
    error?: { message: string };
  }> {
    const AGENT_BASE = this.getAgentApiBase();

    try {
      const response = await fetch(`${AGENT_BASE}/nodes/${nodeId}`);
      return await response.json();
    } catch (error: any) {
      console.error('[AIService] 获取节点详情错误:', error);
      return {
        success: false,
        error: { message: error.message }
      };
    }
  }
}

export default AIService;
