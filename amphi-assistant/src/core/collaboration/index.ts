/**
 * 协作层 (Collaboration Layer)
 * Agent 的"社交能力" - 多 Agent 协同完成复杂任务
 * 
 * 核心功能:
 * - 角色分工: 根据能力定位分配任务角色
 * - 通信交互: 多 Agent 之间的标准化信息传递
 * - 协调与协商: 资源冲突、任务重叠时的协商
 * 
 * 企业级特性:
 * - 任务分解与智能分配
 * - 资源冲突检测与协商解决
 * - 优先级调度
 * - 容错与重分配
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../utils/logger';
import { CollaborationError } from '../../utils/errors';
import {
  AgentDefinition,
  AgentRole,
  AgentMessage,
  MessageType,
  CollaborativeTask,
  TaskStatus,
  SubTask,
  UUID,
} from '../../types';

const logger = createLogger('CollaborationLayer');

// ========================================
// 类型定义扩展
// ========================================

/** 资源类型 */
export enum ResourceType {
  DATABASE = 'database',
  FILE_SYSTEM = 'file_system',
  API_ENDPOINT = 'api_endpoint',
  COMPUTE = 'compute',
  NETWORK = 'network',
}

/** 资源定义 */
export interface Resource {
  id: string;
  type: ResourceType;
  name: string;
  owner?: UUID;
  priority: number;
  acquiredAt?: number;
  expiresAt?: number;
  metadata?: Record<string, any>;
}



/** 资源请求 */
export interface ResourceRequest {
  id: UUID;
  agentId: UUID;
  resourceType: ResourceType;
  resourceId?: string;
  priority: number;
  duration: number;
  timestamp: number;
  status: 'pending' | 'granted' | 'rejected' | 'released';
  acquiredAt?: number;
  expiresAt?: number;
}

/** 任务分配策略 */
export enum AssignmentStrategy {
  CAPABILITY_MATCH = 'capability_match',     // 按能力匹配
  LOAD_BALANCE = 'load_balance',             // 负载均衡
  PRIORITY = 'priority',                     // 优先级
  COST_OPTIMIZATION = 'cost_optimization',   // 成本优化
}

/** 协商提案 */
export interface NegotiationProposal {
  id: UUID;
  proposerId: UUID;
  targetId: UUID;
  resourceId: string;
  offeredPriority: number;
  reason: string;
  timestamp: number;
  expiresAt: number;
}

/** 消息处理器 */
export type MessageHandler = (message: AgentMessage) => Promise<void> | void;

/** 消息代理接口 */
export interface IMessageBroker {
  connect(agentId: UUID): Promise<void>;
  disconnect(): Promise<void>;
  send(message: AgentMessage): Promise<void>;
  subscribe(type: MessageType | 'all', handler: MessageHandler): void;
  unsubscribe(type: MessageType | 'all', handler: MessageHandler): void;
}

// ========================================
// 消息代理实现
// ========================================

/**
 * 内存消息代理（单机多 Agent）
 */
export class InMemoryBroker extends EventEmitter implements IMessageBroker {
  private agentId: UUID | null = null;
  private handlers: Map<MessageType | 'all', Set<MessageHandler>>;

  constructor() {
    super();
    this.handlers = new Map();
  }

  async connect(agentId: UUID): Promise<void> {
    this.agentId = agentId;
    logger.info('连接到内存消息代理', { agentId });
  }

  async disconnect(): Promise<void> {
    this.handlers.clear();
    logger.info('断开内存消息代理连接', { agentId: this.agentId });
  }

  async send(message: AgentMessage): Promise<void> {
    // 广播到所有订阅者
    this.emit('message', message);
    
    // 调用类型特定的处理器
    const typeHandlers = this.handlers.get(message.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          await handler(message);
        } catch (error) {
          logger.error('消息处理错误', { error, message });
        }
      }
    }

    // 调用通用处理器
    const allHandlers = this.handlers.get('all');
    if (allHandlers) {
      for (const handler of allHandlers) {
        try {
          await handler(message);
        } catch (error) {
          logger.error('消息处理错误', { error, message });
        }
      }
    }
  }

  subscribe(type: MessageType | 'all', handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  unsubscribe(type: MessageType | 'all', handler: MessageHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.delete(handler);
    }
  }
}

/**
 * Kafka 消息代理（分布式）
 */
export class KafkaBroker implements IMessageBroker {
  private kafka: any;
  private producer: any;
  private consumer: any;
  private agentId: UUID | null = null;
  private handlers: Map<MessageType | 'all', Set<MessageHandler>>;

  constructor(kafkaClient: any) {
    this.kafka = kafkaClient;
    this.handlers = new Map();
  }

