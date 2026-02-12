/**
 * 认知决策层 (Cognition Layer)
 * 实现「本体论+LLM」的决策核心
 * 
 * 核心功能:
 * - 目标分解与任务规划 (通用语义规划)
 * - 推理与决策 (ReAct + Ontology-enhanced)
 * - 工具选择与参数填充
 * - 动态重规划与不确定性处理
 * 
 * 设计原则:
 * - 只提供通用认知能力，不包含场景特定逻辑
 * - 场景特定逻辑应在 Agent 层实现
 */

import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../utils/logger';
import {
  ParsedIntent,
  UUID,
  TaskStatus,
  TaskPriority,
  CognitionConfig,
  OntologyConcept,
} from '../../types';
import { OntologyLayer } from '../ontologies';
import { WorkingMemory } from '../memory';

const logger = createLogger('CognitionLayer');

/**
 * LLM 服务接口
 */
export interface ILLMService {
  complete(prompt: string, options?: any): Promise<string>;
}

/**
 * 执行计划
 */
export interface ExecutionPlan {
  id: UUID;
  goal: string;
  subtasks: SubTask[];
  parallelGroups: UUID[][];
  createdAt: number;
  updatedAt: number;
  status: TaskStatus;
  metadata?: Record<string, any>;
  uncertainty?: PlanUncertainty;
}

/**
 * 子任务
 */
export interface SubTask {
  id: UUID;
  name: string;
  description: string;
  dependencies: UUID[];
  status: TaskStatus;
  priority: TaskPriority;
  tools?: string[];
  retryCount: number;
  maxRetries: number;
  metadata?: Record<string, any>;
  uncertainty?: TaskUncertainty;
}

/**
 * 任务不确定性
 */
export interface TaskUncertainty {
  confidence: number;
  ambiguityFactors: string[];
  alternativeInterpretations: string[];
}

/**
 * 计划不确定性
 */
export interface PlanUncertainty {
  overallConfidence: number;
  riskFactors: string[];
  contingencyPlans: string[];
}

/**
 * 推理步骤
 */
export interface ReasoningStep {
  step: number;
  thought: string;
  action?: string;
  observation?: string;
  confidence?: number;
}

/**
 * 推理链
 */
export interface ReasoningChain {
  id: UUID;
  goal: string;
  steps: ReasoningStep[];
  conclusion: string;
  confidence: number;
  ontologyConcepts?: OntologyConcept[];
}

/**
 * 决策结果
 */
export interface Decision {
  id: UUID;
  type: 'tool_selection' | 'error_recovery' | 'semantic_choice' | 'uncertainty_resolution';
  reasoning: string;
  confidence: number;
  selectedOption: string;
  alternatives: string[];
  timestamp: number;
  ontologySupport?: OntologySupport;
}

/**
 * 本体论支持
 */
export interface OntologySupport {
  relevantConcepts: OntologyConcept[];
  semanticScore: number;
  inferredRelations: string[];
}

/**
 * 规划策略
 */
export enum PlanningStrategy {
  SEQUENTIAL = 'sequential',
  PARALLEL = 'parallel',
  ADAPTIVE = 'adaptive',
  SEMANTIC = 'semantic',
}

/**
 * 环境变化事件
 */
export interface EnvironmentChange {
  type: 'resource_available' | 'resource_unavailable' | 'state_change' | 'constraint_violation';
  source: string;
  timestamp: number;
  details: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * 依赖构建器接口 - 允许Agent自定义依赖逻辑
 */
export interface DependencyBuilder {
  buildDependencies(subtasks: SubTask[], context?: Record<string, any>): void;
}

/**
 * 认知错误
 */
export class CognitionError extends Error {
  constructor(message: string, public context?: Record<string, any>) {
    super(message);
    this.name = 'CognitionError';
  }
}

/**
 * 多假设追踪器 - 处理不确定性
 */
export class HypothesisTracker {
  private hypotheses: Map<UUID, {
    description: string;
    confidence: number;
    evidence: string[];
    contradictions: string[];
  }> = new Map();

