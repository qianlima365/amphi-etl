/**
 * LLM Service - Unified interface using LlamaIndex.TS
 * 支持多种模型厂商: OpenAI, Anthropic, Groq, Ollama 等
 */

import { OpenAI } from '@llamaindex/openai';
import { Anthropic } from '@llamaindex/anthropic';
import { Groq } from '@llamaindex/groq';
import { Ollama } from '@llamaindex/ollama';
import { deepseek } from '@llamaindex/deepseek';
import { dbOps } from '../db';

export interface LLMConfig {
  providerId: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  provider: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Provider base URLs
 */
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  ollama: 'http://localhost:11434',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  siliconflow: 'https://api.siliconflow.cn/v1',
};

/**
 * Create LLM instance based on provider using LlamaIndex
 */
function createLLM(providerId: string, apiKey: string | undefined, model: string, baseUrl: string, config: LLMConfig): any {
  const temperature = config.temperature ?? 0.7;
  const maxTokens = config.maxTokens ?? 2048;

  switch (providerId) {
    case 'openai':
      return new OpenAI({
        apiKey: apiKey,
        model: model,
        temperature: temperature,
        maxTokens: maxTokens,
      });

    case 'anthropic':
      return new Anthropic({
        apiKey: apiKey,
        model: model,
        temperature: temperature,
        maxTokens: maxTokens,
      });

    case 'groq':
      return new Groq({
        apiKey: apiKey,
        model: model,
        temperature: temperature,
        maxTokens: maxTokens,
      });

    case 'ollama':
      return new Ollama({
        model: model,
        config: {
          host: baseUrl || 'http://localhost:11434'
        },
        options: {
          temperature: temperature
        }
      });

    case 'deepseek':
      return new OpenAI({
        apiKey: apiKey,
        model: model,
        temperature: temperature,
        maxTokens: maxTokens,
        additionalChatOptions: {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          }
        },
        // @ts-ignore - baseURL is supported but not in types
        baseURL: baseUrl,
      } as any);
    case 'siliconflow':
      return new OpenAI({
        apiKey: apiKey,
        model: model,
        temperature: temperature,
        maxTokens: maxTokens,
        additionalChatOptions: {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          }
        },
        // @ts-ignore - baseURL is supported but not in types
        baseURL: baseUrl,
      } as any);
    case 'gemini':
    case 'custom':
      // Use OpenAI-compatible interface with custom base URL
      return new OpenAI({
        apiKey: apiKey,
        model: model,
        temperature: temperature,
        maxTokens: maxTokens,
        additionalChatOptions: {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          }
        },
        // @ts-ignore - baseURL is supported but not in types
        baseURL: baseUrl,
      } as any);

    default:
      throw new Error(`Unsupported provider: ${providerId}`);
  }
}

/**
 * LLM Service class
 */
