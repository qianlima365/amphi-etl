/**
 * 核心 Agent 类
 * 整合六大功能模块，实现完整的「感知-记忆-决策-执行-协作-反馈」闭环
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger';
import { AgentError } from '../utils/errors';

import PerceptionLayer, { IIntentRecognizer } from './perception';
import MemoryLayer, { MemoryType } from './memory';
import CognitionLayer, { ILLMService } from './cognition';
import ExecutionLayer, { TaskExecutionResult } from './execution';
import type { Tool } from '../types';
import CollaborationLayer from './collaboration';
import FeedbackLayer from './feedback';
import OntologyLayer from './ontologies';

import {
  AgentStatus,
  AgentRole,
  AgentFrameworkConfig,
  PerceptionInput,
  ParsedIntent,
  ExecutionPlan,
  ExecutionContext,
  ExecutionEvaluation,
  UUID,
  TaskStatus,
} from '../types';

const logger = createLogger('Agent');

/**
 * Agent 配置
 */
export interface AgentConfig {
  id?: UUID;
  name: string;
  role: AgentRole;
  capabilities: string[];
  description?: string;
}

/**
 * 执行结果
 */
export interface AgentExecutionResult {
  success: boolean;
  plan: ExecutionPlan;
  taskResults: Map<UUID, TaskExecutionResult>;
  evaluation?: ExecutionEvaluation;
  output?: any;
  duration: number;
}

/**
 * 核心 Agent 类
 */
export class Agent extends EventEmitter {
  // 基础属性
  public readonly id: UUID;
  public readonly name: string;
  public readonly role: AgentRole;
  public readonly capabilities: string[];
  public readonly description: string;

  // 状态
  private _status: AgentStatus;
  private currentSession: UUID | null;

  // 六大功能层
  private perception: PerceptionLayer;
  private memory: MemoryLayer;
  private cognition: CognitionLayer;
  private execution: ExecutionLayer;
  private collaboration: CollaborationLayer;
  private feedback: FeedbackLayer;
  private ontology: OntologyLayer;

  // LLM 服务
  private llm: ILLMService;

  constructor(
    config: AgentConfig,
    frameworkConfig: AgentFrameworkConfig,
    llm: ILLMService,
    intentRecognizer?: IIntentRecognizer
  ) {
    super();

    // 初始化基础属性
    this.id = config.id || uuidv4();
    this.name = config.name;
    this.role = config.role;
    this.capabilities = config.capabilities;
    this.description = config.description || '';

    this._status = AgentStatus.IDLE;
    this.currentSession = null;
    this.llm = llm;

    // 初始化六大功能层
    this.perception = new PerceptionLayer(
      { enableEnvironmentMonitoring: true },
      intentRecognizer
    );

    this.memory = new MemoryLayer(
      {
        shortTerm: { type: 'memory', maxSize: 1000 },
        vector: { enabled: false },
      },
      this.generateEmbedding.bind(this)
    );

    this.cognition = new CognitionLayer(llm, {
      maxSubtasks: frameworkConfig.execution.maxConcurrentTasks * 2,
      enableDynamicPlanning: true,
    });

    this.execution = new ExecutionLayer({
      maxConcurrentTasks: frameworkConfig.execution.maxConcurrentTasks,
      defaultTimeout: frameworkConfig.execution.defaultTimeout,
      retryPolicy: frameworkConfig.execution.retryPolicy,
      enableSandbox: true,
    });

    this.collaboration = new CollaborationLayer(this.id);

    this.feedback = new FeedbackLayer({
      enableAutoEvaluation: true,
      enableExperienceExtraction: true,
    });

    this.ontology = new OntologyLayer();

    // 设置事件转发
    this.setupEventForwarding();

    logger.info('Agent 初始化完成', {
      agentId: this.id,
      name: this.name,
      role: this.role,
    });
  }

  /**
   * 获取当前状态
   */
  get status(): AgentStatus {
    return this._status;
  }

  private setStatus(newStatus: AgentStatus): void {
    const previous = this._status;
    this._status = newStatus;
    this.emit('status:change', { status: newStatus, previous });
  }

  /**
   * 初始化 Agent
   */
  async initialize(): Promise<void> {
    this.setStatus(AgentStatus.IDLE);
    
    // 初始化协作层
    await this.collaboration.initialize();

    // 注册自己到协作层
    this.collaboration.registerAgent({
      id: this.id,
      name: this.name,
      role: this.role,
      capabilities: this.capabilities,
      description: this.description,
      config: {},
    });

    logger.info('Agent 已就绪', { agentId: this.id });
  }

