// AI Assistant Types

// Model item from config (id, name, description)
export interface ModelItem {
  id: string;
  name: string;
  description?: string;
}

// Supported model providers (from config)
export interface ModelProvider {
  id: string;
  name: string;
  displayName: string;
  description: string;
  baseUrl: string;
  supportedModels: string[];
  requiresApiKey: boolean;
  /** 模型列表，来自 config/providers.json */
  models?: ModelItem[];
}

export interface ModelConfig {
  providerId: string;
  model?: string;
  baseUrl: string;
  apiKey?: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  customPrompt: string;  // 用户自定义提示词
}

export interface UserApiKeyConfig {
  providerId: string;
  providerName: string;
  hasApiKey: boolean;
  baseUrl?: string;
  maskedKey?: string;
  requiresApiKey: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: number;
  attachments?: Attachment[];
}

export interface Attachment {
  name: string;
  type: 'txt' | 'md' | 'json';
  content: string;
}

export interface AmplnSchema {
  name: string;
  version: string;
  nodes: AmplnNode[];
  edges: AmplnEdge[];
  variables?: Record<string, any>;
}

export interface AmplnNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, any>;
}

export interface AmplnEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface GeneratePipelineRequest {
  systemPrompt: string;
  userPrompt: string;
  userId?: string;
  model: Omit<ModelConfig, 'systemPrompt'>;
}

export interface GeneratePipelineResponse {
  success: boolean;
  pipeline?: AmplnSchema;
  error?: {
    message: string;
    nodeId?: string;
    path?: string;
  };
}

export interface OptimizePromptRequest {
  prompt: string;
}

export interface OptimizePromptResponse {
  optimizedPrompt: string;
  method: 'service' | 'local';
  meta?: Record<string, any>;
}

export interface RenderPipelineRequest {
  pipeline: AmplnSchema;
  filePath: string;
}

export interface RenderPipelineResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// Generation progress steps
export type GenerationStep = 
  | 'parsing'      // 解析需求
  | 'matching'     // 匹配模板
  | 'filling'      // 填充参数
  | 'generating'   // 生成 DAG
  | 'validating'   // 校验环路
  | 'outputting';  // 输出 JSON

export interface GenerationProgress {
  step: GenerationStep;
  progress: number; // 0-100
  message?: string;
}

// Default prompt template - 空字符串，因为后端已内置系统提示词
// 用户自定义提示词为可选项，作为内置提示词的补充
export const DEFAULT_PROMPT_TEMPLATE = '';