  addHypothesis(description: string, initialConfidence: number, evidence: string[] = []): UUID {
    const id = uuidv4();
    this.hypotheses.set(id, {
      description,
      confidence: initialConfidence,
      evidence,
      contradictions: [],
    });
    return id;
  }

  updateConfidence(id: UUID, newConfidence: number): void {
    const h = this.hypotheses.get(id);
    if (h) h.confidence = Math.max(0, Math.min(1, newConfidence));
  }

  addEvidence(id: UUID, evidence: string): void {
    const h = this.hypotheses.get(id);
    if (h) h.evidence.push(evidence);
  }

  addContradiction(id: UUID, contradiction: string): void {
    const h = this.hypotheses.get(id);
    if (h) {
      h.contradictions.push(contradiction);
      h.confidence *= 0.8;
    }
  }

  getBestHypothesis(): { id: UUID; description: string; confidence: number } | null {
    let best = null;
    for (const [id, h] of this.hypotheses) {
      if (!best || h.confidence > best.confidence) {
        best = { id, ...h };
      }
    }
    return best;
  }

  getAllHypotheses(): Array<{ id: UUID; description: string; confidence: number }> {
    return Array.from(this.hypotheses.entries())
      .map(([id, h]) => ({ id, ...h }))
      .sort((a, b) => b.confidence - a.confidence);
  }
}

/**
 * ReAct 推理器
 */
export class ReActReasoner {
  private llm: ILLMService;

  constructor(llm: ILLMService) {
    this.llm = llm;
  }

  async reason(
    goal: string,
    context: Record<string, any>,
    tools: string[],
    ontologyLayer?: OntologyLayer
  ): Promise<ReasoningChain> {
    logger.info('开始 ReAct 推理', { goal });

    let ontologyConcepts: OntologyConcept[] = [];
    if (ontologyLayer) {
      const support = ontologyLayer.semanticDecisionSupport(goal, context);
      ontologyConcepts = support.relevantConcepts;
      logger.debug('本体论语义支持', { 
        conceptCount: ontologyConcepts.length,
        confidence: support.confidence 
      });
    }

    const prompt = `
Goal: ${goal}
Context: ${JSON.stringify(context)}
${ontologyConcepts.length > 0 ? `
Relevant Ontology Concepts: ${JSON.stringify(ontologyConcepts.map(c => ({ name: c.name, type: c.type })))}` : ''}

You have access to these tools: ${tools.join(', ')}

Think step by step. For each step, provide:
1. Thought: your reasoning
2. Action: what action to take (if any)
3. Observation: what you observe (if any)

Also provide an overall confidence score (0-1) for your conclusion.

Reply in JSON format:
{
  "steps": [
    {"step": 1, "thought": "...", "action": "...", "observation": "...", "confidence": 0.9}
  ],
  "conclusion": "final answer",
  "confidence": 0.95
}`;

    const response = await this.llm.complete(prompt);
    const result = JSON.parse(this.extractJson(response));

    return {
      id: uuidv4(),
      goal,
      steps: result.steps,
      conclusion: result.conclusion,
      confidence: result.confidence || 0.8,
      ontologyConcepts,
    };
  }

  private extractJson(text: string): string {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ||
                      text.match(/```\s*([\s\S]*?)```/) ||
                      text.match(/(\{[\s\S]*\})/);
    
    if (jsonMatch) {
      return jsonMatch[1].trim();
    }
    return text.trim();
  }
}

/**
 * 通用语义任务规划器
 * 
 * 注意: 这是一个通用规划器，不处理场景特定的依赖逻辑。
 * 如果需要自定义依赖构建，请提供 DependencyBuilder。
 */
export class SemanticTaskPlanner {
  private llm: ILLMService;
  private config: CognitionConfig;
  private ontologyLayer?: OntologyLayer;

  constructor(
    llm: ILLMService, 
    config: CognitionConfig,
    ontologyLayer?: OntologyLayer
  ) {
    this.llm = llm;
    this.config = config;
    this.ontologyLayer = ontologyLayer;
  }

