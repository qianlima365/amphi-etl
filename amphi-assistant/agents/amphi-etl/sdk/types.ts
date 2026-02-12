/**
 * SDK 类型定义
 */

import { ChatResponse } from '../src/types';

export interface SDKOptions {
  apiBaseUrl: string;
  userId?: string;
  apiKey?: string;
}

export interface SessionOptions {
  sessionId?: string;
  userId?: string;
}

/**
 * SDK 响应包装
 */
export interface SDKResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 流式响应回调
 */
export interface StreamCallbacks {
  onMessage?: (response: ChatResponse) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}