  async connect(agentId: UUID): Promise<void> {
    this.agentId = agentId;
    
    this.producer = this.kafka.producer();
    await this.producer.connect();

    this.consumer = this.kafka.consumer({ groupId: `agent-${agentId}` });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: 'agent-messages', fromBeginning: false });

    // 启动消费
    await this.consumer.run({
      eachMessage: async ({ message }: any) => {
        const msg: AgentMessage = JSON.parse(message.value!.toString());
        await this.handleMessage(msg);
      },
    });

    logger.info('连接到 Kafka 消息代理', { agentId });
  }

  async disconnect(): Promise<void> {
    await this.producer?.disconnect();
    await this.consumer?.disconnect();
    this.handlers.clear();
    logger.info('断开 Kafka 消息代理连接', { agentId: this.agentId });
  }

  async send(message: AgentMessage): Promise<void> {
    await this.producer.send({
      topic: 'agent-messages',
      messages: [{ value: JSON.stringify(message) }],
    });
  }

  subscribe(type: MessageType | 'all', handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  unsubscribe(type: MessageType | 'all', handler: MessageHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  private async handleMessage(message: AgentMessage): Promise<void> {
    // 只处理发送给自己的消息或广播
    if (message.to !== 'broadcast' && message.to !== this.agentId) {
      return;
    }

    const typeHandlers = this.handlers.get(message.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          await handler(message);
        } catch (error) {
          logger.error('消息处理错误', { error, message });
        }
      }
    }

    const allHandlers = this.handlers.get('all');
    if (allHandlers) {
      for (const handler of allHandlers) {
        try {
          await handler(message);
        } catch (error) {
          logger.error('消息处理错误', { error, message });
        }
      }
    }
  }
}

// ========================================
// Agent 角色定义
// ========================================

export const AgentRoles = {
  COORDINATOR: {
    role: AgentRole.COORDINATOR,
    capabilities: ['task_decomposition', 'resource_allocation', 'conflict_resolution', 'load_balancing'],
    description: '负责协调多个 Agent 的工作，分配任务和资源',
    priority: 100,
  },
  DATA_AGENT: {
    role: AgentRole.SPECIALIST,
    capabilities: ['data_extraction', 'data_transformation', 'data_loading', 'data_validation', 'schema_discovery'],
    description: '负责数据相关的 ETL 任务',
    priority: 80,
  },
  ETL_AGENT: {
    role: AgentRole.SPECIALIST,
    capabilities: ['etl_pipeline', 'workflow_orchestration', 'task_scheduling', 'data_lineage'],
    description: '负责 ETL 工作流的编排和执行',
    priority: 80,
  },
  ANALYSIS_AGENT: {
    role: AgentRole.SPECIALIST,
    capabilities: ['data_analysis', 'report_generation', 'metrics_calculation', 'statistical_modeling'],
    description: '负责数据分析和指标计算',
    priority: 80,
  },
  VISUALIZATION_AGENT: {
    role: AgentRole.SPECIALIST,
    capabilities: ['chart_generation', 'dashboard_creation', 'interactive_viz', 'report_formatting'],
    description: '负责数据可视化和报表展示',
    priority: 70,
  },
  WORKER: {
    role: AgentRole.WORKER,
    capabilities: ['task_execution', 'tool_invocation', 'data_processing'],
    description: '执行具体的任务',
    priority: 50,
  },
  OBSERVER: {
    role: AgentRole.OBSERVER,
    capabilities: ['monitoring', 'logging', 'alerting'],
    description: '负责监控和观察',
    priority: 30,
  },
};

// ========================================
// Agent 注册表
// ========================================

export class AgentRegistry {
  private agents: Map<UUID, AgentDefinition>;
  private agentLoad: Map<UUID, number>;  // Agent 当前负载
  private agentCapabilities: Map<UUID, string[]>;

  constructor() {
    this.agents = new Map();
    this.agentLoad = new Map();
    this.agentCapabilities = new Map();
  }

  register(agent: AgentDefinition): void {
    this.agents.set(agent.id, agent);
    this.agentLoad.set(agent.id, 0);
    this.agentCapabilities.set(agent.id, agent.capabilities);
    logger.info('Agent 注册成功', { agentId: agent.id, name: agent.name, role: agent.role });
  }

  unregister(agentId: UUID): void {
    this.agents.delete(agentId);
    this.agentLoad.delete(agentId);
    this.agentCapabilities.delete(agentId);
    logger.info('Agent 注销成功', { agentId });
  }

  get(agentId: UUID): AgentDefinition | undefined {
    return this.agents.get(agentId);
  }

  findByRole(role: AgentRole): AgentDefinition[] {
    return Array.from(this.agents.values()).filter((a) => a.role === role);
  }

  findByCapability(capability: string): AgentDefinition[] {
    return Array.from(this.agents.values()).filter((a) =>
      a.capabilities.includes(capability)
    );
  }

