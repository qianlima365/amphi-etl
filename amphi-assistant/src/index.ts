/**
 * Node.js AI Agent 开发框架
 * 基于「核心功能+技术选型全解析.md」文档实现
 * 
 * 核心特性:
 * - 六大功能模块完整实现 (感知/记忆/认知/执行/协作/反馈)
 * - 本体论 + LLM 结合
 * - ETL 场景专项支持
 * - 本地化/内网部署支持
 */

// 核心 Agent 类
export { Agent, AgentConfig, AgentExecutionResult } from './core/Agent';

// 六大功能层
export { 
  PerceptionLayer, 
  IIntentRecognizer,
  IEnvironmentMonitor,
  LLMIntentRecognizer,
  RuleBasedIntentRecognizer,
  EnvironmentMonitor,
  MultimodalProcessor,
  DataNormalizer,
  MultimodalInput,
  CleanedData,
  IDataSourceHealthChecker,
} from './core/perception';
export { 
  MemoryLayer, 
  IMemoryStore, 
  MemoryType,
  WorkingMemoryManager,
  ExperienceMemoryManager,
  KnowledgeMemoryManager,
  ShortTermMemoryStore,
  RedisMemoryStore,
  ChromaVectorStore,
  WorkingMemory,
  ExperienceMemory,
  KnowledgeMemory,
  RetrievalResult,
} from './core/memory';
export type { MemoryQuery } from './types';
export {
  CognitionLayer,
  ILLMService,
  ReActReasoner,
  type ExecutionPlan,
  type SubTask,
  type DependencyBuilder,
  type EnvironmentChange,
  PlanningStrategy,
} from './core/cognition';
export { ExecutionLayer, ToolRegistry, CodeExecutor } from './core/execution';
export type { TaskExecutionResult } from './core/execution';
export type { Tool, ToolResult, ExecutionContext } from './types';
export { 
  CollaborationLayer, 
  CollaborationManager, 
  AgentRegistry,
  InMemoryBroker,
  KafkaBroker,
  AgentRoles,
} from './core/collaboration';
export { 
  FeedbackLayer,
  ResultEvaluator,
  ErrorAnalyzer,
  ErrorCategory,
  ExperienceExtractor,
  ModelFineTuningManager,
  PostMortemReport,
  ErrorRootCause,
  ComprehensiveEvaluation,
  MultiDimensionMetrics,
  HumanFeedback,
  EvaluationDimension,
} from './core/feedback';
export { 
  OntologyLayer, 
  OntologyManager, 
  ETLOntologyHelper,
  ETLDomainOntology,
} from './core/ontologies';

// 类型定义
export * from './types';

// LLM 服务
export { OpenAILLMService, createOpenAILLMServiceFromEnv } from './services/openai';
export type { OpenAILLMConfig } from './services/openai';

// 知识图谱服务
export { Neo4jKnowledgeGraph, createNeo4jFromEnv } from './services/neo4j';
export type { Neo4jConfig } from './services/neo4j';

// 对话数据持久化
export {
  PostgresDialogueRepository,
  createPostgresRepositoryFromEnv,
} from './repositories/dialogue';
export type {
  IDialogueRepository,
  DialogueSession,
  DialogueContext,
  DialogueMessage,
  UserPreference,
  DialogueLog,
  PostgresConfig,
} from './repositories/dialogue';

// 工具类
export { createLogger } from './utils/logger';
export { 
  AgentError, 
  PerceptionError, 
  MemoryError, 
  CognitionError, 
  ExecutionError,
  CollaborationError,
  ToolError,
} from './utils/errors';

// 版本信息
export const VERSION = '1.0.0';

/**
 * 框架信息
 */
export const FrameworkInfo = {
  name: 'Node.js AI Agent Framework',
  version: VERSION,
  description: '企业级 AI Agent 开发框架 - 支持本体论+LLM结合的自主智能闭环',
  modules: [
    'Perception Layer - 感知层',
    'Memory Layer - 记忆层',
    'Cognition Layer - 认知决策层',
    'Execution Layer - 执行层',
    'Collaboration Layer - 协作层',
    'Feedback Layer - 反馈优化层',
    'Ontology Layer - 本体论语义层',
  ],
};

// 默认导出
export { Agent as default } from './core/Agent';
