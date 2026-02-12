/**
 * 记忆层 (Memory Layer)
 * Agent 的"大脑存储" - 保存并复用信息
 * 
 * 三级记忆体系:
 * 1. 短期记忆(工作记忆): 当前任务临时信息，随任务结束清理
 * 2. 长期记忆(经验记忆): 历史任务经验、用户偏好、异常处理方案
 * 3. 知识记忆(事实记忆): 领域知识、本体论定义的概念/关系
 * 
 * 检索优化:
 * - 语义检索: 基于向量相似度
 * - 关键词检索: 基于标签和元数据
 * - 混合检索: 结合两者优势
 */

import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../utils/logger';
import { MemoryError } from '../../utils/errors';
import {
  Memory,
  MemoryType,
  MemoryQuery,
  SessionMemory,
  SubTask,
  UUID,
  Timestamp,
} from '../../types';
import { OntologyManager } from '../ontologies';

export { MemoryType };

// ========================================
// 记忆类型扩展
// ========================================

/** 工作记忆(短期) - 当前任务上下文 */
export interface WorkingMemory {
  sessionId: UUID;
  agentId: UUID;
  currentGoal?: string;
  taskStack: SubTask[];
  tempResults: Map<string, any>;
  context: Record<string, any>;
  startTime: Timestamp;
  lastActive: Timestamp;
}

/** 经验记忆(长期) - 可复用的经验 */
export interface ExperienceMemory {
  id: UUID;
  taskType: string;
  pattern: string;
  solution: string;
  successRate: number;
  applicationCount: number;
  context: Record<string, any>;
  createdAt: Timestamp;
  lastApplied: Timestamp;
}

/** 知识记忆 - 与本体论联动 */
export interface KnowledgeMemory {
  id: UUID;
  conceptId?: UUID;
  conceptName: string;
  conceptType: string;
  facts: Record<string, any>;
  relationships: Array<{
    type: string;
    target: string;
    properties?: Record<string, any>;
  }>;
  source: 'ontology' | 'learned' | 'external';
  confidence: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

const logger = createLogger('MemoryLayer');

// ========================================
// 工作记忆管理器 (短期记忆)
// ========================================

export class WorkingMemoryManager {
  private workingMemories: Map<UUID, WorkingMemory>;
  private maxSessions: number;

  constructor(maxSessions: number = 100) {
    this.workingMemories = new Map();
    this.maxSessions = maxSessions;
  }

  /**
   * 创建工作记忆
   */
  create(agentId: UUID, sessionId?: UUID): WorkingMemory {
    // LRU 淘池
    if (this.workingMemories.size >= this.maxSessions) {
      const oldest = this.findOldestSession();
      if (oldest) {
        this.workingMemories.delete(oldest);
        logger.debug('工作记忆LRU淘池', { removedSession: oldest });
      }
    }

    const id = sessionId || uuidv4();
    const memory: WorkingMemory = {
      sessionId: id,
      agentId,
      taskStack: [],
      tempResults: new Map(),
      context: {},
      startTime: Date.now(),
      lastActive: Date.now(),
    };

    this.workingMemories.set(id, memory);
    logger.debug('工作记忆创建', { sessionId: id, agentId });
    return memory;
  }

  /**
   * 获取工作记忆
   */
  get(sessionId: UUID): WorkingMemory | undefined {
    const memory = this.workingMemories.get(sessionId);
    if (memory) {
      memory.lastActive = Date.now();
    }
    return memory;
  }

  /**
   * 更新上下文
   */
  updateContext(sessionId: UUID, key: string, value: any): void {
    const memory = this.workingMemories.get(sessionId);
    if (memory) {
      memory.context[key] = value;
      memory.lastActive = Date.now();
    }
  }

  /**
   * 存储临时结果
   */
  setTempResult(sessionId: UUID, key: string, value: any): void {
    const memory = this.workingMemories.get(sessionId);
    if (memory) {
      memory.tempResults.set(key, value);
      memory.lastActive = Date.now();
    }
  }

  /**
   * 获取临时结果
   */
  getTempResult(sessionId: UUID, key: string): any {
    const memory = this.workingMemories.get(sessionId);
    if (memory) {
      memory.lastActive = Date.now();
      return memory.tempResults.get(key);
    }
    return undefined;
  }