  /**
   * 创建语义增强的执行计划
   * 
   * @param intent - 解析后的意图
   * @param context - 上下文信息
   * @param dependencyBuilder - 可选的依赖构建器（用于场景特定的依赖逻辑）
   */
  async createPlan(
    intent: ParsedIntent,
    context?: Record<string, any>,
    dependencyBuilder?: DependencyBuilder
  ): Promise<ExecutionPlan> {
    logger.info('创建语义增强执行计划', { intent: intent.action });

    let semanticSupport: {
      relevantConcepts: OntologyConcept[];
      suggestedActions: string[];
      confidence: number;
    } = { relevantConcepts: [], suggestedActions: [], confidence: 0 };
    
    if (this.ontologyLayer) {
      semanticSupport = this.ontologyLayer.semanticDecisionSupport(
        intent.action,
        { ...intent.parameters, ...context }
      );
    }

    const uncertainty = await this.assessUncertainty(intent, semanticSupport);

    const prompt = `
Create an execution plan for: ${intent.action}
Parameters: ${JSON.stringify(intent.parameters)}
Context: ${JSON.stringify(context)}
${semanticSupport.relevantConcepts.length > 0 ? `
Semantic Guidance: ${JSON.stringify(semanticSupport.suggestedActions)}` : ''}

Consider these uncertainty factors: ${uncertainty.ambiguityFactors.join(', ') || 'none'}

Generate subtasks as JSON array. Each task needs:
- name: task name
- description: detailed description
- priority: low|medium|high|critical
- tools: array of required tools
- estimatedComplexity: 1-10

Reply in JSON format:
{
  "goal": "clarified goal",
  "subtasks": [
    {
      "name": "task name",
      "description": "what to do",
      "priority": "high",
      "tools": ["tool1"],
      "estimatedComplexity": 5
    }
  ],
  "riskFactors": ["risk1"],
  "contingencyPlans": ["plan1"]
}`;

    const response = await this.llm.complete(prompt);
    const result = JSON.parse(this.extractJson(response));

    const subtasks: SubTask[] = result.subtasks.map((t: any) => ({
      id: uuidv4(),
      name: t.name,
      description: t.description,
      dependencies: [],
      status: TaskStatus.PENDING,
      priority: (t.priority as TaskPriority) || this.config.defaultPriority,
      tools: t.tools || [],
      retryCount: 0,
      maxRetries: this.config.maxRetries,
      metadata: { estimatedComplexity: t.estimatedComplexity },
      uncertainty: {
        confidence: uncertainty.confidence,
        ambiguityFactors: uncertainty.ambiguityFactors,
        alternativeInterpretations: uncertainty.alternativeInterpretations,
      },
    }));

    // 如果提供了依赖构建器，使用它构建依赖
    if (dependencyBuilder) {
      dependencyBuilder.buildDependencies(subtasks, { 
        intent, 
        semanticConcepts: semanticSupport.relevantConcepts,
        ...context 
      });
    }

    const parallelGroups = this.buildParallelGroups(subtasks);

    const planId = uuidv4();
    const plan: ExecutionPlan = {
      id: planId,
      goal: result.goal,
      subtasks,
      parallelGroups,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: TaskStatus.PENDING,
      metadata: {
        semanticSupport,
        planningStrategy: PlanningStrategy.SEMANTIC,
      },
      uncertainty: {
        overallConfidence: uncertainty.confidence,
        riskFactors: result.riskFactors || uncertainty.ambiguityFactors,
        contingencyPlans: result.contingencyPlans || [],
      },
    };

    logger.info('语义增强执行计划创建完成', {
      planId,
      subtaskCount: subtasks.length,
      parallelGroups: parallelGroups.length,
      confidence: uncertainty.confidence,
    });

    return plan;
  }

