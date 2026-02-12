/**
 * Amphi ETL Agent - 类型定义
 * 从原 etl-agent.ts 提取
 */

// ========================================
// 组件相关类型
// ========================================

export interface Component {
  id: string;
  name: string;
  category: string;
  description: string;
  parameters: Parameter[];
}

export interface Parameter {
  id: string;
  name: string;
  paramType: string;
  defaultValue: string;
  required: boolean;
  description: string;
}

// ========================================
// ETL 配置类型
// ========================================

export interface ETLConfig {
  input?: Component;
  output?: Component;
  transformations: Component[];  // 中间转换组件
  params: Record<string, Record<string, any>>;
}

// ========================================
// 对话阶段类型
// ========================================

export type DialoguePhase = 
  | 'INITIAL'        // 初始状态，等待需求
  | 'PROPOSING'      // 已给出方案，等待用户确认/修改
  | 'COLLECTING'     // 收集缺失的关键参数
  | 'CONFIRMING'     // 最终确认
  | 'CHOOSING_SAVE_MODE'  // 用户已同意方案，等待选择保存方式（工作空间 / 直接输出）
  | 'COMPLETED';     // 已完成

// ========================================
// 用户意图类型
// ========================================

export type IntentType = 
  | 'NEW_REQUIREMENT' 
  | 'ACCEPT' 
  | 'REJECT' 
  | 'MODIFY' 
  | 'ADD_COMPONENT' 
  | 'REMOVE_COMPONENT' 
  | 'QUESTION' 
  | 'AMBIGUOUS';

export type ResponseStrategy = 
  | 'PROPOSE' 
  | 'ASK_CLARIFY' 
  | 'CONFIRM_EXECUTE' 
  | 'MODIFY_CONFIG' 
  | 'ANSWER' 
  | 'ADD_COMPONENT';

export interface UserIntent {
  type: IntentType;
  confidence: number;
  extractedInfo?: {
    sourceType?: string;
    targetType?: string;
    paramChanges?: Record<string, any>;
    modificationRequest?: string;
    componentToAdd?: {
      componentType: string;
      position?: 'after_input' | 'before_output' | 'between_input_output' | number;
      description?: string;
    };
    componentToRemove?: {
      componentType: string;
      index?: number;
    };
  };
  responseStrategy: ResponseStrategy;
  /** 用户要求不等待参数、直接生成工作流 */
  forceGenerate?: boolean;
}

// ========================================
// 用户偏好类型
// ========================================

export interface UserPreferences {
  commonHosts: Record<string, string>;
  commonPorts: Record<string, string>;
  recentFilePaths: string[];
  recentDatabases: string[];
  parameterFrequency: Record<string, number>;
}

// ========================================
// 对话历史类型
// ========================================

export interface DialogueMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// ========================================
// Pipeline 生成类型
// ========================================

export interface PipelineNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, any>;
  positionAbsolute?: { x: number; y: number };
  width?: number;
  height?: number;
}

export interface PipelineEdge {
  id: string;
  source: string;
  target: string;
}

export interface Pipeline {
  doc_type: 'Amphi Pipeline';
  version: string;
  json_schema: string;
  id: string;
  pipelines: Array<{
    id: string;
    flow: {
      nodes: PipelineNode[];
      edges: PipelineEdge[];
      viewport: { x: number; y: number; zoom: number };
    };
  }>;
}

// ========================================
// Agent 配置选项
// ========================================

export interface AgentOptions {
  userId?: string;
  sessionId?: string;
  enableTools?: boolean;
  enableCognition?: boolean;
  enableStreaming?: boolean;
  maxConcurrentTasks?: number;
  defaultTimeout?: number;
  retryPolicy?: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay: number;
  };
}

// ========================================
// 处理结果类型
// ========================================

export interface ProcessResult {
  response: string;
  isComplete: boolean;
  pipelineFile?: string;
  phase: DialoguePhase;
  config: ETLConfig;
  toolCalls?: Array<{ tool: string; params: any; result: any }>;
}

export interface PipelineResult {
  filepath: string;
  input?: string;
  output?: string;
}

// ========================================
// 工具相关类型
// ========================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

// ========================================
// 会话状态类型（用于持久化）
// ========================================

export interface SessionState {
  sessionId: string;
  userId: string;
  phase: DialoguePhase;
  config: ETLConfig;
  history: DialogueMessage[];
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

// ========================================
// API 相关类型
// ========================================

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  sessionId?: string;
  message: string;
  userId?: string;
  stream?: boolean;
}

export interface ChatResponse {
  sessionId: string;
  response: string;
  isComplete: boolean;
  phase: DialoguePhase;
  pipelineFile?: string;
  timestamp: number;
}

export interface StreamChunk {
  type: 'thinking' | 'content' | 'tool_call' | 'complete' | 'error';
  data: any;
}