  /**
   * 添加子任务
   */
  pushTask(sessionId: UUID, task: SubTask): void {
    const memory = this.workingMemories.get(sessionId);
    if (memory) {
      memory.taskStack.push(task);
      memory.lastActive = Date.now();
    }
  }

  /**
   * 完成当前任务
   */
  completeCurrentTask(sessionId: UUID, output?: any): SubTask | undefined {
    const memory = this.workingMemories.get(sessionId);
    if (memory && memory.taskStack.length > 0) {
      const task = memory.taskStack.pop()!;
      task.status = 'completed' as any;
      task.output = output;
      memory.lastActive = Date.now();
      return task;
    }
    return undefined;
  }

  /**
   * 获取当前任务
   */
  getCurrentTask(sessionId: UUID): SubTask | undefined {
    const memory = this.workingMemories.get(sessionId);
    return memory?.taskStack[memory.taskStack.length - 1];
  }

  /**
   * 清理任务结束的工作记忆
   */
  cleanup(sessionId: UUID): void {
    const memory = this.workingMemories.get(sessionId);
    if (memory) {
      // 保存最终结果后清理
      this.workingMemories.delete(sessionId);
      logger.debug('工作记忆清理', { sessionId });
    }
  }

  /**
   * 查找最久未使用的会话
   */
  private findOldestSession(): UUID | undefined {
    let oldest: UUID | undefined;
    let oldestTime = Infinity;

    for (const [id, memory] of this.workingMemories) {
      if (memory.lastActive < oldestTime) {
        oldestTime = memory.lastActive;
        oldest = id;
      }
    }

    return oldest;
  }
}

// ========================================
// 经验记忆管理器 (长期记忆)
// ========================================

export class ExperienceMemoryManager {
  private experiences: Map<UUID, ExperienceMemory>;
  private patterns: Map<string, UUID[]>; // 模式 -> 经验ID列表

  constructor() {
    this.experiences = new Map();
    this.patterns = new Map();
  }

  /**
   * 记录经验
   */
  recordExperience(
    taskType: string,
    pattern: string,
    solution: string,
    context: Record<string, any>
  ): ExperienceMemory {
    const id = uuidv4();
    const experience: ExperienceMemory = {
      id,
      taskType,
      pattern,
      solution,
      successRate: 1.0,
      applicationCount: 1,
      context,
      createdAt: Date.now(),
      lastApplied: Date.now(),
    };

    this.experiences.set(id, experience);

    // 索引模式
    if (!this.patterns.has(pattern)) {
      this.patterns.set(pattern, []);
    }
    this.patterns.get(pattern)!.push(id);

    logger.debug('经验记忆记录', { id, taskType, pattern });
    return experience;
  }

  /**
   * 查找相似经验
   */
  findSimilarExperiences(taskType: string, context: Record<string, any>): ExperienceMemory[] {
    const matches: ExperienceMemory[] = [];

    for (const exp of this.experiences.values()) {
      if (exp.taskType === taskType) {
        // 计算上下文相似度
        const similarity = this.calculateContextSimilarity(exp.context, context);
        if (similarity > 0.6) {
          matches.push(exp);
        }
      }
    }

    // 按成功率和应用次数排序
    matches.sort((a, b) => {
      const scoreA = a.successRate * Math.log(a.applicationCount + 1);
      const scoreB = b.successRate * Math.log(b.applicationCount + 1);
      return scoreB - scoreA;
    });

    return matches.slice(0, 5); // 返回最相关的5个
  }

  /**
   * 更新经验成功率
   */
  updateSuccessRate(id: UUID, success: boolean): void {
    const exp = this.experiences.get(id);
    if (exp) {
      exp.applicationCount++;
      exp.lastApplied = Date.now();

      // 更新成功率 (滑动平均)
      const alpha = 0.3; // 学习率
      const result = success ? 1 : 0;
      exp.successRate = exp.successRate * (1 - alpha) + result * alpha;

      logger.debug('经验成功率更新', { 
        id, 
        successRate: exp.successRate, 
        applicationCount: exp.applicationCount 
      });
    }
  }