  /**
   * 评估不确定性
   */
  private async assessUncertainty(
    intent: ParsedIntent,
    semanticSupport: { confidence: number; relevantConcepts: OntologyConcept[] }
  ): Promise<TaskUncertainty> {
    const ambiguityFactors: string[] = [];
    const alternativeInterpretations: string[] = [];

    if (semanticSupport.confidence < 0.5) {
      ambiguityFactors.push('Low semantic match with ontology');
      alternativeInterpretations.push('Intent may be misclassified');
    }

    if (!intent.parameters || Object.keys(intent.parameters).length === 0) {
      ambiguityFactors.push('Missing parameters');
      alternativeInterpretations.push('Intent scope unclear');
    }

    const confidence = Math.max(0.3, semanticSupport.confidence * 0.7 + 0.3);

    return {
      confidence,
      ambiguityFactors,
      alternativeInterpretations,
    };
  }

  /**
   * 构建并行执行组
   */
  private buildParallelGroups(subtasks: SubTask[]): UUID[][] {
    const completed = new Set<UUID>();
    const groups: UUID[][] = [];

    while (completed.size < subtasks.length) {
      const group: UUID[] = [];

      for (const task of subtasks) {
        if (completed.has(task.id)) continue;

        const depsSatisfied = task.dependencies.every((depId) => completed.has(depId));

        if (depsSatisfied) {
          group.push(task.id);
        }
      }

      if (group.length === 0) {
        logger.warn('检测到循环依赖');
        break;
      }

      groups.push(group);
      group.forEach((id) => completed.add(id));
    }

    return groups;
  }

  /**
   * 环境感知动态调整计划
   */
  async adjustPlanForEnvironmentChange(
    plan: ExecutionPlan,
    change: EnvironmentChange,
    workingMemory?: WorkingMemory
  ): Promise<ExecutionPlan> {
    logger.info('基于环境变化调整计划', { 
      planId: plan.id, 
      changeType: change.type,
      severity: change.severity 
    });

    if (change.severity === 'critical') {
      return this.replanFromScratch(plan, change, workingMemory);
    }

    if (change.type === 'resource_unavailable') {
      const affectedTasks = plan.subtasks.filter(t => 
        t.tools?.some(tool => change.source.includes(tool))
      );

      for (const task of affectedTasks) {
        if (!task.uncertainty) {
          task.uncertainty = {
            confidence: 0.5,
            ambiguityFactors: [],
            alternativeInterpretations: [],
          };
        }
        task.uncertainty.confidence *= 0.7;
        task.uncertainty.ambiguityFactors.push(`Resource unavailable: ${change.source}`);
        task.status = TaskStatus.PENDING;
        task.maxRetries = Math.max(task.maxRetries, 3);
      }
    }

    if (change.type === 'state_change' && workingMemory) {
      workingMemory.tempResults.set('environmentChange', change);
      
      for (const task of plan.subtasks) {
        if (task.status === TaskStatus.PENDING) {
          const shouldReevaluate = await this.shouldReevaluateTask(task, change);
          if (shouldReevaluate) {
            task.priority = TaskPriority.HIGH;
          }
        }
      }
    }

    plan.updatedAt = Date.now();
    plan.parallelGroups = this.buildParallelGroups(plan.subtasks);

    return plan;
  }

  private async shouldReevaluateTask(
    task: SubTask, 
    change: EnvironmentChange
  ): Promise<boolean> {
    const taskText = `${task.name} ${task.description}`.toLowerCase();
    const changeText = JSON.stringify(change).toLowerCase();
    const keywords = changeText.split(/\s+/);
    return keywords.some(kw => taskText.includes(kw) && kw.length > 3);
  }

  private async replanFromScratch(
    oldPlan: ExecutionPlan,
    change: EnvironmentChange,
    workingMemory?: WorkingMemory
  ): Promise<ExecutionPlan> {
    logger.info('触发完全重新规划', { planId: oldPlan.id });

    if (workingMemory) {
      workingMemory.tempResults.set('replanHistory', {
        originalPlan: oldPlan.id,
        change,
        timestamp: Date.now(),
      });
    }

    const newIntent: ParsedIntent = {
      action: oldPlan.goal,
      confidence: 0.7,
      parameters: {
        ...oldPlan.metadata,
        replanned: true,
        reason: change.type,
      },
    };

    return this.createPlan(newIntent, { environmentChange: change });
  }

