/**
 * AI Agent 框架核心类型定义
 * 基于文档中的 6 大功能模块设计
 */

import { EventEmitter } from 'events';

// ========================================
// 基础类型
// ========================================

/** 唯一标识符 */
export type UUID = string;

/** 时间戳 */
export type Timestamp = number;

/** Agent 状态 */
export enum AgentStatus {
  IDLE = 'idle',
  PERCEIVING = 'perceiving',
  PLANNING = 'planning',
  EXECUTING = 'executing',
  COLLABORATING = 'collaborating',
  FEEDBACK = 'feedback',
  ERROR = 'error',
  PAUSED = 'paused',
  COMPLETED = 'completed'
}

/** 任务优先级 */
export enum TaskPriority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4
}

/** 任务状态 */
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRYING = 'retrying',
  CANCELLED = 'cancelled'
}

// ========================================
// 感知层类型
// ========================================

/** 输入类型 */
export enum InputType {
  TEXT = 'text',
  VOICE = 'voice',
  IMAGE = 'image',
  VIDEO = 'video',
  JSON = 'json',
  FILE = 'file',
  STRUCTURED = 'structured'
}

/** 环境信息类型 */
export enum EnvironmentType {
  SYSTEM = 'system',
  TOOL = 'tool',
  RESOURCE = 'resource',
  DATA_SOURCE = 'data_source',
  AGENT = 'agent'
}

/** 感知输入 */
export interface PerceptionInput {
  id: UUID;
  type: InputType;
  source: string;
  content: string | Buffer | object;
  metadata?: Record<string, any>;
  timestamp: Timestamp;
}

/** 解析后的意图 */
export interface ParsedIntent {
  action: string;
  confidence: number;
  entities?: Entity[];
  goal?: string;
  parameters: Record<string, any>;
  /** @deprecated 使用 action 替代 */
  intent?: string;
}

/** 实体 */
export interface Entity {
  type: string;
  value: string;
  start?: number;
  end?: number;
  confidence?: number;
}

/** 环境状态 */
export interface EnvironmentState {
  type: EnvironmentType;
  name: string;
  status: 'online' | 'offline' | 'degraded' | 'unknown';
  metrics?: Record<string, number>;
  lastCheck: Timestamp;
  metadata?: Record<string, any>;
}

// ========================================
// 记忆层类型
// ========================================

/** 记忆类型 */
export enum MemoryType {
  SHORT_TERM = 'short_term',
  LONG_TERM = 'long_term',
  EPISODIC = 'episodic',
  SEMANTIC = 'semantic',
  PROCEDURAL = 'procedural'
}

/** 记忆条目 */
export interface Memory {
  id: UUID;
  type: MemoryType;
  content: string;
  embedding?: number[];
  metadata?: Record<string, any>;
  importance: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  accessCount: number;
  lastAccessed: Timestamp;
  tags: string[];
}

/** 记忆查询条件 */
export interface MemoryQuery {
  type?: MemoryType;
  content?: string;
  tags?: string[];
  startTime?: Timestamp;
  endTime?: Timestamp;
  metadata?: Record<string, any>;
  topK?: number;
}

/** 会话记忆 */
export interface SessionMemory {
  sessionId: UUID;
  agentId: UUID;
  currentGoal?: string;
  taskStack: SubTask[];
  context: Record<string, any>;
  startTime: Timestamp;
  lastActive: Timestamp;
}

// ========================================
// 认知决策层类型
// ========================================

/** 子任务 */
export interface SubTask {
  id: UUID;
  name: string;
  description: string;
  dependencies: UUID[];
  status: TaskStatus;
  priority: TaskPriority;
  estimatedDuration?: number;
  tools?: string[];
  input?: any;
  output?: any;
  retryCount: number;
  maxRetries: number;
  metadata?: Record<string, any>;
  uncertainty?: TaskUncertainty;
}

/** 任务不确定性 */
export interface TaskUncertainty {
  confidence: number;
  ambiguityFactors: string[];
  alternativeInterpretations: string[];
}

