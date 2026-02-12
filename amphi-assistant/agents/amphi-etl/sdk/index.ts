/**
 * Amphi ETL Agent - SDK
 * 
 * 为第三方应用提供 JavaScript/TypeScript SDK
 * 
 * 使用示例:
 * ```typescript
 * import { AmphiETLClient } from './amphi-etl/sdk';
 * 
 * const client = new AmphiETLClient({
 *   apiBaseUrl: 'http://localhost:3456',
 *   userId: 'my-user'
 * });
 * 
 * const session = await client.createSession();
 * const response = await session.chat('把CSV导入MySQL');
 * ```
 */

import { ChatResponse, ETLConfig, DialoguePhase } from '../src/types';
import { SDKOptions, SessionOptions } from './types';

/**
 * ETL 会话类
 */
export class ETLSession {
  private client: AmphiETLClient;
  readonly sessionId: string;
  readonly userId: string;
  private currentPhase: DialoguePhase = 'INITIAL';
  private pipelineFile?: string;

  constructor(client: AmphiETLClient, sessionId: string, userId: string) {
    this.client = client;
    this.sessionId = sessionId;
    this.userId = userId;
  }

  /**
   * 发送消息
   */
  async chat(message: string): Promise<ChatResponse> {
    const response = await this.client.request<ChatResponse>('/api/v1/chat', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: this.sessionId,
        message,
        userId: this.userId,
      }),
    });

    this.currentPhase = response.phase;
    if (response.pipelineFile) {
      this.pipelineFile = response.pipelineFile;
    }

    return response;
  }

  /**
   * 获取当前状态
   */
  async getStatus(): Promise<{
    sessionId: string;
    userId: string;
    phase: DialoguePhase;
    config: { input?: string; output?: string; transformations: string[] };
    history: any[];
  }> {
    return this.client.request(`/api/v1/sessions/${this.sessionId}`);
  }

  /**
   * 获取 Pipeline 文件路径
   */
  getPipelineFile(): string | undefined {
    return this.pipelineFile;
  }

  /**
   * 获取当前阶段
   */
  getPhase(): DialoguePhase {
    return this.currentPhase;
  }

  /**
   * 是否已完成
   */
  isComplete(): boolean {
    return this.currentPhase === 'COMPLETED';
  }
}

/**
 * Amphi ETL 客户端
 */
export class AmphiETLClient {
  private options: SDKOptions;

  constructor(options: SDKOptions) {
    this.options = {
      userId: 'anonymous',
      ...options,
    };
  }

  /**
   * 发送 HTTP 请求
   */
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.options.apiBaseUrl}${path}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };

    if (this.options.apiKey) {
      headers['Authorization'] = `Bearer ${this.options.apiKey}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data.data as T;
  }

  /**
   * 创建新会话
   */
  async createSession(options: SessionOptions = {}): Promise<ETLSession> {
    const result = await this.request<{ sessionId: string; userId: string }>('/api/v1/sessions', {
      method: 'POST',
      body: JSON.stringify({
        userId: options.userId || this.options.userId,
      }),
    });

    return new ETLSession(this, result.sessionId, result.userId);
  }

  /**
   * 获取已有会话
   */
  getSession(sessionId: string, userId?: string): ETLSession {
    return new ETLSession(this, sessionId, userId || this.options.userId!);
  }

  /**
   * 健康检查
   */
  async health(): Promise<{ status: string; timestamp: string }> {
    return this.request('/health');
  }
}

/**
 * WebSocket 客户端（实时通信）
 */
export class AmphiETLWebSocketClient {
  private ws: WebSocket | null = null;
  private messageCallbacks: Array<(data: any) => void> = [];
  private errorCallbacks: Array<(error: Error) => void> = [];

  constructor(private url: string) {}

  /**
   * 连接 WebSocket
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        resolve();
      };

      this.ws.onerror = (error) => {
        reject(error);
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.messageCallbacks.forEach(cb => cb(data));
      };

      this.ws.onclose = () => {
        this.ws = null;
      };
    });
  }

  /**
   * 初始化会话
   */
  init(userId?: string, sessionId?: string): void {
    this.send({ type: 'init', userId, sessionId });
  }

  /**
   * 发送聊天消息
   */
  chat(content: string): void {
    this.send({ type: 'chat', content });
  }

  /**
   * 发送消息
   */
  send(data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      throw new Error('WebSocket not connected');
    }
  }

  /**
   * 监听消息
   */
  onMessage(callback: (data: any) => void): void {
    this.messageCallbacks.push(callback);
  }

  /**
   * 监听错误
   */
  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  /**
   * 关闭连接
   */
  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}

// 默认导出
export { SDKOptions, SessionOptions } from './types';

export default {
  AmphiETLClient,
  AmphiETLWebSocketClient,
  ETLSession,
};