  private extractJson(text: string): string {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ||
                      text.match(/```\s*([\s\S]*?)```/) ||
                      text.match(/(\[[\s\S]*\])/);
    
    if (jsonMatch) {
      return jsonMatch[1].trim();
    }
    return text.trim();
  }
}

/**
 * 语义决策引擎
 */
export class SemanticDecisionEngine {
  private llm: ILLMService;
  private ontologyLayer?: OntologyLayer;

  constructor(llm: ILLMService, ontologyLayer?: OntologyLayer) {
    this.llm = llm;
    this.ontologyLayer = ontologyLayer;
  }

  async selectTool(
    taskDescription: string,
    availableTools: Array<{ 
      name: string; 
      description: string; 
      category?: string;
      parameters?: Record<string, any>;
    }>,
    context?: Record<string, any>
  ): Promise<Decision> {
    logger.info('语义工具选择', { taskDescription });

    let ontologySupport: OntologySupport | undefined;
    if (this.ontologyLayer) {
      const semanticResult = this.ontologyLayer.semanticDecisionSupport(taskDescription, context || {});
      ontologySupport = {
        relevantConcepts: semanticResult.relevantConcepts,
        semanticScore: semanticResult.confidence,
        inferredRelations: semanticResult.suggestedActions,
      };
    }

    const prompt = `
Task: ${taskDescription}
${ontologySupport ? `
Relevant Ontology Concepts: ${JSON.stringify(ontologySupport.relevantConcepts.map(c => c.name))}` : ''}

Available Tools:
${availableTools.map((t) => `- ${t.name}: ${t.description}${t.category ? ` [${t.category}]` : ''}`).join('\n')}

${ontologySupport?.inferredRelations.length ? `Semantic Guidance: ${ontologySupport.inferredRelations.join(', ')}` : ''}

Select the best tool considering semantic relevance and capabilities.

Reply in JSON format:
{
  "selectedTool": "tool_name",
  "reasoning": "detailed explanation",
  "confidence": 0.95,
  "alternatives": ["other_tool1", "other_tool2"],
  "uncertaintyFactors": ["factor1"]
}`;

    const response = await this.llm.complete(prompt);
    const result = JSON.parse(this.extractJson(response));

    return {
      id: uuidv4(),
      type: 'tool_selection',
      reasoning: result.reasoning,
      confidence: result.confidence,
      selectedOption: result.selectedTool,
      alternatives: result.alternatives || [],
      timestamp: Date.now(),
      ontologySupport,
    };
  }

  async decideRecovery(
    error: Error,
    context: Record<string, any>,
    attemptHistory?: string[]
  ): Promise<Decision> {
    const prompt = `
Error: ${error.message}
Context: ${JSON.stringify(context)}
${attemptHistory ? `
Previous Attempts: ${attemptHistory.join(', ')}` : ''}

Choose recovery action: retry | alternative | escalate | skip | replan

Reply in JSON format:
{
  "action": "retry|alternative|escalate|skip|replan",
  "reasoning": "why this action",
  "confidence": 0.9,
  "uncertaintyFactors": ["uncertainty1"],
  "riskAssessment": "low|medium|high"
}`;

    const response = await this.llm.complete(prompt);
    const result = JSON.parse(this.extractJson(response));

    return {
      id: uuidv4(),
      type: 'error_recovery',
      reasoning: result.reasoning,
      confidence: result.confidence,
      selectedOption: result.action,
      alternatives: ['retry', 'alternative', 'escalate', 'skip', 'replan'].filter(
        (a) => a !== result.action
      ),
      timestamp: Date.now(),
    };
  }

