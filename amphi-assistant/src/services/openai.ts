/**
 * OpenAI 协议 LLM 服务实现
 * 用于对接硅基流动(SiliconFlow)等兼容 OpenAI API 的厂商
 */

import OpenAI from 'openai';
import { ILLMService } from '../core/cognition';
import { createLogger } from '../utils/logger';

const logger = createLogger('OpenAILLMService');

/**
 * OpenAI LLM 服务配置
 */
export interface OpenAILLMConfig {
  /** API 密钥 */
  apiKey: string;
  /** 模型名称，如 deepseek-ai/DeepSeek-V2.5, Qwen/Qwen2.5-72B-Instruct 等 */
  model: string;
  /** API 基础 URL，硅基流动默认为 https://api.siliconflow.cn/v1 */
  baseURL?: string;
  /** 温度参数，默认 0.7 */
  temperature?: number;
  /** 最大生成 token 数，默认 4096 */
  maxTokens?: number;
  /** 请求超时时间(毫秒)，默认 60000 */
  timeout?: number;
}

/**
 * OpenAI 协议 LLM 服务
 * 支持硅基流动(SiliconFlow)等兼容 OpenAI API 的服务商
 */
export class OpenAILLMService implements ILLMService {
  private client: OpenAI;
  private config: Required<OpenAILLMConfig>;

  constructor(config: OpenAILLMConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model,
      baseURL: config.baseURL || 'https://api.siliconflow.cn/v1',
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 4096,
      timeout: config.timeout ?? 60000,
    };

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
    });

    logger.info('OpenAI LLM 服务已初始化', {
      model: this.config.model,
      baseURL: this.config.baseURL,
    });
  }

  /**
   * 单轮文本补全
   * @param prompt 提示词
   * @param options 额外选项
   * @returns 生成的文本
   */
  async complete(prompt: string, options?: Partial<OpenAILLMConfig>): Promise<string> {
    try {
      const model = options?.model || this.config.model;
      const temperature = options?.temperature ?? this.config.temperature;
      const maxTokens = options?.maxTokens ?? this.config.maxTokens;

      logger.debug('发送 completion 请求', {
        model,
        promptLength: prompt.length,
      });

      const response = await this.client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
      });

      const content = response.choices[0]?.message?.content || '';
      
      logger.debug('收到 completion 响应', {
        model,
        contentLength: content.length,
        usage: response.usage,
      });

      return content;
    } catch (error) {
      logger.error('Completion 请求失败', { error, prompt: prompt.slice(0, 100) });
      throw new Error(`LLM completion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 多轮对话
   * @param messages 消息列表，包含 role 和 content
   * @param options 额外选项
   * @returns 生成的回复
   */
  async chat(
    messages: Array<{ role: string; content: string }>,
    options?: Partial<OpenAILLMConfig>
  ): Promise<string> {
    try {
      const model = options?.model || this.config.model;
      const temperature = options?.temperature ?? this.config.temperature;
      const maxTokens = options?.maxTokens ?? this.config.maxTokens;

      logger.debug('发送 chat 请求', {
        model,
        messageCount: messages.length,
      });

      const response = await this.client.chat.completions.create({
        model,
        messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature,
        max_tokens: maxTokens,
      });

      const content = response.choices[0]?.message?.content || '';

      logger.debug('收到 chat 响应', {
        model,
        contentLength: content.length,
        usage: response.usage,
      });

      return content;
    } catch (error) {
      logger.error('Chat 请求失败', { error, messageCount: messages.length });
      throw new Error(`LLM chat failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 流式文本补全（可选功能）
   * @param prompt 提示词
   * @param onChunk 接收到每个数据块时的回调
   * @param options 额外选项
   */
  async completeStream(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: Partial<OpenAILLMConfig>
  ): Promise<void> {
    try {
      const model = options?.model || this.config.model;
      const temperature = options?.temperature ?? this.config.temperature;
      const maxTokens = options?.maxTokens ?? this.config.maxTokens;

      const stream = await this.client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          onChunk(content);
        }
      }
    } catch (error) {
      logger.error('Stream completion 请求失败', { error });
      throw new Error(`LLM stream completion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 流式对话（可选功能）
   * @param messages 消息列表
   * @param onChunk 接收到每个数据块时的回调
   * @param options 额外选项
   */
  async chatStream(
    messages: Array<{ role: string; content: string }>,
    onChunk: (chunk: string) => void,
    options?: Partial<OpenAILLMConfig>
  ): Promise<void> {
    try {
      const model = options?.model || this.config.model;
      const temperature = options?.temperature ?? this.config.temperature;
      const maxTokens = options?.maxTokens ?? this.config.maxTokens;

      const stream = await this.client.chat.completions.create({
        model,
        messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature,
        max_tokens: maxTokens,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          onChunk(content);
        }
      }
    } catch (error) {
      logger.error('Stream chat 请求失败', { error });
      throw new Error(`LLM stream chat failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): OpenAILLMConfig {
    return { ...this.config };
  }

  /**
   * 获取当前使用的模型名称
   */
  getModel(): string {
    return this.config.model;
  }
}

/**
 * 从环境变量创建 OpenAI LLM 服务
 * 自动读取以下环境变量：
 * - SILICONFLOW_API_KEY: API 密钥（必填）
 * - SILICONFLOW_MODEL: 模型名称（必填）
 * - SILICONFLOW_BASE_URL: API 基础 URL（可选，默认 https://api.siliconflow.cn/v1）
 * - SILICONFLOW_TEMPERATURE: 温度参数（可选，默认 0.7）
 * - SILICONFLOW_MAX_TOKENS: 最大生成 token 数（可选，默认 4096）
 */
export function createOpenAILLMServiceFromEnv(): OpenAILLMService {
  const apiKey = process.env.SILICONFLOW_API_KEY;
  const model = process.env.SILICONFLOW_MODEL;

  if (!apiKey) {
    throw new Error('环境变量 SILICONFLOW_API_KEY 未设置');
  }

  if (!model) {
    throw new Error('环境变量 SILICONFLOW_MODEL 未设置');
  }

  return new OpenAILLMService({
    apiKey,
    model,
    baseURL: process.env.SILICONFLOW_BASE_URL,
    temperature: process.env.SILICONFLOW_TEMPERATURE 
      ? parseFloat(process.env.SILICONFLOW_TEMPERATURE) 
      : undefined,
    maxTokens: process.env.SILICONFLOW_MAX_TOKENS 
      ? parseInt(process.env.SILICONFLOW_MAX_TOKENS, 10) 
      : undefined,
  });
}

export default OpenAILLMService;