  /**
   * 根据能力需求找到最佳匹配的 Agent
   * 考虑负载均衡
   */
  findBestMatch(requiredCapabilities: string[], strategy: AssignmentStrategy = AssignmentStrategy.CAPABILITY_MATCH): AgentDefinition | null {
    const candidates = Array.from(this.agents.values()).filter(agent => {
      return requiredCapabilities.every(cap => agent.capabilities.includes(cap));
    });

    if (candidates.length === 0) return null;

    switch (strategy) {
      case AssignmentStrategy.LOAD_BALANCE:
        // 选择负载最低的
        return candidates.reduce((best, current) => {
          const bestLoad = this.agentLoad.get(best.id) || 0;
          const currentLoad = this.agentLoad.get(current.id) || 0;
          return currentLoad < bestLoad ? current : best;
        });

      case AssignmentStrategy.PRIORITY:
        // 选择优先级最高的
        return candidates.reduce((best, current) => {
          const getPriority = (role: AgentRole) => {
            const roleKey = Object.keys(AgentRoles).find(
              k => AgentRoles[k as keyof typeof AgentRoles].role === role
            );
            return roleKey ? AgentRoles[roleKey as keyof typeof AgentRoles].priority : 0;
          };
          const bestPriority = getPriority(best.role);
          const currentPriority = getPriority(current.role);
          return currentPriority > bestPriority ? current : best;
        });

      case AssignmentStrategy.CAPABILITY_MATCH:
      default:
        // 选择能力匹配度最高的
        return candidates.reduce((best, current) => {
          const bestMatch = this.calculateCapabilityMatch(best, requiredCapabilities);
          const currentMatch = this.calculateCapabilityMatch(current, requiredCapabilities);
          return currentMatch > bestMatch ? current : best;
        });
    }
  }

  private calculateCapabilityMatch(agent: AgentDefinition, required: string[]): number {
    const matches = required.filter(cap => agent.capabilities.includes(cap)).length;
    return matches / required.length;
  }

  updateLoad(agentId: UUID, delta: number): void {
    const current = this.agentLoad.get(agentId) || 0;
    this.agentLoad.set(agentId, Math.max(0, current + delta));
  }

  getLoad(agentId: UUID): number {
    return this.agentLoad.get(agentId) || 0;
  }

  list(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  getAllLoads(): Map<UUID, number> {
    return new Map(this.agentLoad);
  }
}

// ========================================
// 资源管理器
// ========================================

export class ResourceManager extends EventEmitter {
  private resources: Map<string, Resource>;
  private allocations: Map<string, UUID>;  // resourceId -> agentId
  private requests: Map<UUID, ResourceRequest>;
  private requestQueue: ResourceRequest[];

  constructor() {
    super();
    this.resources = new Map();
    this.allocations = new Map();
    this.requests = new Map();
    this.requestQueue = [];
  }

  /**
   * 注册资源
   */
  registerResource(resource: Resource): void {
    this.resources.set(resource.id, resource);
    logger.info('资源注册', { resourceId: resource.id, type: resource.type });
  }

  /**
   * 请求资源
   */
  async requestResource(
    agentId: UUID,
    resourceType: ResourceType,
    options?: {
      resourceId?: string;
      priority?: number;
      duration?: number;
    }
  ): Promise<ResourceRequest> {
    const request: ResourceRequest = {
      id: uuidv4(),
      agentId,
      resourceType,
      resourceId: options?.resourceId,
      priority: options?.priority || 50,
      duration: options?.duration || 60000,
      timestamp: Date.now(),
      status: 'pending',
    };

    this.requests.set(request.id, request);

    // 检查是否有冲突
    const conflict = this.detectConflict(request);
    
    if (!conflict) {
      // 无冲突，直接分配
      await this.grantRequest(request);
    } else {
      // 有冲突，加入队列等待协商
      this.requestQueue.push(request);
      this.requestQueue.sort((a, b) => b.priority - a.priority);
      
      logger.info('资源请求排队', { 
        requestId: request.id, 
        resourceType,
        conflictWith: conflict.agentId,
        queuePosition: this.requestQueue.indexOf(request)
      });

      this.emit('resource:conflict', { request, conflict });
    }

    return request;
  }

  /**
   * 检测资源冲突
   */
  private detectConflict(request: ResourceRequest): ResourceRequest | null {
    // 检查是否有其他 Agent 持有相同资源
    if (request.resourceId && this.allocations.has(request.resourceId)) {
      const holderId = this.allocations.get(request.resourceId)!;
      
      // 查找持有者的请求
      for (const req of this.requests.values()) {
        if (req.agentId === holderId && req.status === 'granted') {
          return req;
        }
      }
    }

    // 检查同类型资源的并发限制
    const sameTypeHolders = Array.from(this.allocations.entries())
      .filter(([_, agentId]) => {
        const res = this.resources.get(_);
        return res?.type === request.resourceType;
      });

    // 简化：假设每种资源类型最多3个并发
    if (sameTypeHolders.length >= 3) {
      // 找到优先级最低的持有者
      const lowestPriority = sameTypeHolders
        .map(([resId, agentId]) => {
          const req = Array.from(this.requests.values())
            .find(r => r.agentId === agentId && r.status === 'granted');
          return { resourceId: resId, agentId, priority: req?.priority || 0 };
        })
        .sort((a, b) => a.priority - b.priority)[0];

      if (lowestPriority && lowestPriority.priority < request.priority) {
        return this.requests.get(lowestPriority.agentId) || null;
      }
    }

    return null;
  }