  /**
   * 关闭 Agent
   */
  async shutdown(): Promise<void> {
    this.setStatus(AgentStatus.IDLE);
    await this.collaboration.shutdown();
    logger.info('Agent 已关闭', { agentId: this.id });
  }

  /**
   * 注册工具
   */
  registerTool(tool: Tool): void {
    this.execution.registerTool(tool);
    logger.debug('工具已注册', { agentId: this.id, toolName: tool.name });
  }

  /**
   * 批量注册工具
   */
  registerTools(tools: Tool[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  /**
   * 处理用户输入（主入口）
   */
  async process(input: string, context?: Record<string, any>): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    this.setStatus(AgentStatus.PERCEIVING);

    try {
      // 1. 感知层：接收输入
      const perceptionInput = await this.perception.perceive(input, undefined, 'user', context);
      
      // 2. 感知层：解析意图
      const intent = await this.perception.parseIntent(perceptionInput);
      
      // 存储到记忆
      await this.memory.store(input, MemoryType.SHORT_TERM, {
        tags: ['user_input'],
        metadata: { intent, perceptionInput },
      });

      // 3. 本体论语义支持
      const semanticSupport = this.ontology.semanticDecisionSupport(intent.goal || input, context || {});
      logger.info('语义决策支持', { 
        relevantConcepts: semanticSupport.relevantConcepts.length,
        confidence: semanticSupport.confidence,
      });

      // 4. 认知层：创建计划
      this.setStatus(AgentStatus.PLANNING);
      const plan = await this.cognition.plan(intent, {
        ...context,
        semanticSuggestions: semanticSupport.suggestedActions,
      });

      // 存储计划
      await this.memory.store(JSON.stringify(plan), MemoryType.SHORT_TERM, {
        tags: ['plan'],
        metadata: { planId: plan.id },
      });

      this.emit('plan:create', { plan });

      // 5. 执行层：执行计划
      this.setStatus(AgentStatus.EXECUTING);
      const executionResults = await this.executePlan(plan);

      // 6. 反馈层：评估结果
      this.setStatus(AgentStatus.FEEDBACK);
      const { evaluation } = await this.feedback.processFeedback(
        plan, 
        executionResults,
        { goal: intent.goal, input: JSON.stringify(intent), output: JSON.stringify(executionResults) }
      );

      // 7. 存储执行结果到记忆
      await this.memory.store(
        JSON.stringify({
          planId: plan.id,
          success: evaluation.success,
          metrics: evaluation.metrics,
        }),
        evaluation.success ? MemoryType.LONG_TERM : MemoryType.SHORT_TERM,
        {
          importance: evaluation.success ? 0.8 : 0.5,
          tags: ['execution_result', evaluation.success ? 'success' : 'failed'],
        }
      );

      const duration = Date.now() - startTime;
      this.setStatus(AgentStatus.COMPLETED);

      const result: AgentExecutionResult = {
        success: evaluation.success,
        plan,
        taskResults: executionResults,
        evaluation,
        duration,
      };

      this.emit('execution:complete', result);
      logger.info('任务执行完成', { 
        agentId: this.id, 
        success: result.success,
        duration,
      });

      return result;
    } catch (error) {
      this.setStatus(AgentStatus.ERROR);
      logger.error('任务执行失败', { agentId: this.id, error });
      throw error;
    }
  }

  /**
   * 处理 ETL 专用请求
   */
  async processETL(
    source: string,
    target: string,
    transformations: string[],
    context?: Record<string, any>
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    this.setStatus(AgentStatus.PLANNING);

    try {
      // 使用语义规划（通用规划方法）
      const intent = {
        action: 'create_etl_pipeline',
        confidence: 0.9,
        parameters: { source, target, transformations },
      };
      const plan = await this.cognition.plan(intent, context);
      
      // 创建会话
      const session = this.memory.createSession(this.id);
      const sessionId = session.sessionId;
      this.currentSession = sessionId;

      this.emit('plan:create', { plan });

      // 执行计划
      this.setStatus(AgentStatus.EXECUTING);
      const executionResults = await this.executePlan(plan, sessionId);

      // 评估结果
      this.setStatus(AgentStatus.FEEDBACK);
      const { evaluation } = await this.feedback.processFeedback(
        plan,
        executionResults,
        { goal: `${source} -> ${target}`, input: JSON.stringify({ source, target }), output: JSON.stringify(executionResults) }
      );

      this.memory.clearSession(sessionId);
      this.currentSession = null;

      const duration = Date.now() - startTime;
      this.setStatus(AgentStatus.COMPLETED);

      return {
        success: evaluation.success,
        plan,
        taskResults: executionResults,
        evaluation,
        duration,
      };
    } catch (error) {
      this.setStatus(AgentStatus.ERROR);
      throw error;
    }
  }

  /**
   * 执行计划
   */
  private async executePlan(
    plan: ExecutionPlan,
    sessionId?: UUID
  ): Promise<Map<UUID, TaskExecutionResult>> {
    const sid = sessionId || this.currentSession || uuidv4();

    const executionContext: ExecutionContext = {
      taskId: plan.id,
      agentId: this.id,
      sessionId: sid,
      planId: plan.id,
      memory: {
        shortTerm: new Map(),
        get: async (key: string) => this.memory.getSession(sid)?.context[key],
        set: async (key: string, value: any) => {
          const session = this.memory.getSession(sid);
          if (session) {
            session.context[key] = value;
          }
        },
      },
      logger,
    };

    // 转发执行层事件
    this.execution.on('task:start', (data) => this.emit('task:start', data));
    this.execution.on('task:complete', (data) => this.emit('task:complete', data));
    this.execution.on('task:error', (data) => this.emit('task:error', data));

    return this.execution.executePlan(plan, executionContext);
  }

  /**
   * 动态调整计划（当任务失败时）
   */
  async replan(plan: ExecutionPlan, failedTaskId: UUID, error: Error): Promise<ExecutionPlan> {
    this.setStatus(AgentStatus.PLANNING);
    
    const adjustedPlan = await this.cognition.replan(plan, failedTaskId, error);
    
    this.emit('plan:update', { plan: adjustedPlan });
    logger.info('计划已调整', { planId: plan.id, failedTaskId });

    return adjustedPlan;
  }

  /**
   * 与其他 Agent 协作
   */
  async collaborate(
    goal: string,
    participantIds: UUID[]
  ): Promise<UUID> {
    this.setStatus(AgentStatus.COLLABORATING);

    const task = await this.collaboration.createTask(goal, participantIds);
    
    logger.info('创建协作任务', { 
      taskId: task.id, 
      participants: participantIds.length + 1,
    });

    return task.id;
  }

  /**
   * 获取记忆
   */
  async recall(query: string, limit: number = 5): Promise<string[]> {
    const memories = await this.memory.retrieve({ content: query, topK: limit });
    return memories.map((m) => m.content);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    status: AgentStatus;
    memoryCount: number;
    toolCount: number;
    feedback: any;
  } {
    return {
      status: this.status,
      memoryCount: 0, // 简化实现
      toolCount: this.execution.listTools().length,
      feedback: this.feedback.getStats(),
    };
  }

  /**
   * 生成向量嵌入（简化实现）
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // 简化实现 - 实际应该调用嵌入模型
    // 返回一个随机的 128 维向量作为示例
    const dimension = 128;
    const embedding: number[] = [];
    
    // 使用文本的哈希值生成伪随机但确定的向量
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    for (let i = 0; i < dimension; i++) {
      const value = Math.sin(hash + i) * 0.5 + 0.5;
      embedding.push(value);
    }

    return embedding;
  }

  /**
   * 设置事件转发
   */
  private setupEventForwarding(): void {
    // 执行层事件
    this.execution.on('task:start', (data) => {
      this.emit('task:start', data);
    });

    this.execution.on('task:complete', (data) => {
      this.emit('task:complete', data);
    });

    this.execution.on('task:error', (data) => {
      this.emit('task:error', data);
    });

    // 协作层事件
    this.collaboration.on('task:assigned', (data) => {
      this.emit('task:assigned', data);
    });

    this.collaboration.on('message:send', (data) => {
      this.emit('message:send', data);
    });
  }

  // ========================================
  // 各层访问器
  // ========================================

  getPerceptionLayer(): PerceptionLayer {
    return this.perception;
  }

  getMemoryLayer(): MemoryLayer {
    return this.memory;
  }

  getCognitionLayer(): CognitionLayer {
    return this.cognition;
  }

  getExecutionLayer(): ExecutionLayer {
    return this.execution;
  }

  getCollaborationLayer(): CollaborationLayer {
    return this.collaboration;
  }

  getFeedbackLayer(): FeedbackLayer {
    return this.feedback;
  }

  getOntologyLayer(): OntologyLayer {
    return this.ontology;
  }
}

export default Agent;