  /**
   * 计算上下文相似度
   */
  private calculateContextSimilarity(ctx1: Record<string, any>, ctx2: Record<string, any>): number {
    const keys1 = Object.keys(ctx1);
    const keys2 = Object.keys(ctx2);
    const commonKeys = keys1.filter(k => keys2.includes(k));

    if (commonKeys.length === 0) return 0;

    let matches = 0;
    for (const key of commonKeys) {
      if (JSON.stringify(ctx1[key]) === JSON.stringify(ctx2[key])) {
        matches++;
      }
    }

    return matches / Math.max(keys1.length, keys2.length);
  }

  /**
   * 遗忘低成功率经验
   */
  forgetLowSuccessExperiences(threshold: number = 0.3): number {
    let deleted = 0;
    for (const [id, exp] of this.experiences) {
      if (exp.successRate < threshold && exp.applicationCount > 5) {
        this.experiences.delete(id);
        deleted++;
      }
    }
    logger.info('遗忘低成功率经验', { deleted, threshold });
    return deleted;
  }
}

// ========================================
// 知识记忆管理器 (与本体论联动)
// ========================================

export class KnowledgeMemoryManager {
  private knowledges: Map<UUID, KnowledgeMemory>;
  private conceptIndex: Map<string, UUID[]>; // 概念名 -> 知识ID
  private ontologyManager?: OntologyManager;

  constructor(ontologyManager?: OntologyManager) {
    this.knowledges = new Map();
    this.conceptIndex = new Map();
    this.ontologyManager = ontologyManager;
  }

  /**
   * 从本体论同步知识
   */
  async syncFromOntology(): Promise<number> {
    if (!this.ontologyManager) {
      logger.warn('未提供本体管理器，无法同步知识');
      return 0;
    }

    const concepts = this.ontologyManager.findConceptsByType('entity');
    let synced = 0;

    for (const concept of concepts) {
      const existing = this.findByConceptName(concept.name);
      if (existing.length === 0) {
        await this.addKnowledge({
          conceptId: concept.id,
          conceptName: concept.name,
          conceptType: concept.type,
          facts: concept.properties,
          relationships: concept.relationships.map((r: any) => ({
            type: r.type,
            target: r.target,
            properties: r.properties,
          })),
          source: 'ontology',
          confidence: 1.0,
        });
        synced++;
      }
    }

    logger.info('本体论知识同步完成', { synced });
    return synced;
  }

  /**
   * 添加知识
   */
  async addKnowledge(knowledge: Omit<KnowledgeMemory, 'id' | 'createdAt' | 'updatedAt'>): Promise<KnowledgeMemory> {
    const id = uuidv4();
    const now = Date.now();
    const fullKnowledge: KnowledgeMemory = {
      ...knowledge,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.knowledges.set(id, fullKnowledge);

    // 索引概念名
    if (!this.conceptIndex.has(knowledge.conceptName)) {
      this.conceptIndex.set(knowledge.conceptName, []);
    }
    this.conceptIndex.get(knowledge.conceptName)!.push(id);

    logger.debug('知识记忆添加', { id, conceptName: knowledge.conceptName });
    return fullKnowledge;
  }

  /**
   * 查询知识
   */
  queryKnowledge(conceptName?: string, conceptType?: string): KnowledgeMemory[] {
    let results = Array.from(this.knowledges.values());

    if (conceptName) {
      const ids = this.conceptIndex.get(conceptName) || [];
      results = ids.map(id => this.knowledges.get(id)!).filter(Boolean);
    }

    if (conceptType) {
      results = results.filter(k => k.conceptType === conceptType);
    }

    // 按置信度排序
    results.sort((a, b) => b.confidence - a.confidence);

    return results;
  }

  /**
   * 通过关系查询
   */
  queryByRelation(relationType: string, targetConcept?: string): KnowledgeMemory[] {
    const results: KnowledgeMemory[] = [];

    for (const knowledge of this.knowledges.values()) {
      for (const rel of knowledge.relationships) {
        if (rel.type === relationType) {
          if (!targetConcept || rel.target === targetConcept) {
            results.push(knowledge);
            break;
          }
        }
      }
    }

    return results;
  }

  /**
   * 根据概念名查找
   */
  private findByConceptName(name: string): KnowledgeMemory[] {
    const ids = this.conceptIndex.get(name) || [];
    return ids.map(id => this.knowledges.get(id)!).filter(Boolean);
  }

  /**
   * 更新知识信心度
   */
  updateConfidence(id: UUID, newConfidence: number): void {
    const knowledge = this.knowledges.get(id);
    if (knowledge) {
      knowledge.confidence = Math.max(0, Math.min(1, newConfidence));
      knowledge.updatedAt = Date.now();
    }
  }
}

export interface IMemoryStore {
  store(memory: Memory): Promise<void>;
  retrieve(query: MemoryQuery): Promise<Memory[]>;
  update(id: UUID, updates: Partial<Memory>): Promise<void>;
  delete(id: UUID): Promise<void>;
  clear(): Promise<void>;
}

export interface IVectorStore {
  add(id: UUID, embedding: number[], metadata?: Record<string, any>): Promise<void>;
  search(embedding: number[], topK?: number, filter?: any): Promise<Array<{ id: string; score: number }>>;
  delete(id: UUID): Promise<void>;
}

// ========================================
// 短期记忆存储 (内存实现)
// ========================================

export class ShortTermMemoryStore implements IMemoryStore {
  private memories: Map<UUID, Memory>;
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.memories = new Map();
    this.maxSize = maxSize;
  }