  /**
   * 授予资源请求
   */
  private async grantRequest(request: ResourceRequest): Promise<void> {
    request.status = 'granted';
    request.acquiredAt = Date.now();
    request.expiresAt = Date.now() + request.duration;

    if (request.resourceId) {
      this.allocations.set(request.resourceId, request.agentId);
      
      const resource = this.resources.get(request.resourceId);
      if (resource) {
        resource.owner = request.agentId;
        resource.acquiredAt = request.acquiredAt;
        resource.expiresAt = request.expiresAt;
      }
    }

    this.emit('resource:granted', request);
    logger.info('资源已授予', { requestId: request.id, agentId: request.agentId });

    // 设置自动释放定时器
    setTimeout(() => {
      this.releaseResource(request.id);
    }, request.duration);
  }

  /**
   * 释放资源
   */
  releaseResource(requestId: UUID): boolean {
    const request = this.requests.get(requestId);
    if (!request || request.status !== 'granted') {
      return false;
    }

    request.status = 'released';

    if (request.resourceId) {
      this.allocations.delete(request.resourceId);
      
      const resource = this.resources.get(request.resourceId);
      if (resource) {
        resource.owner = undefined;
        resource.acquiredAt = undefined;
        resource.expiresAt = undefined;
      }
    }

    this.emit('resource:released', request);
    logger.info('资源已释放', { requestId, agentId: request.agentId });

    // 处理队列中的下一个请求
    this.processQueue();

    return true;
  }

  /**
   * 处理等待队列
   */
  private processQueue(): void {
    // 按优先级处理队列
    const pending = this.requestQueue.filter(r => r.status === 'pending');
    pending.sort((a, b) => b.priority - a.priority);

    for (const request of pending) {
      const conflict = this.detectConflict(request);
      if (!conflict) {
        this.grantRequest(request);
        this.requestQueue = this.requestQueue.filter(r => r.id !== request.id);
      }
    }
  }

  /**
   * 强制回收资源（用于高优先级抢占）
   */
  async preemptResource(resourceId: string, newRequest: ResourceRequest): Promise<boolean> {
    const currentHolder = this.allocations.get(resourceId);
    if (!currentHolder) {
      return false;
    }

    // 找到当前持有者的请求并释放
    for (const [id, req] of this.requests) {
      if (req.agentId === currentHolder && req.status === 'granted') {
        this.releaseResource(id);
        this.emit('resource:preempted', { resourceId, from: currentHolder, to: newRequest.agentId });
        break;
      }
    }

    // 授予新请求
    await this.grantRequest(newRequest);
    return true;
  }

  /**
   * 获取资源状态
   */
  getResourceStatus(resourceId: string): {
    resource: Resource | undefined;
    allocated: boolean;
    owner?: UUID;
  } {
    const resource = this.resources.get(resourceId);
    const owner = this.allocations.get(resourceId);
    
    return {
      resource,
      allocated: !!owner,
      owner,
    };
  }

  /**
   * 列出所有资源
   */
  listResources(): Resource[] {
    return Array.from(this.resources.values());
  }

  /**
   * 获取 Agent 持有的资源
   */
  getAgentResources(agentId: UUID): Resource[] {
    const resourceIds = Array.from(this.allocations.entries())
      .filter(([_, id]) => id === agentId)
      .map(([resId, _]) => resId);
    
    return resourceIds
      .map(id => this.resources.get(id))
      .filter((r): r is Resource => r !== undefined);
  }
}

// ========================================
// 协商管理器
// ========================================

export class NegotiationManager extends EventEmitter {
  private proposals: Map<UUID, NegotiationProposal>;
  private responses: Map<UUID, { accepted: boolean; reason?: string }>;

  constructor() {
    super();
    this.proposals = new Map();
    this.responses = new Map();
  }

  /**
   * 创建协商提案
   */
  createProposal(
    proposerId: UUID,
    targetId: UUID,
    resourceId: string,
    offeredPriority: number,
    reason: string,
    timeout: number = 30000
  ): NegotiationProposal {
    const proposal: NegotiationProposal = {
      id: uuidv4(),
      proposerId,
      targetId,
      resourceId,
      offeredPriority,
      reason,
      timestamp: Date.now(),
      expiresAt: Date.now() + timeout,
    };

    this.proposals.set(proposal.id, proposal);

    // 设置超时处理
    setTimeout(() => {
      if (!this.responses.has(proposal.id)) {
        this.emit('proposal:expired', proposal);
      }
    }, timeout);

    this.emit('proposal:created', proposal);
    logger.info('协商提案创建', { proposalId: proposal.id, proposerId, targetId });

    return proposal;
  }