/** 计划不确定性 */
export interface PlanUncertainty {
  overallConfidence: number;
  riskFactors: string[];
  contingencyPlans: string[];
}

/** 执行计划 */
export interface ExecutionPlan {
  id: UUID;
  goal: string;
  subtasks: SubTask[];
  parallelGroups: UUID[][];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  status: TaskStatus;
  metadata?: Record<string, any>;
  uncertainty?: PlanUncertainty;
}

/** 决策结果 */
export interface Decision {
  id: UUID;
  type: 'plan' | 'tool_selection' | 'alternative' | 'error_recovery' | 'semantic_choice' | 'uncertainty_resolution';
  reasoning: string;
  confidence: number;
  selectedOption: any;
  alternatives: any[];
  timestamp: Timestamp;
  ontologySupport?: {
    relevantConcepts: OntologyConcept[];
    semanticScore: number;
    inferredRelations: string[];
  };
}

/** 推理链 */
export interface ReasoningChain {
  id: UUID;
  goal: string;
  steps: ReasoningStep[];
  conclusion: string;
  finalConclusion?: string; // 兼容旧代码
  confidence: number;
  ontologyConcepts?: OntologyConcept[];
}

/** 推理步骤 */
export interface ReasoningStep {
  step: number;
  thought: string;
  action?: string;
  observation?: string;
  timestamp?: Timestamp;
  confidence?: number;
}

// ========================================
// 执行层类型
// ========================================

/** 工具定义 */
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  required?: string[];
  handler: (params: any, context: ExecutionContext) => Promise<ToolResult>;
}

/** 工具调用结果 */
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
  metadata?: Record<string, any>;
}

/** 执行上下文 */
export interface ExecutionContext {
  taskId: UUID;
  agentId: UUID;
  sessionId: UUID;
  planId: UUID;
  memory: {
    shortTerm: Map<string, any>;
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
  };
  logger: any;
  abortSignal?: AbortSignal;
}

/** 代码执行结果 */
export interface CodeExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  executionTime: number;
  memory?: any;
}

// ========================================
// 协作层类型
// ========================================

/** Agent 角色 */
export enum AgentRole {
  COORDINATOR = 'coordinator',
  WORKER = 'worker',
  SPECIALIST = 'specialist',
  OBSERVER = 'observer'
}

/** Agent 定义 */
export interface AgentDefinition {
  id: UUID;
  name: string;
  role: AgentRole;
  capabilities: string[];
  description: string;
  config: Record<string, any>;
}

/** 消息类型 */
export enum MessageType {
  TASK_ASSIGN = 'task_assign',
  TASK_RESULT = 'task_result',
  STATUS_UPDATE = 'status_update',
  ERROR_REPORT = 'error_report',
  COORDINATION = 'coordination',
  BROADCAST = 'broadcast'
}

/** Agent 间消息 */
export interface AgentMessage {
  id: UUID;
  type: MessageType;
  from: UUID;
  to: UUID | 'broadcast';
  content: any;
  timestamp: Timestamp;
  correlationId?: UUID;
}

/** 协作任务 */
export interface CollaborativeTask {
  id: UUID;
  goal: string;
  participants: UUID[];
  coordinator: UUID;
  subtasks: Map<UUID, UUID>; // subtaskId -> assignedAgentId
  status: TaskStatus;
  createdAt: Timestamp;
  completedAt?: Timestamp;
}

// ========================================
// 反馈优化层类型
// ========================================

/** 执行评估 */
export interface ExecutionEvaluation {
  taskId: UUID;
  planId: UUID;
  success: boolean;
  metrics: {
    completionRate: number;
    accuracy: number;
    efficiency: number;
    duration: number;
  };
  issues: string[];
  lessons: string[];
  timestamp: Timestamp;
}

/** 经验规则 */
export interface ExperienceRule {
  id: UUID;
  pattern: string;
  condition: Record<string, any>;
  action: string;
  successRate: number;
  applicationCount: number;
  createdAt: Timestamp;
  lastApplied: Timestamp;
  metadata?: Record<string, any>;
}