  async store(memory: Memory): Promise<void> {
    // LRU 淘汰
    if (this.memories.size >= this.maxSize) {
      const oldestKey = this.memories.keys().next().value;
      if (oldestKey) {
        this.memories.delete(oldestKey);
      }
    }
    this.memories.set(memory.id, memory);
  }

  async retrieve(query: MemoryQuery): Promise<Memory[]> {
    let results = Array.from(this.memories.values());

    if (query.tags) {
      results = results.filter((m) => query.tags!.some((t) => m.tags.includes(t)));
    }

    if (query.startTime) {
      results = results.filter((m) => m.createdAt >= query.startTime!);
    }

    if (query.endTime) {
      results = results.filter((m) => m.createdAt <= query.endTime!);
    }

    if (query.metadata) {
      results = results.filter((m) =>
        Object.entries(query.metadata!).every(
          ([key, value]) => m.metadata?.[key] === value
        )
      );
    }

    // 按重要性排序
    results.sort((a, b) => b.importance - a.importance);

    if (query.topK) {
      results = results.slice(0, query.topK);
    }

    return results;
  }

  async update(id: UUID, updates: Partial<Memory>): Promise<void> {
    const memory = this.memories.get(id);
    if (memory) {
      Object.assign(memory, updates, { updatedAt: Date.now() });
    }
  }

  async delete(id: UUID): Promise<void> {
    this.memories.delete(id);
  }

  async clear(): Promise<void> {
    this.memories.clear();
  }
}

// ========================================
// Redis 短期记忆存储
// ========================================

export class RedisMemoryStore implements IMemoryStore {
  private redis: any;
  private prefix: string;
  private ttl: number;

  constructor(redisClient: any, prefix: string = 'agent:memory:', ttl: number = 3600) {
    this.redis = redisClient;
    this.prefix = prefix;
    this.ttl = ttl;
  }

  async store(memory: Memory): Promise<void> {
    const key = `${this.prefix}${memory.id}`;
    await this.redis.setex(key, this.ttl, JSON.stringify(memory));
  }

  async retrieve(query: MemoryQuery): Promise<Memory[]> {
    // Redis 模式下，使用标签索引
    if (query.tags && query.tags.length > 0) {
      const keys: string[] = [];
      for (const tag of query.tags) {
        const tagKeys = await this.redis.smembers(`${this.prefix}tag:${tag}`);
        keys.push(...tagKeys);
      }
      
      const memories: Memory[] = [];
      for (const key of [...new Set(keys)]) {
        const data = await this.redis.get(key);
        if (data) {
          memories.push(JSON.parse(data));
        }
      }
      return memories;
    }

    // 扫描所有 key (性能较差，仅用于小规模数据)
    const keys = await this.redis.keys(`${this.prefix}*`);
    const memories: Memory[] = [];
    
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const memory: Memory = JSON.parse(data);
        
        // 应用过滤条件
        if (this.matchesQuery(memory, query)) {
          memories.push(memory);
        }
      }
    }