  /**
   * 响应提案
   */
  respondToProposal(
    proposalId: UUID,
    accepted: boolean,
    reason?: string
  ): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new CollaborationError('提案未找到');
    }

    if (Date.now() > proposal.expiresAt) {
      throw new CollaborationError('提案已过期');
    }

    this.responses.set(proposalId, { accepted, reason });
    this.emit('proposal:responded', { proposal, accepted, reason });

    logger.info('协商提案响应', { proposalId, accepted });
  }

  /**
   * 获取提案状态
   */
  getProposalStatus(proposalId: UUID): {
    proposal: NegotiationProposal | undefined;
    responded: boolean;
    accepted?: boolean;
  } {
    const proposal = this.proposals.get(proposalId);
    const response = this.responses.get(proposalId);

    return {
      proposal,
      responded: !!response,
      accepted: response?.accepted,
    };
  }

  /**
   * 协商资源冲突
   * 尝试找到双方都能接受的解决方案
   */
  async negotiateConflict(
    requesterId: UUID,
    holderId: UUID,
    resourceId: string
  ): Promise<{ success: boolean; resolution?: string }> {
    // 创建提案：请求者提供更高的优先级或补偿
    const proposal = this.createProposal(
      requesterId,
      holderId,
      resourceId,
      80,  // 提供较高优先级
      `需要临时使用 ${resourceId} 完成关键任务，完成后立即释放`,
      30000
    );

    // 等待响应（简化实现，实际应该通过消息代理）
    return new Promise((resolve) => {
      this.once('proposal:responded', ({ proposal: p, accepted }) => {
        if (p.id === proposal.id) {
          resolve({
            success: accepted,
            resolution: accepted ? '资源让渡' : '保持现状',
          });
        }
      });

      // 超时处理
      setTimeout(() => {
        resolve({ success: false, resolution: '协商超时' });
      }, 30000);
    });
  }
}

// ========================================
// 任务分解器
// ========================================

export class TaskDecomposer {
  /**
   * 分解复杂任务为子任务
   */
  decomposeTask(
    goal: string,
    context?: Record<string, any>
  ): SubTask[] {
    const subtasks: SubTask[] = [];

    // 根据目标类型进行分解
    if (goal.includes('数据同步') || goal.includes('ETL') || goal.includes('数据迁移')) {
      // ETL 任务分解
      subtasks.push(
        {
          id: uuidv4(),
          name: '数据源连接',
          description: '建立数据源连接并验证',
          dependencies: [],
          status: TaskStatus.PENDING,
          priority: 1,
          tools: ['data_connector'],
          retryCount: 0,
          maxRetries: 3,
        },
        {
          id: uuidv4(),
          name: '数据抽取',
          description: '从数据源抽取数据',
          dependencies: [],
          status: TaskStatus.PENDING,
          priority: 1,
          tools: ['data_extractor'],
          retryCount: 0,
          maxRetries: 3,
        },
        {
          id: uuidv4(),
          name: '数据转换',
          description: '执行数据清洗和转换',
          dependencies: [],
          status: TaskStatus.PENDING,
          priority: 2,
          tools: ['data_transformer'],
          retryCount: 0,
          maxRetries: 3,
        },
        {
          id: uuidv4(),
          name: '数据加载',
          description: '加载数据到目标',
          dependencies: [],
          status: TaskStatus.PENDING,
          priority: 2,
          tools: ['data_loader'],
          retryCount: 0,
          maxRetries: 3,
        },
        {
          id: uuidv4(),
          name: '数据验证',
          description: '验证数据完整性和准确性',
          dependencies: [],
          status: TaskStatus.PENDING,
          priority: 3,
          tools: ['data_validator'],
          retryCount: 0,
          maxRetries: 2,
        }
      );
    } else if (goal.includes('分析') || goal.includes('报表')) {
      // 分析任务分解
      subtasks.push(
        {
          id: uuidv4(),
          name: '数据获取',
          description: '获取分析所需数据',
          dependencies: [],
          status: TaskStatus.PENDING,
          priority: 1,
          tools: ['data_query'],
          retryCount: 0,
          maxRetries: 3,
        },
        {
          id: uuidv4(),
          name: '数据处理',
          description: '处理数据以适合分析',
          dependencies: [],
          status: TaskStatus.PENDING,
          priority: 2,
          tools: ['data_processor'],
          retryCount: 0,
          maxRetries: 3,
        },
        {
          id: uuidv4(),
          name: '分析计算',
          description: '执行分析算法和计算',
          dependencies: [],
          status: TaskStatus.PENDING,
          priority: 2,
          tools: ['analytics_engine'],
          retryCount: 0,
          maxRetries: 3,
        },
        {
          id: uuidv4(),
          name: '结果生成',
          description: '生成分析报告或图表',
          dependencies: [],
          status: TaskStatus.PENDING,
          priority: 3,
          tools: ['report_generator'],
          retryCount: 0,
          maxRetries: 2,
        }
      );
    } else {
      // 通用任务分解
      subtasks.push({
        id: uuidv4(),
        name: '任务执行',
        description: goal,
        dependencies: [],
        status: TaskStatus.PENDING,
        priority: 1,
        tools: [],
        retryCount: 0,
        maxRetries: 3,
      });
    }

    return subtasks;
  }