  async resolveUncertainty(
    hypotheses: Array<{ description: string; confidence: number }>,
    context: Record<string, any>
  ): Promise<Decision> {
    const prompt = `
Multiple hypotheses to resolve:
${hypotheses.map((h, i) => `${i + 1}. ${h.description} (confidence: ${h.confidence})`).join('\n')}

Context: ${JSON.stringify(context)}

Select the most likely hypothesis or suggest information gathering.

Reply in JSON format:
{
  "selectedHypothesis": 1,
  "reasoning": "why this one",
  "confidence": 0.85,
  "informationNeeds": ["what else to know"],
  "suggestedAction": "how to verify"
}`;

    const response = await this.llm.complete(prompt);
    const result = JSON.parse(this.extractJson(response));

    const selectedIdx = (result.selectedHypothesis || 1) - 1;
    const selected = hypotheses[selectedIdx];

    return {
      id: uuidv4(),
      type: 'uncertainty_resolution',
      reasoning: result.reasoning,
      confidence: result.confidence,
      selectedOption: selected?.description || 'unknown',
      alternatives: hypotheses.filter((_, i) => i !== selectedIdx).map(h => h.description),
      timestamp: Date.now(),
    };
  }

  private extractJson(text: string): string {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ||
                      text.match(/```\s*([\s\S]*?)```/) ||
                      text.match(/(\{[\s\S]*\})/);
    
    if (jsonMatch) {
      return jsonMatch[1].trim();
    }
    return text.trim();
  }
}

/**
 * 认知层核心类
 */
export class CognitionLayer {
  private llm: ILLMService;
  private planner: SemanticTaskPlanner;
  private reasoner: ReActReasoner;
  private decisionEngine: SemanticDecisionEngine;
  private config: CognitionConfig;
  private ontologyLayer?: OntologyLayer;
  private hypothesisTracker: HypothesisTracker;
  private workingMemory?: WorkingMemory;

  constructor(
    llm: ILLMService, 
    config?: Partial<CognitionConfig>,
    ontologyLayer?: OntologyLayer
  ) {
    this.llm = llm;
    this.ontologyLayer = ontologyLayer;
    this.config = {
      maxSubtasks: 10,
      defaultPriority: TaskPriority.MEDIUM,
      maxRetries: 3,
      planningStrategy: PlanningStrategy.SEMANTIC,
      enableDynamicPlanning: true,
      ...config,
    };

    this.planner = new SemanticTaskPlanner(llm, this.config, ontologyLayer);
    this.reasoner = new ReActReasoner(llm);
    this.decisionEngine = new SemanticDecisionEngine(llm, ontologyLayer);
    this.hypothesisTracker = new HypothesisTracker();
  }

  setWorkingMemory(workingMemory: WorkingMemory): void {
    this.workingMemory = workingMemory;
  }

  /**
   * 创建语义增强执行计划
   * 
   * @param intent - 解析后的意图
   * @param context - 上下文
   * @param dependencyBuilder - 可选的依赖构建器，用于场景特定的依赖逻辑
   */
  async plan(
    intent: ParsedIntent, 
    context?: Record<string, any>,
    dependencyBuilder?: DependencyBuilder
  ): Promise<ExecutionPlan> {
    return this.planner.createPlan(intent, context, dependencyBuilder);
  }

  /**
   * 推理（本体论增强）
   */
  async reason(
    goal: string,
    context: Record<string, any>,
    tools: string[]
  ): Promise<ReasoningChain> {
    return this.reasoner.reason(goal, context, tools, this.ontologyLayer);
  }

  /**
   * 语义工具选择
   */
  async selectTool(
    taskDescription: string,
    availableTools: Array<{ 
      name: string; 
      description: string; 
      category?: string;
    }>,
    context?: Record<string, any>
  ): Promise<Decision> {
    return this.decisionEngine.selectTool(taskDescription, availableTools, context);
  }

  /**
   * 错误恢复决策
   */
  async decideRecovery(error: Error, context: Record<string, any>): Promise<Decision> {
    return this.decisionEngine.decideRecovery(error, context);
  }

  /**
   * 环境感知重规划
   */
  async replanForEnvironmentChange(
    plan: ExecutionPlan,
    change: EnvironmentChange
  ): Promise<ExecutionPlan> {
    return this.planner.adjustPlanForEnvironmentChange(plan, change, this.workingMemory);
  }