export class LLMService {
  /**
   * Chat with LLM
   */
  static async chat(
    userId: string,
    messages: ChatMessage[],
    config: LLMConfig
  ): Promise<ChatResponse> {
    const startTime = Date.now();
    
    console.log('\n========== [LLM Chat] 调用开始 ==========');
    console.log('调用时间:', new Date().toISOString());
    console.log('用户ID:', userId);
    console.log('输入配置:', {
      providerId: config.providerId,
      model: config.model,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey ? `${config.apiKey.substring(0, 8)}...` : '(从数据库获取)',
      temperature: config.temperature,
      topP: config.topP,
      maxTokens: config.maxTokens
    });
    console.log('输入消息:', messages.map(m => ({
      role: m.role,
      content: m.content.length > 200 ? m.content.substring(0, 200) + '...' : m.content
    })));

    // Get provider
    const provider = dbOps.getProvider(config.providerId);
    if (!provider) {
      console.error('[LLM Chat] 厂商未找到:', config.providerId);
      throw new Error(`Provider not found: ${config.providerId}`);
    }
    console.log('厂商信息:', {
      id: provider.id,
      name: provider.display_name,
      base_url: provider.base_url,
      requires_api_key: provider.requires_api_key
    });

    // Get API key - 优先级:
    // 1. 请求中直接传入的 apiKey
    // 2. 用户保存在 SQLite 中的 apiKey
    let apiKey = config.apiKey;
    let baseUrl = config.baseUrl;
    
    if (!apiKey && provider.requires_api_key) {
      const savedKey = dbOps.getApiKey(userId, config.providerId);
      if (savedKey) {
        apiKey = savedKey.api_key;
        if (savedKey.base_url) {
          baseUrl = savedKey.base_url;
        }
        console.log('[LLM Chat] 使用数据库中保存的 API Key');
      }
    }

    if (provider.requires_api_key && !apiKey) {
      console.error('[LLM Chat] 缺少 API Key');
      throw new Error(`请先配置 ${provider.display_name} 的 API Key`);
    }

    // Get model and base URL
    const model = config.model || provider.supported_models[0];
    if (!baseUrl) {
      baseUrl = PROVIDER_BASE_URLS[config.providerId] || provider.base_url;
    }

    console.log('[LLM Chat] 最终调用参数:', {
      provider: provider.display_name,
      model,
      baseUrl,
      apiKey: apiKey ? `${apiKey.substring(0, 8)}...${apiKey.slice(-4)}` : '(none)',
      temperature: config.temperature,
      maxTokens: config.maxTokens
    });

    // Create LLM instance
    const llm = createLLM(config.providerId, apiKey, model, baseUrl, config);

    try {
      // Format messages for LlamaIndex
      const formattedMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      console.log('[LLM Chat] 发送请求到模型...');
      
      // Call LLM
      const response = await llm.chat({
        messages: formattedMessages
      });

      const duration = Date.now() - startTime;
      const content = response.message?.content || response.text || '';
      
      console.log('[LLM Chat] 模型响应:', {
        contentLength: content.length,
        contentPreview: content.length > 300 ? content.substring(0, 300) + '...' : content,
        usage: response.raw?.usage || '(无 usage 信息)'
      });
      console.log(`[LLM Chat] 调用耗时: ${duration}ms`);
      console.log('========== [LLM Chat] 调用结束 (成功) ==========\n');

      return {
        content: content,
        model: model,
        provider: config.providerId,
        usage: response.raw?.usage ? {
          promptTokens: response.raw.usage.prompt_tokens,
          completionTokens: response.raw.usage.completion_tokens,
          totalTokens: response.raw.usage.total_tokens
        } : undefined
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[LLM Chat] 调用失败:', {
        provider: provider.display_name,
        model,
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack?.split('\n').slice(0, 5).join('\n')
      });
      console.log(`[LLM Chat] 调用耗时: ${duration}ms`);
      console.log('========== [LLM Chat] 调用结束 (失败) ==========\n');
      throw new Error(`调用 ${provider.display_name} 失败: ${error.message}`);
    }
  }

  /**
   * Stream chat with LLM
   */
  static async *streamChat(
    userId: string,
    messages: ChatMessage[],
    config: LLMConfig
  ): AsyncGenerator<string> {
    // Get provider
    const provider = dbOps.getProvider(config.providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${config.providerId}`);
    }

    // Get API key
    let apiKey = config.apiKey;
    let baseUrl = config.baseUrl;
    
    if (!apiKey && provider.requires_api_key) {
      const savedKey = dbOps.getApiKey(userId, config.providerId);
      if (savedKey) {
        apiKey = savedKey.api_key;
        if (savedKey.base_url) {
          baseUrl = savedKey.base_url;
        }
      }
    }

    if (provider.requires_api_key && !apiKey) {
      throw new Error(`请先配置 ${provider.display_name} 的 API Key`);
    }

    const model = config.model || provider.supported_models[0];
    if (!baseUrl) {
      baseUrl = PROVIDER_BASE_URLS[config.providerId] || provider.base_url;
    }

    // Create LLM instance
    const llm = createLLM(config.providerId, apiKey, model, baseUrl, config);

    try {
      const formattedMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const stream = await llm.chat({
        messages: formattedMessages,
        stream: true
      });

      for await (const chunk of stream) {
        if (chunk.delta) {
          yield chunk.delta;
        }
      }
    } catch (error: any) {
      console.error(`LLM stream error (${provider.name}):`, error);
      throw new Error(`流式调用 ${provider.display_name} 失败: ${error.message}`);
    }
  }

  /**
   * Test API key connection
   */
  static async testConnection(
    providerId: string,
    apiKey: string,
    baseUrl?: string
  ): Promise<{ success: boolean; message: string; models?: string[] }> {
    console.log('[LLMService.testConnection] 开始测试连接');
    
    const provider = dbOps.getProvider(providerId);
    if (!provider) {
      console.log('[LLMService.testConnection] 厂商未找到:', providerId);
      return { success: false, message: `Provider not found: ${providerId}` };
    }

    const testBaseUrl = baseUrl || PROVIDER_BASE_URLS[providerId] || provider.base_url;
    const model = provider.supported_models[0];

    console.log('[LLMService.testConnection] 连接参数:', {
      providerId,
      providerName: provider.display_name,
      baseUrl: testBaseUrl,
      model,
      apiKey: apiKey || '(empty)'
    });

    try {
      console.log('[LLMService.testConnection] 创建 LLM 实例...');
      const llm = createLLM(providerId, apiKey, model, testBaseUrl, { 
        providerId, 
        maxTokens: 10 
      });

      console.log('[LLMService.testConnection] 发送测试消息...');
      // Simple test message
      const response = await llm.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      });

      console.log('[LLMService.testConnection] 测试成功, 响应:', {
        hasResponse: !!response,
        responseType: typeof response,
        message: response?.message?.content?.substring(0, 100) || '(no content)'
      });

      return {
        success: true,
        message: '连接测试成功',
        models: provider.supported_models
      };
    } catch (error: any) {
      console.error('[LLMService.testConnection] 测试失败:', {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack?.split('\n').slice(0, 3).join('\n')
      });
      return {
        success: false,
        message: `连接失败: ${error.message}`
      };
    }
  }
}

export default LLMService;