  /**
   * 为子任务分配最佳 Agent
   */
  assignSubtasks(
    subtasks: SubTask[],
    registry: AgentRegistry,
    strategy: AssignmentStrategy = AssignmentStrategy.CAPABILITY_MATCH
  ): Map<UUID, UUID> {
    const assignments = new Map<UUID, UUID>();

    for (const subtask of subtasks) {
      const requiredCapabilities = subtask.tools || [];
      const bestAgent = registry.findBestMatch(requiredCapabilities, strategy);

      if (bestAgent) {
        assignments.set(subtask.id, bestAgent.id);
        registry.updateLoad(bestAgent.id, 1);
      }
    }

    return assignments;
  }
}

// ========================================
// 协作管理器（增强版）
// ========================================

export class CollaborationManager extends EventEmitter {
  private broker: IMessageBroker;
  private registry: AgentRegistry;
  private resourceManager: ResourceManager;
  private negotiationManager: NegotiationManager;
  private taskDecomposer: TaskDecomposer;
  private agentId: UUID;
  private collaborativeTasks: Map<UUID, CollaborativeTask>;
  private isCoordinator: boolean;

  constructor(
    agentId: UUID,
    broker: IMessageBroker,
    registry: AgentRegistry,
    isCoordinator: boolean = false
  ) {
    super();
    this.agentId = agentId;
    this.broker = broker;
    this.registry = registry;
    this.resourceManager = new ResourceManager();
    this.negotiationManager = new NegotiationManager();
    this.taskDecomposer = new TaskDecomposer();
    this.collaborativeTasks = new Map();
    this.isCoordinator = isCoordinator;

    this.setupMessageHandlers();
    this.setupEventHandlers();
  }

  private setupMessageHandlers() {
    // 任务分配
    this.broker.subscribe(MessageType.TASK_ASSIGN, async (msg) => {
      if (msg.to === this.agentId || msg.to === 'broadcast') {
        this.emit('task:assigned', msg.content);
        logger.info('收到任务分配', { from: msg.from, task: msg.content });
      }
    });

    // 任务结果
    this.broker.subscribe(MessageType.TASK_RESULT, async (msg) => {
      this.emit('task:result', msg);
      logger.info('收到任务结果', { from: msg.from });
    });

    // 状态更新
    this.broker.subscribe(MessageType.STATUS_UPDATE, async (msg) => {
      this.emit('status:update', msg);
    });

    // 协调消息
    this.broker.subscribe(MessageType.COORDINATION, async (msg) => {
      this.emit('coordination', msg);
      await this.handleCoordination(msg);
    });

    // 错误报告
    this.broker.subscribe(MessageType.ERROR_REPORT, async (msg) => {
      this.emit('error:report', msg);
      await this.handleErrorReport(msg);
    });
  }

  private setupEventHandlers() {
    // 资源冲突事件
    this.resourceManager.on('resource:conflict', async ({ request, conflict }) => {
      logger.info('资源冲突 detected', { request: request.id, conflict: conflict.agentId });
      
      // 尝试协商解决
      const result = await this.negotiationManager.negotiateConflict(
        request.agentId,
        conflict.agentId,
        request.resourceId || ''
      );

      if (result.success) {
        logger.info('冲突通过协商解决', { resolution: result.resolution });
      } else {
        logger.warn('协商失败，使用优先级抢占', { requestId: request.id });
        // 如果新请求优先级更高，可以抢占
        if (request.priority > conflict.priority) {
          await this.resourceManager.preemptResource(request.resourceId || '', request);
        }
      }
    });

    // 提案响应
    this.negotiationManager.on('proposal:created', (proposal) => {
      // 如果是发给自己的提案，发送响应
      if (proposal.targetId === this.agentId) {
        // 简化：自动接受高优先级的让渡请求
        const shouldAccept = proposal.offeredPriority > 70;
        this.negotiationManager.respondToProposal(
          proposal.id,
          shouldAccept,
          shouldAccept ? '接受让渡' : '当前任务关键，无法让渡'
        );
      }
    });
  }

  async connect(): Promise<void> {
    await this.broker.connect(this.agentId);
    logger.info('协作管理器已连接', { agentId: this.agentId, isCoordinator: this.isCoordinator });
  }