  /**
   * 任务失败重规划
   */
  async replan(
    plan: ExecutionPlan,
    failedTaskId: UUID,
    error: Error
  ): Promise<ExecutionPlan> {
    if (!this.config.enableDynamicPlanning) {
      throw new CognitionError('动态规划未启用');
    }

    logger.info('任务失败重规划', { planId: plan.id, failedTaskId, error: error.message });

    const failedTask = plan.subtasks.find((t) => t.id === failedTaskId);
    if (!failedTask) {
      throw new CognitionError('未找到失败任务');
    }

    const recoveryDecision = await this.decisionEngine.decideRecovery(error, {
      task: failedTask,
      planId: plan.id,
    });

    switch (recoveryDecision.selectedOption) {
      case 'retry':
        if (failedTask.retryCount < failedTask.maxRetries) {
          failedTask.retryCount++;
          failedTask.status = TaskStatus.RETRYING;
        }
        break;

      case 'alternative':
        const alternativeTask: SubTask = {
          id: uuidv4(),
          name: `${failedTask.name} (Alternative)`,
          description: `替代方案: ${failedTask.description}`,
          dependencies: failedTask.dependencies,
          status: TaskStatus.PENDING,
          priority: failedTask.priority,
          tools: [...(failedTask.tools || []), 'fallback_handler'],
          retryCount: 0,
          maxRetries: 2,
        };
        plan.subtasks.push(alternativeTask);
        
        plan.subtasks.forEach((task) => {
          if (task.dependencies.includes(failedTaskId)) {
            task.dependencies = task.dependencies.map((id) =>
              id === failedTaskId ? alternativeTask.id : id
            );
          }
        });
        break;

      case 'replan':
        const change: EnvironmentChange = {
          type: 'resource_unavailable',
          source: failedTask.tools?.[0] || 'unknown',
          timestamp: Date.now(),
          details: { error: error.message },
          severity: 'high',
        };
        return this.planner.adjustPlanForEnvironmentChange(plan, change, this.workingMemory);

      case 'escalate':
        throw new CognitionError('任务失败需要人工介入', { 
          taskId: failedTaskId, 
          error: error.message 
        });
    }

    plan.updatedAt = Date.now();
    plan.parallelGroups = this.buildParallelGroups(plan.subtasks);

    return plan;
  }

  /**
   * 不确定性决策
   */
  async resolveUncertainty(
    hypotheses: Array<{ description: string; confidence: number }>,
    context?: Record<string, any>
  ): Promise<Decision> {
    return this.decisionEngine.resolveUncertainty(hypotheses, context || {});
  }

  getBestHypothesis(): { id: UUID; description: string; confidence: number } | null {
    return this.hypothesisTracker.getBestHypothesis();
  }

  getAllHypotheses(): Array<{ id: UUID; description: string; confidence: number }> {
    return this.hypothesisTracker.getAllHypotheses();
  }

  addHypothesis(description: string, initialConfidence: number, evidence?: string[]): UUID {
    return this.hypothesisTracker.addHypothesis(description, initialConfidence, evidence);
  }

  getSemanticDecisionSupport(
    intent: string,
    context: Record<string, any>
  ): {
    relevantConcepts: OntologyConcept[];
    suggestedActions: string[];
    confidence: number;
  } | null {
    if (!this.ontologyLayer) return null;
    return this.ontologyLayer.semanticDecisionSupport(intent, context);
  }

  private buildParallelGroups(subtasks: SubTask[]): UUID[][] {
    const completed = new Set<UUID>();
    const groups: UUID[][] = [];

    while (completed.size < subtasks.length) {
      const group: UUID[] = [];

      for (const task of subtasks) {
        if (completed.has(task.id)) continue;

        const depsSatisfied = task.dependencies.every((depId) => completed.has(depId));

        if (depsSatisfied) {
          group.push(task.id);
        }
      }

      if (group.length === 0) {
        logger.warn('检测到循环依赖');
        break;
      }

      groups.push(group);
      group.forEach((id) => completed.add(id));
    }

    return groups;
  }
}

export default CognitionLayer;