    return memories.slice(0, query.topK || memories.length);
  }

  private matchesQuery(memory: Memory, query: MemoryQuery): boolean {
    if (query.startTime && memory.createdAt < query.startTime) return false;
    if (query.endTime && memory.createdAt > query.endTime) return false;
    if (query.metadata) {
      for (const [key, value] of Object.entries(query.metadata)) {
        if (memory.metadata?.[key] !== value) return false;
      }
    }
    return true;
  }

  async update(id: UUID, updates: Partial<Memory>): Promise<void> {
    const key = `${this.prefix}${id}`;
    const data = await this.redis.get(key);
    if (data) {
      const memory: Memory = JSON.parse(data);
      Object.assign(memory, updates, { updatedAt: Date.now() });
      await this.redis.setex(key, this.ttl, JSON.stringify(memory));
    }
  }

  async delete(id: UUID): Promise<void> {
    const key = `${this.prefix}${id}`;
    await this.redis.del(key);
  }

  async clear(): Promise<void> {
    const keys = await this.redis.keys(`${this.prefix}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

// ========================================
// 向量存储适配器
// ========================================

export class ChromaVectorStore implements IVectorStore {
  private client: any;
  private collection: string;

  constructor(client: any, collection: string = 'agent_memories') {
    this.client = client;
    this.collection = collection;
  }

  async add(id: UUID, embedding: number[], metadata?: Record<string, any>): Promise<void> {
    const collection = await this.client.getOrCreateCollection({ name: this.collection });
    await collection.add({
      ids: [id],
      embeddings: [embedding],
      metadatas: metadata ? [metadata] : undefined,
    });
  }

  async search(embedding: number[], topK: number = 5, filter?: any): Promise<Array<{ id: string; score: number }>> {
    const collection = await this.client.getOrCreateCollection({ name: this.collection });
    const results = await collection.query({
      queryEmbeddings: [embedding],
      nResults: topK,
      where: filter,
    });

    return results.ids[0].map((id: string, index: number) => ({
      id,
      score: results.distances[0][index],
    }));
  }

  async delete(id: UUID): Promise<void> {
    const collection = await this.client.getOrCreateCollection({ name: this.collection });
    await collection.delete({ ids: [id] });
  }
}

// ========================================
// 记忆层核心类
// ========================================

export interface MemoryLayerConfig {
  shortTerm: {
    type: 'memory' | 'redis';
    maxSize?: number;
    redis?: any;
  };
  longTerm?: {
    enabled: boolean;
  };
  vector?: {
    enabled: boolean;
    store?: IVectorStore;
  };
  ontology?: {
    enabled: boolean;
    manager?: OntologyManager;
  };
}

/**
 * 检索结果
 */
export interface RetrievalResult {
  memories: Memory[];
  experiences: ExperienceMemory[];
  knowledges: KnowledgeMemory[];
  merged: Array<{
    type: 'memory' | 'experience' | 'knowledge';
    item: Memory | ExperienceMemory | KnowledgeMemory;
    relevance: number;
  }>;
}

export class MemoryLayer {
  private shortTermStore: IMemoryStore;
  private longTermStore?: IMemoryStore;
  private vectorStore?: IVectorStore;
  private embeddingGenerator?: (text: string) => Promise<number[]>;
  
  // 三级记忆管理器
  private workingMemoryManager: WorkingMemoryManager;
  private experienceManager: ExperienceMemoryManager;
  private knowledgeManager: KnowledgeMemoryManager;
  
  // 兼容旧版
  private sessions: Map<UUID, SessionMemory>;

  constructor(
    config: MemoryLayerConfig,
    embeddingGenerator?: (text: string) => Promise<number[]>
  ) {
    // 短期记忆存储
    if (config.shortTerm.type === 'redis' && config.shortTerm.redis) {
      this.shortTermStore = new RedisMemoryStore(config.shortTerm.redis);
    } else {
      this.shortTermStore = new ShortTermMemoryStore(config.shortTerm.maxSize);
    }

    // 向量存储
    if (config.vector?.enabled && config.vector.store) {
      this.vectorStore = config.vector.store;
      this.embeddingGenerator = embeddingGenerator;
    }
    
    // 初始化三级记忆管理器
    this.workingMemoryManager = new WorkingMemoryManager(config.shortTerm.maxSize);
    this.experienceManager = new ExperienceMemoryManager();
    this.knowledgeManager = new KnowledgeMemoryManager(config.ontology?.manager);
    
    // 兼容旧版
    this.sessions = new Map();
  }

  /**
   * 存储记忆
   */
  async store(
    content: string,
    type: MemoryType,
    options?: {
      importance?: number;
      tags?: string[];
      metadata?: Record<string, any>;
      sessionId?: UUID;
    }
  ): Promise<Memory> {
    const memory: Memory = {
      id: uuidv4(),
      type,
      content,
      importance: options?.importance ?? 0.5,
      tags: options?.tags || [],
      metadata: options?.metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now(),
    };

    // 存储到短期记忆
    await this.shortTermStore.store(memory);

    // 如果重要性高，存储到长期记忆
    if (type === MemoryType.LONG_TERM || memory.importance > 0.8) {
      await this.longTermStore?.store(memory);
    }

    // 生成并存储向量
    if (this.vectorStore && this.embeddingGenerator) {
      try {
        memory.embedding = await this.embeddingGenerator(content);
        await this.vectorStore.add(memory.id, memory.embedding, {
          type,
          tags: options?.tags,
          ...options?.metadata,
        });
      } catch (error) {
        logger.error('向量存储失败', { error, memoryId: memory.id });
      }
    }

    logger.debug('记忆存储完成', { memoryId: memory.id, type });
    return memory;
  }

  /**
   * 检索记忆
   */
  async retrieve(query: MemoryQuery): Promise<Memory[]> {
    const results = await this.shortTermStore.retrieve(query);

    // 更新访问统计
    for (const memory of results) {
      memory.accessCount++;
      memory.lastAccessed = Date.now();
    }

    return results;
  }

  /**
   * 语义检索
   */
  async semanticSearch(query: string, topK: number = 5): Promise<Memory[]> {
    if (!this.vectorStore || !this.embeddingGenerator) {
      throw new MemoryError('向量存储未启用');
    }

    const embedding = await this.embeddingGenerator(query);
    const results = await this.vectorStore.search(embedding, topK);

    const memories: Memory[] = [];
    for (const { id } of results) {
      const memResults = await this.shortTermStore.retrieve({ content: id });
      memories.push(...memResults);
    }

    return memories;
  }

  /**
   * 创建会话记忆
   */
  createSession(agentId: UUID, sessionId?: UUID): SessionMemory {
    const id = sessionId || uuidv4();
    const session: SessionMemory = {
      sessionId: id,
      agentId,
      taskStack: [],
      context: {},
      startTime: Date.now(),
      lastActive: Date.now(),
    };

    this.sessions.set(id, session);
    return session;
  }

  /**
   * 获取会话记忆
   */
  getSession(sessionId: UUID): SessionMemory | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 更新会话状态
   */
  updateSession(sessionId: UUID, updates: Partial<SessionMemory>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.assign(session, updates, { lastActive: Date.now() });
    }
  }

  /**
   * 添加任务到会话
   */
  pushTask(sessionId: UUID, task: SubTask): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.taskStack.push(task);
      session.lastActive = Date.now();
    }
  }

  /**
   * 获取当前任务
   */
  getCurrentTask(sessionId: UUID): SubTask | undefined {
    const session = this.sessions.get(sessionId);
    return session?.taskStack[session.taskStack.length - 1];
  }

  /**
   * 完成任务
   */
  completeCurrentTask(sessionId: UUID, output?: any): void {
    const session = this.sessions.get(sessionId);
    if (session && session.taskStack.length > 0) {
      const task = session.taskStack.pop()!;
      task.status = 'completed' as any;
      task.output = output;
      session.lastActive = Date.now();
    }
  }

  /**
   * 遗忘旧记忆
   */
  async forgetOldMemories(olderThan: Timestamp, importanceThreshold: number = 0.3): Promise<number> {
    const memories = await this.shortTermStore.retrieve({
      endTime: olderThan,
    });

    let deleted = 0;
    for (const memory of memories) {
      if (memory.importance < importanceThreshold) {
        await this.shortTermStore.delete(memory.id);
        deleted++;
      }
    }

    logger.info('遗忘旧记忆完成', { deleted, threshold: importanceThreshold });
    return deleted;
  }

  /**
   * 清理会话
   */
  clearSession(sessionId: UUID): void {
    this.sessions.delete(sessionId);
    this.workingMemoryManager.cleanup(sessionId);
  }

  // ========================================
  // 工作记忆(短期) 接口
  // ========================================

  /**
   * 创建工作记忆
   */
  createWorkingMemory(agentId: UUID, sessionId?: UUID): WorkingMemory {
    return this.workingMemoryManager.create(agentId, sessionId);
  }

  /**
   * 获取工作记忆
   */
  getWorkingMemory(sessionId: UUID): WorkingMemory | undefined {
    return this.workingMemoryManager.get(sessionId);
  }

  /**
   * 更新工作记忆上下文
   */
  updateWorkingContext(sessionId: UUID, key: string, value: any): void {
    this.workingMemoryManager.updateContext(sessionId, key, value);
  }

  /**
   * 存储临时结果
   */
  setTempResult(sessionId: UUID, key: string, value: any): void {
    this.workingMemoryManager.setTempResult(sessionId, key, value);
  }

  /**
   * 获取临时结果
   */
  getTempResult(sessionId: UUID, key: string): any {
    return this.workingMemoryManager.getTempResult(sessionId, key);
  }

  // ========================================
  // 经验记忆(长期) 接口
  // ========================================

  /**
   * 记录经验
   */
  recordExperience(
    taskType: string,
    pattern: string,
    solution: string,
    context: Record<string, any>
  ): ExperienceMemory {
    return this.experienceManager.recordExperience(taskType, pattern, solution, context);
  }

  /**
   * 查找相似经验
   */
  findSimilarExperiences(taskType: string, context: Record<string, any>): ExperienceMemory[] {
    return this.experienceManager.findSimilarExperiences(taskType, context);
  }

  /**
   * 更新经验成功率
   */
  updateExperienceSuccess(id: UUID, success: boolean): void {
    this.experienceManager.updateSuccessRate(id, success);
  }

  // ========================================
  // 知识记忆 接口
  // ========================================

  /**
   * 从本体论同步知识
   */
  async syncKnowledgeFromOntology(): Promise<number> {
    return this.knowledgeManager.syncFromOntology();
  }

  /**
   * 添加知识
   */
  async addKnowledge(knowledge: Omit<KnowledgeMemory, 'id' | 'createdAt' | 'updatedAt'>): Promise<KnowledgeMemory> {
    return this.knowledgeManager.addKnowledge(knowledge);
  }

  /**
   * 查询知识
   */
  queryKnowledge(conceptName?: string, conceptType?: string): KnowledgeMemory[] {
    return this.knowledgeManager.queryKnowledge(conceptName, conceptType);
  }

  /**
   * 通过关系查询知识
   */
  queryKnowledgeByRelation(relationType: string, targetConcept?: string): KnowledgeMemory[] {
    return this.knowledgeManager.queryByRelation(relationType, targetConcept);
  }

  // ========================================
  // 混合检索
  // ========================================

  /**
   * 混合检索 - 结合语义检索和关键词检索
   */
  async hybridSearch(query: string, options?: {
    topK?: number;
    includeMemories?: boolean;
    includeExperiences?: boolean;
    includeKnowledge?: boolean;
    filters?: {
      memoryTags?: string[];
      experienceTaskType?: string;
      knowledgeConceptType?: string;
    };
  }): Promise<RetrievalResult> {
    const {
      topK = 5,
      includeMemories = true,
      includeExperiences = true,
      includeKnowledge = true,
    } = options || {};

    const result: RetrievalResult = {
      memories: [],
      experiences: [],
      knowledges: [],
      merged: [],
    };

    // 1. 语义检索记忆
    if (includeMemories && this.vectorStore && this.embeddingGenerator) {
      try {
        const embedding = await this.embeddingGenerator(query);
        const semanticResults = await this.vectorStore.search(embedding, topK * 2);
        
        for (const { id, score } of semanticResults) {
          const memResults = await this.shortTermStore.retrieve({ content: id });
          for (const memory of memResults) {
            if (!result.memories.find(m => m.id === memory.id)) {
              result.memories.push(memory);
              result.merged.push({ type: 'memory', item: memory, relevance: score });
            }
          }
        }
      } catch (error) {
        logger.error('语义检索失败', { error });
      }
    }

    // 2. 关键词检索记忆
    if (includeMemories) {
      const keywordResults = await this.shortTermStore.retrieve({
        content: query,
        tags: options?.filters?.memoryTags,
        topK: topK * 2,
      });
      
      for (const memory of keywordResults) {
        if (!result.memories.find(m => m.id === memory.id)) {
          result.memories.push(memory);
          result.merged.push({ type: 'memory', item: memory, relevance: 0.7 });
        }
      }
    }

    // 3. 经验检索
    if (includeExperiences && options?.filters?.experienceTaskType) {
      const experiences = this.experienceManager.findSimilarExperiences(
        options.filters.experienceTaskType,
        { query }
      );
      result.experiences = experiences.slice(0, topK);
      for (const exp of result.experiences) {
        result.merged.push({ type: 'experience', item: exp, relevance: exp.successRate });
      }
    }

    // 4. 知识检索
    if (includeKnowledge) {
      const knowledges = this.knowledgeManager.queryKnowledge(
        undefined,
        options?.filters?.knowledgeConceptType
      );
      // 简单匹查查询词
      result.knowledges = knowledges
        .filter(k => k.conceptName.toLowerCase().includes(query.toLowerCase()))
        .slice(0, topK);
      for (const knowledge of result.knowledges) {
        result.merged.push({ type: 'knowledge', item: knowledge, relevance: knowledge.confidence });
      }
    }

    // 合并结果按相关性排序
    result.merged.sort((a, b) => b.relevance - a.relevance);
    result.merged = result.merged.slice(0, topK * 2);

    return result;
  }

  // ========================================
  // 记忆管理
  // ========================================

  /**
   * 更新记忆
   */
  async updateMemory(id: UUID, updates: Partial<Memory>): Promise<void> {
    await this.shortTermStore.update(id, updates);
    logger.debug('记忆更新', { id, updates });
  }

  /**
   * 删除记忆
   */
  async deleteMemory(id: UUID): Promise<void> {
    await this.shortTermStore.delete(id);
    if (this.vectorStore) {
      await this.vectorStore.delete(id);
    }
    logger.debug('记忆删除', { id });
  }

  /**
   * 批量遗忘
   */
  async batchForget(olderThan: Timestamp, options?: {
    importanceThreshold?: number;
    excludeTags?: string[];
  }): Promise<number> {
    const memories = await this.shortTermStore.retrieve({
      endTime: olderThan,
    });

    let deleted = 0;
    for (const memory of memories) {
      // 检查重要性阈值
      if (options?.importanceThreshold && memory.importance >= options.importanceThreshold) {
        continue;
      }
      // 检查排除标签
      if (options?.excludeTags && memory.tags.some(t => options.excludeTags!.includes(t))) {
        continue;
      }
      
      await this.shortTermStore.delete(memory.id);
      deleted++;
    }

    // 同时清理低成功率经验
    this.experienceManager.forgetLowSuccessExperiences();

    logger.info('批量遗忘完成', { deleted });
    return deleted;
  }

  /**
   * 获取记忆统计
   */
  getMemoryStats(): {
    workingMemories: number;
    experiences: number;
    knowledges: number;
    shortTerm: number;
  } {
    return {
      workingMemories: 0, // 实时获取需要暴露接口
      experiences: 0,
      knowledges: 0,
      shortTerm: 0,
    };
  }
}

export default MemoryLayer;