  async disconnect(): Promise<void> {
    // 释放所有持有的资源
    const myResources = this.resourceManager.getAgentResources(this.agentId);
    for (const resource of myResources) {
      for (const [reqId, req] of this.resourceManager['requests']) {
        if (req.agentId === this.agentId && req.resourceId === resource.id) {
          this.resourceManager.releaseResource(reqId);
        }
      }
    }

    await this.broker.disconnect();
    logger.info('协作管理器已断开', { agentId: this.agentId });
  }

  async sendMessage(
    to: UUID | 'broadcast',
    type: MessageType,
    content: any,
    correlationId?: UUID
  ): Promise<void> {
    const message: AgentMessage = {
      id: uuidv4(),
      type,
      from: this.agentId,
      to,
      content,
      timestamp: Date.now(),
      correlationId,
    };

    await this.broker.send(message);
    this.emit('message:send', { message });
  }

  /**
   * 创建协作任务（协调者功能）
   */
  async createCollaborativeTask(
    goal: string,
    participants: UUID[],
    options?: {
      strategy?: AssignmentStrategy;
      decompose?: boolean;
    }
  ): Promise<CollaborativeTask> {
    if (!this.isCoordinator) {
      logger.warn('非协调者尝试创建协作任务');
    }

    const task: CollaborativeTask = {
      id: uuidv4(),
      goal,
      participants: [this.agentId, ...participants],
      coordinator: this.agentId,
      subtasks: new Map(),
      status: TaskStatus.PENDING,
      createdAt: Date.now(),
    };

    // 任务分解
    if (options?.decompose !== false) {
      const subtasks = this.taskDecomposer.decomposeTask(goal);
      
      // 分配子任务
      const assignments = this.taskDecomposer.assignSubtasks(
        subtasks,
        this.registry,
        options?.strategy || AssignmentStrategy.CAPABILITY_MATCH
      );

      // 更新任务的子任务映射
      for (const [subtaskId, agentId] of assignments) {
        task.subtasks.set(subtaskId, agentId);
      }

      // 保存子任务到协作任务
      (task as any).subtaskDetails = subtasks;
    }

    this.collaborativeTasks.set(task.id, task);

    // 通知所有参与者
    await this.sendMessage('broadcast', MessageType.COORDINATION, {
      action: 'task_created',
      taskId: task.id,
      goal,
      coordinator: this.agentId,
      subtaskAssignments: Array.from(task.subtasks.entries()),
    });

    logger.info('创建协作任务', { taskId: task.id, participants, subtasks: task.subtasks.size });

    return task;
  }

  /**
   * 分配子任务
   */
  async assignSubtask(
    taskId: UUID,
    subtaskId: UUID,
    assigneeId: UUID,
    description: string,
    requiredCapabilities?: string[]
  ): Promise<void> {
    const task = this.collaborativeTasks.get(taskId);
    if (!task) {
      throw new CollaborationError('协作任务未找到');
    }

    if (task.coordinator !== this.agentId) {
      throw new CollaborationError('只有协调者可以分配任务');
    }

    task.subtasks.set(subtaskId, assigneeId);

    // 发送任务分配消息
    await this.sendMessage(assigneeId, MessageType.TASK_ASSIGN, {
      taskId,
      subtaskId,
      description,
      requiredCapabilities,
    });

    logger.info('分配子任务', { taskId, subtaskId, assigneeId });
  }

  /**
   * 提交任务结果
   */
  async submitResult(
    taskId: UUID,
    subtaskId: UUID,
    result: any
  ): Promise<void> {
    const task = this.collaborativeTasks.get(taskId);
    if (!task) return;

    // 更新负载
    this.registry.updateLoad(this.agentId, -1);

    // 发送结果给协调者
    await this.sendMessage(task.coordinator, MessageType.TASK_RESULT, {
      taskId,
      subtaskId,
      result,
      from: this.agentId,
    });

    logger.info('提交任务结果', { taskId, subtaskId });
  }

  /**
   * 广播状态更新
   */
  async broadcastStatus(status: string, details?: any): Promise<void> {
    await this.sendMessage('broadcast', MessageType.STATUS_UPDATE, {
      agentId: this.agentId,
      status,
      load: this.registry.getLoad(this.agentId),
      details,
      timestamp: Date.now(),
    });
  }

  /**
   * 请求资源
   */
  async requestResource(
    resourceType: ResourceType,
    options?: {
      resourceId?: string;
      priority?: number;
      duration?: number;
    }
  ): Promise<ResourceRequest> {
    const request = await this.resourceManager.requestResource(
      this.agentId,
      resourceType,
      options
    );

    // 广播资源请求
    await this.sendMessage('broadcast', MessageType.COORDINATION, {
      action: 'resource_request',
      requestId: request.id,
      agentId: this.agentId,
      resourceType,
      resourceId: options?.resourceId,
      priority: options?.priority,
    });

    return request;
  }

  /**
   * 释放资源
   */
  releaseResource(requestId: UUID): boolean {
    return this.resourceManager.releaseResource(requestId);
  }