/** 模型微调数据 */
export interface FineTuningData {
  id: UUID;
  input: string;
  output: string;
  context: Record<string, any>;
  feedback: 'positive' | 'negative' | 'neutral';
  timestamp: Timestamp;
}

// ========================================
// 本体论类型
// ========================================

/** 本体论概念 */
export interface OntologyConcept {
  id: UUID;
  name: string;
  type: string;
  properties: Record<string, any>;
  relationships: OntologyRelationship[];
}

/** 本体论关系 */
export interface OntologyRelationship {
  type: string;
  target: UUID;
  properties?: Record<string, any>;
}

/** ETL 本体定义 */
export interface ETLOntology {
  dataSources: OntologyConcept[];
  transformations: OntologyConcept[];
  targets: OntologyConcept[];
  rules: OntologyConcept[];
  lineage: OntologyRelationship[];
}

// ========================================
// 认知层配置类型
// ========================================

/** 规划策略 */
export enum PlanningStrategy {
  SEQUENTIAL = 'sequential',
  PARALLEL = 'parallel',
  ADAPTIVE = 'adaptive',
  SEMANTIC = 'semantic',
}

/** 认知层配置 */
export interface CognitionConfig {
  maxSubtasks: number;
  defaultPriority: TaskPriority;
  maxRetries: number;
  planningStrategy: PlanningStrategy;
  enableDynamicPlanning: boolean;
  enableUncertaintyTracking?: boolean;
}

/** 环境变化事件 */
export interface EnvironmentChange {
  type: 'resource_available' | 'resource_unavailable' | 'state_change' | 'constraint_violation';
  source: string;
  timestamp: number;
  details: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// ========================================
// 配置类型
// ========================================

/** 框架配置 */
export interface AgentFrameworkConfig {
  agent: {
    id: string;
    name: string;
    role: AgentRole;
    capabilities: string[];
  };
  llm: {
    /** LLM 提供商 - 仅支持 OpenAI 协议 */
    provider: 'openai';
    /** 模型名称 */
    model: string;
    /** API 基础 URL，用于对接硅基流动等兼容 OpenAI 协议的服务商 */
    baseUrl?: string;
    /** API 密钥 */
    apiKey?: string;
    /** 温度参数，默认 0.7 */
    temperature?: number;
    /** 最大生成 token 数，默认 4096 */
    maxTokens?: number;
  };
  memory: {
    shortTerm: {
      type: 'redis' | 'memory';
      config: Record<string, any>;
    };
    longTerm: {
      type: 'postgres' | 'sqlite';
      config: Record<string, any>;
    };
    vector: {
      type: 'chroma' | 'milvus' | 'faiss';
      config: Record<string, any>;
    };
    knowledgeGraph?: {
      type: 'neo4j' | 'nebula';
      config: Record<string, any>;
    };
  };
  collaboration?: {
    enabled: boolean;
    messageBroker: 'kafka' | 'redis' | 'memory';
    config: Record<string, any>;
  };
  execution: {
    maxConcurrentTasks: number;
    defaultTimeout: number;
    retryPolicy: {
      maxRetries: number;
      backoffMultiplier: number;
      initialDelay?: number;
    };
  };
}

// ========================================
// 事件类型
// ========================================

export interface AgentEventMap {
  'status:change': { status: AgentStatus; previous: AgentStatus };
  'task:start': { task: SubTask };
  'task:complete': { task: SubTask; result: any };
  'task:error': { task: SubTask; error: Error };
  'plan:create': { plan: ExecutionPlan };
  'plan:update': { plan: ExecutionPlan };
  'memory:store': { memory: Memory };
  'memory:retrieve': { query: MemoryQuery; results: Memory[] };
  'message:receive': { message: AgentMessage };
  'message:send': { message: AgentMessage };
  'feedback:evaluation': { evaluation: ExecutionEvaluation };
  'error': { error: Error; context?: any };
}

export interface IEventEmitter extends EventEmitter {
  emit<K extends keyof AgentEventMap>(event: K, data: AgentEventMap[K]): boolean;
  on<K extends keyof AgentEventMap>(event: K, listener: (data: AgentEventMap[K]) => void): this;
}