  /**
   * 处理协调消息
   */
  private async handleCoordination(msg: AgentMessage): Promise<void> {
    const { action } = msg.content;

    switch (action) {
      case 'resource_request':
        // 处理资源请求
        if (msg.content.agentId !== this.agentId) {
          this.emit('resource:requested', msg.content);
        }
        break;

      case 'task_created':
        // 新任务创建
        if (msg.content.coordinator !== this.agentId) {
          this.emit('collaborative_task:created', msg.content);
        }
        break;

      case 'negotiation_proposal':
        // 处理协商提案
        this.emit('negotiation:proposal', msg.content);
        break;

      default:
        logger.debug('未知协调动作', { action });
    }
  }

  /**
   * 处理错误报告
   */
  private async handleErrorReport(msg: AgentMessage): Promise<void> {
    const { taskId, error, recoverable } = msg.content;
    
    logger.error('收到错误报告', { from: msg.from, taskId, error });

    if (recoverable) {
      // 尝试重新分配任务
      this.emit('task:failed_recoverable', { taskId, error, from: msg.from });
    } else {
      // 通知协调者任务失败
      this.emit('task:failed_fatal', { taskId, error, from: msg.from });
    }
  }

  getCollaborativeTask(taskId: UUID): CollaborativeTask | undefined {
    return this.collaborativeTasks.get(taskId);
  }

  listCollaborativeTasks(): CollaborativeTask[] {
    return Array.from(this.collaborativeTasks.values());
  }

  /**
   * 获取资源管理器
   */
  getResourceManager(): ResourceManager {
    return this.resourceManager;
  }

  /**
   * 获取协商管理器
   */
  getNegotiationManager(): NegotiationManager {
    return this.negotiationManager;
  }

  /**
   * 设置是否为协调者
   */
  setCoordinator(isCoordinator: boolean): void {
    this.isCoordinator = isCoordinator;
  }
}

// ========================================
// 协作层核心类
// ========================================

export class CollaborationLayer extends EventEmitter {
  private agentId: UUID;
  private broker: IMessageBroker;
  private manager: CollaborationManager;
  private registry: AgentRegistry;

  constructor(agentId: UUID, broker?: IMessageBroker, isCoordinator: boolean = false) {
    super();
    this.agentId = agentId;
    this.broker = broker || new InMemoryBroker();
    this.registry = new AgentRegistry();
    this.manager = new CollaborationManager(agentId, this.broker, this.registry, isCoordinator);

    // 转发事件
    this.manager.on('task:assigned', (data) => this.emit('task:assigned', data));
    this.manager.on('task:result', (data) => this.emit('task:result', data));
    this.manager.on('message:send', (data) => this.emit('message:send', data));
    this.manager.on('resource:granted', (data) => this.emit('resource:granted', data));
    this.manager.on('resource:conflict', (data) => this.emit('resource:conflict', data));
  }

  async initialize(role: AgentRole = AgentRole.WORKER, capabilities: string[] = []): Promise<void> {
    await this.manager.connect();

    // 注册自己
    this.registry.register({
      id: this.agentId,
      name: `Agent-${this.agentId.slice(0, 8)}`,
      role,
      capabilities,
      description: this.getRoleDescription(role),
      config: {},
    });

    // 定期广播状态
    setInterval(() => {
      this.manager.broadcastStatus('active');
    }, 30000);
  }

  async shutdown(): Promise<void> {
    await this.manager.disconnect();
  }

  async sendMessage(to: UUID | 'broadcast', type: MessageType, content: any): Promise<void> {
    return this.manager.sendMessage(to, type, content);
  }

  async createTask(goal: string, participants: UUID[], options?: any): Promise<CollaborativeTask> {
    return this.manager.createCollaborativeTask(goal, participants, options);
  }

  registerAgent(agent: AgentDefinition): void {
    this.registry.register(agent);
  }

  discoverAgents(capability?: string): AgentDefinition[] {
    if (capability) {
      return this.registry.findByCapability(capability);
    }
    return this.registry.list();
  }

  /**
   * 查找最佳匹配的 Agent
   */
  findBestAgent(requiredCapabilities: string[], strategy?: AssignmentStrategy): AgentDefinition | null {
    return this.registry.findBestMatch(requiredCapabilities, strategy);
  }

  getManager(): CollaborationManager {
    return this.manager;
  }

  getRegistry(): AgentRegistry {
    return this.registry;
  }

  /**
   * 设置协调者模式
   */
  setAsCoordinator(isCoordinator: boolean = true): void {
    this.manager.setCoordinator(isCoordinator);
  }

  /**
   * 获取角色描述
   */
  private getRoleDescription(role: AgentRole): string {
    const roleEntry = Object.values(AgentRoles).find(r => r.role === role);
    return roleEntry?.description || 'Default agent';
  }
}

export default CollaborationLayer;
