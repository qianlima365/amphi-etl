/**
 * 反馈优化层 (Feedback Layer)
 * Agent 的"学习能力" - 从执行结果中持续进化
 * 
 * 核心功能:
 * - 结果评估: 多维度指标评估任务执行效果（支持人工+自动评估）
 * - 经验提炼: 将成功策略提炼为经验规则，存入长期记忆
 * - 错误复盘: 深度分析失败原因，制定规避方案
 * - 模型微调: 收集训练数据，支持模型持续优化
 * 
 * 关键特性:
 * - 持续进化能力：Agent 随着执行不断改进
 * - 归因分析：精准定位问题根因
 * - 知识沉淀：成功经验可复用
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../utils/logger';
import {
  ExecutionEvaluation,
  ExperienceRule,
  FineTuningData,
  ExecutionPlan,
  SubTask,
  UUID,
  TaskStatus,
} from '../../types';
import { TaskExecutionResult } from '../execution';
import { MemoryLayer } from '../memory';

const logger = createLogger('FeedbackLayer');

// ========================================
// 类型定义扩展
// ========================================

/** 评估维度 */
export enum EvaluationDimension {
  COMPLETION = 'completion',       // 完成度
  ACCURACY = 'accuracy',           // 准确性
  EFFICIENCY = 'efficiency',       // 效率
  RELIABILITY = 'reliability',     // 可靠性
  RESOURCE_USAGE = 'resource_usage', // 资源使用
  USER_SATISFACTION = 'user_satisfaction', // 用户满意度
}

/** 多维度评估指标 */
export interface MultiDimensionMetrics {
  completion: {
    rate: number;           // 任务完成率
    failedTasks: number;    // 失败任务数
    retriedTasks: number;   // 重试任务数
  };
  accuracy: {
    overall: number;        // 整体准确性
    validationResults: Array<{
      taskId: UUID;
      passed: boolean;
      score: number;
    }>;
  };
  efficiency: {
    totalDuration: number;  // 总耗时
    avgTaskDuration: number; // 平均任务耗时
    parallelismEfficiency: number; // 并行效率
    timeDeviation: number;  // 与预期时间偏差
  };
  reliability: {
    stabilityScore: number; // 稳定性分数
    errorRate: number;      // 错误率
    recoverySuccessRate: number; // 恢复成功率
  };
  resourceUsage: {
    cpuUtilization: number; // CPU利用率
    memoryUtilization: number; // 内存利用率
    ioEfficiency: number;   // IO效率
    costEfficiency: number; // 成本效率
  };
}

/** 综合评估结果 */
export interface ComprehensiveEvaluation extends ExecutionEvaluation {
  multiDimensionMetrics: MultiDimensionMetrics;
  qualityScore: number;      // 综合质量分数 (0-100)
  improvementSuggestions: string[];
  comparableHistory?: {
    avgScore: number;
    bestScore: number;
    trend: 'improving' | 'stable' | 'declining';
  };
}

/** 错误归因类型 */
export enum ErrorCategory {
  PLANNING_ERROR = 'planning_error',       // 规划错误
  TOOL_ERROR = 'tool_error',               // 工具调用错误
  EXECUTION_ERROR = 'execution_error',     // 执行错误
  ENVIRONMENT_ERROR = 'environment_error', // 环境问题
  RESOURCE_ERROR = 'resource_error',       // 资源问题
  TIMEOUT_ERROR = 'timeout_error',         // 超时错误
  DATA_ERROR = 'data_error',               // 数据问题
  UNKNOWN_ERROR = 'unknown_error',         // 未知错误
}

/** 错误根因分析 */
export interface ErrorRootCause {
  errorId: UUID;
  category: ErrorCategory;
  taskId: UUID;
  errorMessage: string;
  rootCause: string;
  contributingFactors: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  isRecoverable: boolean;
  preventionStrategy: string;
  similarErrors: number;  // 历史相似错误次数
}

/** 复盘报告 */
export interface PostMortemReport {
  id: UUID;
  planId: UUID;
  timestamp: number;
  summary: string;
  successFactors: string[];
  failureAnalysis: ErrorRootCause[];
  lessonsLearned: string[];
  actionItems: Array<{
    description: string;
    priority: 'high' | 'medium' | 'low';
    owner?: string;
    dueDate?: number;
  }>;
  knowledgeGained: ExperienceRule[];
}

/** 评估配置 */
export interface FeedbackConfig {
  enableAutoEvaluation: boolean;
  enableExperienceExtraction: boolean;
  enableErrorAnalysis: boolean;
  enableFineTuning: boolean;
  enableHumanFeedback: boolean;
  minSamplesForFineTuning: number;
  evaluationWeights: {
    completion: number;
    accuracy: number;
    efficiency: number;
    reliability: number;
    resourceUsage: number;
  };
  thresholds: {
    completionRate: number;
    accuracyScore: number;
    efficiencyScore: number;
    qualityScore: number;
  };
}

/** 人工反馈 */
export interface HumanFeedback {
  evaluationId: UUID;
  rater: string;
  overallRating: number;  // 1-5
  dimensionRatings: Record<EvaluationDimension, number>;
  comments: string;
  suggestedImprovements: string[];
  timestamp: number;
}

// ========================================
// 结果评估器（增强版）
// ========================================

export class ResultEvaluator extends EventEmitter {
  private config: FeedbackConfig;
  private memoryLayer?: MemoryLayer;

  constructor(config: FeedbackConfig, memoryLayer?: MemoryLayer) {
    super();
    this.config = config;
    this.memoryLayer = memoryLayer;
  }

  /**
   * 执行多维度评估
   */
  evaluate(
    plan: ExecutionPlan,
    results: Map<UUID, TaskExecutionResult>,
    context?: Record<string, any>
  ): ComprehensiveEvaluation {
    const taskResults = Array.from(results.values());
    const subtasks = plan.subtasks;

    // 1. 计算完成度指标
    const completionMetrics = this.calculateCompletionMetrics(taskResults, subtasks);

    // 2. 计算准确性指标
    const accuracyMetrics = this.calculateAccuracyMetrics(taskResults, context);

    // 3. 计算效率指标
    const efficiencyMetrics = this.calculateEfficiencyMetrics(taskResults, plan);

    // 4. 计算可靠性指标
    const reliabilityMetrics = this.calculateReliabilityMetrics(taskResults);

    // 5. 计算资源使用指标
    const resourceMetrics = this.calculateResourceMetrics(taskResults);

    // 组装多维度指标
    const multiDimensionMetrics: MultiDimensionMetrics = {
      completion: completionMetrics,
      accuracy: accuracyMetrics,
      efficiency: efficiencyMetrics,
      reliability: reliabilityMetrics,
      resourceUsage: resourceMetrics,
    };

    // 计算综合质量分数
    const qualityScore = this.calculateQualityScore(multiDimensionMetrics);

    // 生成改进建议
    const improvementSuggestions = this.generateImprovementSuggestions(
      multiDimensionMetrics,
      qualityScore
    );

    // 对比历史表现
    const comparableHistory = this.compareWithHistory(plan, qualityScore);

    // 基础评估
    const baseEvaluation: ExecutionEvaluation = {
      taskId: plan.id,
      planId: plan.id,
      success: qualityScore >= this.config.thresholds.qualityScore,
      metrics: {
        completionRate: completionMetrics.rate,
        accuracy: accuracyMetrics.overall,
        efficiency: efficiencyMetrics.parallelismEfficiency,
        duration: efficiencyMetrics.totalDuration,
      },
      issues: this.extractIssues(taskResults),
      lessons: this.extractLessons(multiDimensionMetrics, qualityScore),
      timestamp: Date.now(),
    };

    const evaluation: ComprehensiveEvaluation = {
      ...baseEvaluation,
      multiDimensionMetrics,
      qualityScore,
      improvementSuggestions,
      comparableHistory,
    };

    this.emit('evaluation:completed', evaluation);
    logger.info('多维度评估完成', {
      planId: plan.id,
      qualityScore,
      success: evaluation.success,
    });

    return evaluation;
  }

  /**
   * 计算完成度指标
   */
  private calculateCompletionMetrics(
    results: TaskExecutionResult[],
    subtasks: SubTask[]
  ) {
    const total = results.length;
    const successful = results.filter(r => r.success).length;
    const failed = total - successful;
    const retried = results.filter(r => r.retryCount > 0).length;

    return {
      rate: total > 0 ? successful / total : 0,
      failedTasks: failed,
      retriedTasks: retried,
    };
  }

  /**
   * 计算准确性指标
   */
  private calculateAccuracyMetrics(
    results: TaskExecutionResult[],
    context?: Record<string, any>
  ) {
    // 如果有验证结果，使用验证结果
    const validationResults: MultiDimensionMetrics['accuracy']['validationResults'] = [];
    
    for (const result of results) {
      if (result.output?.validation) {
        validationResults.push({
          taskId: result.taskId,
          passed: result.output.validation.passed,
          score: result.output.validation.score || (result.output.validation.passed ? 1 : 0),
        });
      } else {
        // 基于成功状态推断
        validationResults.push({
          taskId: result.taskId,
          passed: result.success,
          score: result.success ? 1 : 0,
        });
      }
    }

    const overall = validationResults.length > 0
      ? validationResults.reduce((sum, v) => sum + v.score, 0) / validationResults.length
      : 0;

    return {
      overall,
      validationResults,
    };
  }

  /**
   * 计算效率指标
   */
  private calculateEfficiencyMetrics(
    results: TaskExecutionResult[],
    plan: ExecutionPlan
  ) {
    const durations = results.map(r => r.duration);
    const totalDuration = Math.max(...durations);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    // 计算并行效率
    const sequentialTime = durations.reduce((a, b) => a + b, 0);
    const parallelEfficiency = sequentialTime > 0
      ? sequentialTime / (totalDuration * results.length)
      : 1;

    // 计算与预期时间的偏差
    const expectedDuration = plan.subtasks.length * 5000; // 假设每个任务5秒
    const timeDeviation = expectedDuration > 0
      ? (totalDuration - expectedDuration) / expectedDuration
      : 0;

    return {
      totalDuration,
      avgTaskDuration: avgDuration,
      parallelismEfficiency: Math.min(parallelEfficiency, 1),
      timeDeviation,
    };
  }

  /**
   * 计算可靠性指标
   */
  private calculateReliabilityMetrics(results: TaskExecutionResult[]) {
    const total = results.length;
    const errors = results.filter(r => !r.success).length;
    const errorRate = total > 0 ? errors / total : 0;

    // 计算恢复成功率（重试后成功的任务）
    const retriedAndSucceeded = results.filter(
      r => r.retryCount > 0 && r.success
    ).length;
    const totalRetried = results.filter(r => r.retryCount > 0).length;
    const recoverySuccessRate = totalRetried > 0
      ? retriedAndSucceeded / totalRetried
      : 1;

    // 稳定性分数（基于错误率和恢复成功率）
    const stabilityScore = (1 - errorRate) * 0.6 + recoverySuccessRate * 0.4;

    return {
      stabilityScore,
      errorRate,
      recoverySuccessRate,
    };
  }

  /**
   * 计算资源使用指标
   */
  private calculateResourceMetrics(results: TaskExecutionResult[]) {
    // 从结果中提取资源使用数据
    const resourceData = results
      .map(r => r.output?.resourceUsage)
      .filter(Boolean);

    if (resourceData.length === 0) {
      return {
        cpuUtilization: 0.5,
        memoryUtilization: 0.5,
        ioEfficiency: 0.5,
        costEfficiency: 0.5,
      };
    }

    const avg = (key: string) =>
      resourceData.reduce((sum, r) => sum + (r[key] || 0), 0) / resourceData.length;

    return {
      cpuUtilization: avg('cpu'),
      memoryUtilization: avg('memory'),
      ioEfficiency: avg('ioEfficiency') || 0.5,
      costEfficiency: avg('costEfficiency') || 0.5,
    };
  }

  /**
   * 计算综合质量分数
   */
  private calculateQualityScore(metrics: MultiDimensionMetrics): number {
    const { evaluationWeights } = this.config;
    const weights = evaluationWeights;

    const score =
      metrics.completion.rate * weights.completion * 100 +
      metrics.accuracy.overall * weights.accuracy * 100 +
      metrics.reliability.stabilityScore * weights.reliability * 100 +
      metrics.efficiency.parallelismEfficiency * weights.efficiency * 100 +
      (1 - metrics.resourceUsage.cpuUtilization) * weights.resourceUsage * 100; // 资源使用越低越好

    return Math.round(score);
  }

  /**
   * 生成改进建议
   */
  private generateImprovementSuggestions(
    metrics: MultiDimensionMetrics,
    qualityScore: number
  ): string[] {
    const suggestions: string[] = [];

    if (metrics.completion.rate < this.config.thresholds.completionRate) {
      suggestions.push(`任务完成率偏低 (${(metrics.completion.rate * 100).toFixed(1)}%)，建议增强错误处理和重试机制`);
    }

    if (metrics.accuracy.overall < this.config.thresholds.accuracyScore) {
      suggestions.push(`结果准确性有待提升，建议优化工具选择策略和参数调优`);
    }

    if (metrics.efficiency.parallelismEfficiency < this.config.thresholds.efficiencyScore) {
      suggestions.push(`并行效率较低，建议优化任务依赖关系，增加可并行执行的任务`);
    }

    if (metrics.reliability.errorRate > 0.1) {
      suggestions.push(`错误率较高 (${(metrics.reliability.errorRate * 100).toFixed(1)}%)，建议增加前置检查和容错机制`);
    }

    if (metrics.efficiency.timeDeviation > 0.5) {
      suggestions.push(`执行时间超出预期 ${(metrics.efficiency.timeDeviation * 100).toFixed(0)}%，建议优化任务执行效率`);
    }

    if (qualityScore >= 90) {
      suggestions.push('整体表现优秀，建议总结成功经验并推广');
    }

    return suggestions;
  }

  /**
   * 对比历史表现
   */
  private compareWithHistory(
    plan: ExecutionPlan,
    currentScore: number
  ): ComprehensiveEvaluation['comparableHistory'] {
    if (!this.memoryLayer) return undefined;

    // 查询相似任务的历史评估
    const similarExperiences = this.memoryLayer.findSimilarExperiences(
      'task_execution',
      { goal: plan.goal }
    );

    if (similarExperiences.length < 3) return undefined;

    const scores = similarExperiences.map(e => e.context?.qualityScore || 0);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const bestScore = Math.max(...scores);

    // 判断趋势
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (currentScore > avgScore + 10) trend = 'improving';
    else if (currentScore < avgScore - 10) trend = 'declining';

    return {
      avgScore,
      bestScore,
      trend,
    };
  }

  /**
   * 提取问题列表
   */
  private extractIssues(results: TaskExecutionResult[]): string[] {
    const issues: string[] = [];

    for (const result of results) {
      if (!result.success && result.error) {
        issues.push(result.error);
      }
    }

    return [...new Set(issues)]; // 去重
  }

  /**
   * 提取经验教训
   */
  private extractLessons(
    metrics: MultiDimensionMetrics,
    qualityScore: number
  ): string[] {
    const lessons: string[] = [];

    if (qualityScore >= 90) {
      lessons.push('高成功率策略：当前配置和执行策略表现优异，建议后续复用');
    }

    if (metrics.reliability.recoverySuccessRate > 0.8) {
      lessons.push('有效的重试机制：错误恢复机制表现良好，能有效处理临时故障');
    }

    if (metrics.efficiency.parallelismEfficiency > 0.8) {
      lessons.push('优秀的并行设计：任务依赖关系设计合理，并行执行效率高');
    }

    if (metrics.completion.retriedTasks > 0 && metrics.reliability.recoverySuccessRate < 0.5) {
      lessons.push('重试策略需优化：重试次数多但成功率低，建议调整重试间隔或增加备用方案');
    }

    return lessons;
  }

  /**
   * 整合人工反馈
   */
  integrateHumanFeedback(
    evaluation: ComprehensiveEvaluation,
    humanFeedback: HumanFeedback
  ): ComprehensiveEvaluation {
    // 调整质量分数（加权平均）
    const autoWeight = 0.6;
    const humanWeight = 0.4;
    const humanScore = humanFeedback.overallRating * 20; // 1-5分转换为0-100

    const adjustedScore = Math.round(
      evaluation.qualityScore * autoWeight + humanScore * humanWeight
    );

    // 整合人工建议
    const combinedSuggestions = [
      ...evaluation.improvementSuggestions,
      ...humanFeedback.suggestedImprovements,
    ];

    return {
      ...evaluation,
      qualityScore: adjustedScore,
      improvementSuggestions: [...new Set(combinedSuggestions)],
    };
  }
}

// ========================================
// 错误复盘分析器
// ========================================

export class ErrorAnalyzer extends EventEmitter {
  private memoryLayer?: MemoryLayer;
  private errorHistory: Map<string, number>; // 错误模式 -> 发生次数

  constructor(memoryLayer?: MemoryLayer) {
    super();
    this.memoryLayer = memoryLayer;
    this.errorHistory = new Map();
  }

  /**
   * 分析错误根因
   */
  analyze(
    taskId: UUID,
    error: Error,
    context: Record<string, any>
  ): ErrorRootCause {
    const errorMessage = error.message;
    
    // 1. 分类错误
    const category = this.categorizeError(errorMessage, context);

    // 2. 分析根因
    const rootCause = this.identifyRootCause(category, errorMessage, context);

    // 3. 识别影响因素
    const contributingFactors = this.identifyContributingFactors(
      category,
      context
    );

    // 4. 确定严重程度
    const severity = this.determineSeverity(category, errorMessage);

    // 5. 判断是否可恢复
    const isRecoverable = this.isRecoverable(category, error);

    // 6. 生成预防策略
    const preventionStrategy = this.generatePreventionStrategy(
      category,
      rootCause
    );

    // 7. 查询历史相似错误
    const errorPattern = this.extractErrorPattern(errorMessage);
    const similarErrors = this.errorHistory.get(errorPattern) || 0;
    this.errorHistory.set(errorPattern, similarErrors + 1);

    const analysis: ErrorRootCause = {
      errorId: uuidv4(),
      category,
      taskId,
      errorMessage,
      rootCause,
      contributingFactors,
      severity,
      isRecoverable,
      preventionStrategy,
      similarErrors,
    };

    this.emit('error:analyzed', analysis);
    logger.info('错误根因分析完成', {
      errorId: analysis.errorId,
      category,
      severity,
      isRecoverable,
    });

    return analysis;
  }

  /**
   * 分类错误
   */
  private categorizeError(
    errorMessage: string,
    context: Record<string, any>
  ): ErrorCategory {
    const message = errorMessage.toLowerCase();

    if (message.includes('timeout') || message.includes('timed out')) {
      return ErrorCategory.TIMEOUT_ERROR;
    }

    if (message.includes('connection') || message.includes('connect')) {
      return ErrorCategory.ENVIRONMENT_ERROR;
    }

    if (message.includes('tool') || message.includes('function')) {
      return ErrorCategory.TOOL_ERROR;
    }

    if (message.includes('resource') || message.includes('memory') || message.includes('cpu')) {
      return ErrorCategory.RESOURCE_ERROR;
    }

    if (message.includes('data') || message.includes('schema') || message.includes('format')) {
      return ErrorCategory.DATA_ERROR;
    }

    if (message.includes('plan') || message.includes('dependency')) {
      return ErrorCategory.PLANNING_ERROR;
    }

    if (context.executionPhase === 'execution') {
      return ErrorCategory.EXECUTION_ERROR;
    }

    return ErrorCategory.UNKNOWN_ERROR;
  }

  /**
   * 识别根因
   */
  private identifyRootCause(
    category: ErrorCategory,
    errorMessage: string,
    context: Record<string, any>
  ): string {
    switch (category) {
      case ErrorCategory.TIMEOUT_ERROR:
        return context.timeoutConfig
          ? `任务执行时间超过配置的超时时间 (${context.timeoutConfig}ms)`
          : '任务执行时间过长，未配置合理的超时时间';

      case ErrorCategory.ENVIRONMENT_ERROR:
        return '目标服务或网络环境不稳定，连接中断或拒绝服务';

      case ErrorCategory.TOOL_ERROR:
        return `工具调用失败：${errorMessage}，可能是参数错误或工具不可用`;

      case ErrorCategory.RESOURCE_ERROR:
        return '系统资源不足（CPU/内存/IO），无法完成任务';

      case ErrorCategory.DATA_ERROR:
        return '数据格式错误、缺失或不符合预期';

      case ErrorCategory.PLANNING_ERROR:
        return '任务规划不合理，依赖关系配置错误或任务分解不当';

      default:
        return `未知原因：${errorMessage}`;
    }
  }

  /**
   * 识别影响因素
   */
  private identifyContributingFactors(
    category: ErrorCategory,
    context: Record<string, any>
  ): string[] {
    const factors: string[] = [];

    if (category === ErrorCategory.TIMEOUT_ERROR) {
      if (context.dataSize > 1000000) {
        factors.push('数据量过大');
      }
      if (context.retryCount > 3) {
        factors.push('多次重试累积耗时');
      }
    }

    if (category === ErrorCategory.ENVIRONMENT_ERROR) {
      if (context.networkLatency > 1000) {
        factors.push('网络延迟高');
      }
      if (context.targetService) {
        factors.push(`目标服务(${context.targetService})不稳定`);
      }
    }

    if (category === ErrorCategory.RESOURCE_ERROR) {
      if (context.concurrentTasks > 5) {
        factors.push('并发任务过多');
      }
      if (context.memoryUsage > 0.9) {
        factors.push('内存使用率高');
      }
    }

    return factors;
  }

  /**
   * 确定严重程度
   */
  private determineSeverity(
    category: ErrorCategory,
    errorMessage: string
  ): 'critical' | 'high' | 'medium' | 'low' {
    if (category === ErrorCategory.PLANNING_ERROR) {
      return 'critical';
    }

    if (category === ErrorCategory.RESOURCE_ERROR) {
      return 'high';
    }

    if (category === ErrorCategory.TIMEOUT_ERROR) {
      return errorMessage.includes('critical') ? 'high' : 'medium';
    }

    if (category === ErrorCategory.DATA_ERROR) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * 判断是否可恢复
   */
  private isRecoverable(category: ErrorCategory, error: Error): boolean {
    // 超时、环境、资源错误通常是可恢复的
    const recoverableCategories = [
      ErrorCategory.TIMEOUT_ERROR,
      ErrorCategory.ENVIRONMENT_ERROR,
      ErrorCategory.RESOURCE_ERROR,
    ];

    return recoverableCategories.includes(category);
  }

  /**
   * 生成预防策略
   */
  private generatePreventionStrategy(
    category: ErrorCategory,
    rootCause: string
  ): string {
    const strategies: Record<ErrorCategory, string> = {
      [ErrorCategory.TIMEOUT_ERROR]: '增加超时时间配置，或优化任务执行效率；对于大数据量任务考虑分批处理',
      [ErrorCategory.ENVIRONMENT_ERROR]: '增加连接重试机制和断路器模式；考虑使用连接池和服务发现',
      [ErrorCategory.TOOL_ERROR]: '加强工具参数验证；提供工具使用示例和文档；准备备用工具方案',
      [ErrorCategory.RESOURCE_ERROR]: '限制并发任务数；增加资源监控和预警；优化资源使用效率',
      [ErrorCategory.DATA_ERROR]: '增加数据验证步骤；提供数据清洗和转换工具；建立数据质量检查',
      [ErrorCategory.PLANNING_ERROR]: '优化任务分解逻辑；增加依赖关系检查；提供规划预览功能',
      [ErrorCategory.EXECUTION_ERROR]: '增加前置条件检查；完善错误处理和回滚机制',
      [ErrorCategory.UNKNOWN_ERROR]: '增强日志记录；建立错误报告机制；持续监控和分析',
    };

    return strategies[category] || '持续监控，积累更多数据后分析';
  }

  /**
   * 生成复盘报告
   */
  generatePostMortem(
    plan: ExecutionPlan,
    results: Map<UUID, TaskExecutionResult>,
    evaluation: ComprehensiveEvaluation
  ): PostMortemReport {
    // 分析所有错误
    const errorAnalyses: ErrorRootCause[] = [];
    for (const [taskId, result] of results) {
      if (!result.success && result.error) {
        const analysis = this.analyze(
          taskId,
          new Error(result.error),
          { taskId, executionPhase: 'execution' }
        );
        errorAnalyses.push(analysis);
      }
    }

    // 总结成功经验
    const successFactors = evaluation.lessons.filter(l => 
      l.includes('成功') || l.includes('优秀')
    );

    // 生成行动项
    const actionItems = errorAnalyses.map(error => ({
      description: `解决：${error.rootCause}`,
      priority: error.severity as 'high' | 'medium' | 'low',
      dueDate: Date.now() + 7 * 24 * 60 * 60 * 1000, // 一周后
    }));

    // 提取知识
    const knowledgeGained = this.extractKnowledgeFromErrors(errorAnalyses);

    const report: PostMortemReport = {
      id: uuidv4(),
      planId: plan.id,
      timestamp: Date.now(),
      summary: this.generateSummary(evaluation, errorAnalyses),
      successFactors,
      failureAnalysis: errorAnalyses,
      lessonsLearned: evaluation.lessons,
      actionItems,
      knowledgeGained,
    };

    this.emit('postmortem:generated', report);
    logger.info('复盘报告生成完成', { reportId: report.id, errorCount: errorAnalyses.length });

    return report;
  }

  /**
   * 提取错误模式
   */
  private extractErrorPattern(errorMessage: string): string {
    // 简化：提取前50个字符作为模式
    return errorMessage.slice(0, 50).toLowerCase().replace(/\d+/g, '#');
  }

  /**
   * 生成报告摘要
   */
  private generateSummary(
    evaluation: ComprehensiveEvaluation,
    errors: ErrorRootCause[]
  ): string {
    const success = evaluation.success;
    const score = evaluation.qualityScore;

    if (success && errors.length === 0) {
      return `任务执行成功，质量分数 ${score}，无明显问题。`;
    }

    const criticalErrors = errors.filter(e => e.severity === 'critical').length;
    const recoverableErrors = errors.filter(e => e.isRecoverable).length;

    return `任务执行${success ? '成功' : '失败'}，质量分数 ${score}。` +
           `共发现 ${errors.length} 个错误，` +
           `其中 ${criticalErrors} 个严重错误，` +
           `${recoverableErrors} 个可恢复错误。`;
  }

  /**
   * 从错误中提取知识
   */
  private extractKnowledgeFromErrors(errors: ErrorRootCause[]): ExperienceRule[] {
    const rules: ExperienceRule[] = [];

    for (const error of errors) {
      if (error.similarErrors >= 3) {
        // 频繁发生的错误，生成经验规则
        const rule: ExperienceRule = {
          id: uuidv4(),
          pattern: `error:${error.category}`,
          condition: { category: error.category },
          action: `prevent_${error.category}`,
          successRate: 0.9,
          applicationCount: error.similarErrors,
          createdAt: Date.now(),
          lastApplied: Date.now(),
        };
        rules.push(rule);
      }
    }

    return rules;
  }
}

// ========================================
// 经验提炼器（增强版）
// ========================================

export class ExperienceExtractor extends EventEmitter {
  private rules: ExperienceRule[];
  private maxRules: number;
  private memoryLayer?: MemoryLayer;

  constructor(maxRules: number = 1000, memoryLayer?: MemoryLayer) {
    super();
    this.rules = [];
    this.maxRules = maxRules;
    this.memoryLayer = memoryLayer;
  }

  /**
   * 从评估结果中提炼经验
   */
  extract(
    evaluation: ComprehensiveEvaluation,
    context: Record<string, any>
  ): ExperienceRule[] {
    const newRules: ExperienceRule[] = [];

    // 1. 提取成功策略
    if (evaluation.success && evaluation.qualityScore >= 85) {
      const successRule = this.createSuccessRule(evaluation, context);
      newRules.push(successRule);
    }

    // 2. 从改进建议中提取规则
    for (const suggestion of evaluation.improvementSuggestions) {
      const rule = this.createSuggestionRule(suggestion, context);
      if (rule) newRules.push(rule);
    }

    // 3. 提取维度特定的规则
    const dimensionRules = this.extractDimensionRules(
      evaluation.multiDimensionMetrics,
      context
    );
    newRules.push(...dimensionRules);

    // 保存规则
    for (const rule of newRules) {
      this.addRule(rule);
    }

    // 同步到记忆层
    if (this.memoryLayer) {
      this.syncToMemory(newRules);
    }

    this.emit('experience:extracted', { rules: newRules, totalRules: this.rules.length });
    logger.info('经验规则提炼完成', { newRules: newRules.length, totalRules: this.rules.length });

    return newRules;
  }

  /**
   * 创建成功策略规则
   */
  private createSuccessRule(
    evaluation: ComprehensiveEvaluation,
    context: Record<string, any>
  ): ExperienceRule {
    const patterns = [
      `goal:${context.goal}`,
      `task_type:${context.taskType}`,
      `strategy:${context.strategy}`,
    ];

    return {
      id: uuidv4(),
      pattern: patterns.join('|'),
      condition: {
        goal: context.goal,
        taskType: context.taskType,
        success: true,
      },
      action: 'reuse_success_strategy',
      successRate: evaluation.qualityScore / 100,
      applicationCount: 1,
      createdAt: Date.now(),
      lastApplied: Date.now(),
      metadata: {
        qualityScore: evaluation.qualityScore,
        metrics: evaluation.multiDimensionMetrics,
        context,
      },
    };
  }

  /**
   * 从建议创建规则
   */
  private createSuggestionRule(
    suggestion: string,
    context: Record<string, any>
  ): ExperienceRule | null {
    // 解析建议类型
    if (suggestion.includes('超时')) {
      return {
        id: uuidv4(),
        pattern: `issue:timeout|task:${context.taskType}`,
        condition: { hasTimeout: true },
        action: 'increase_timeout_or_optimize',
        successRate: 0.8,
        applicationCount: 1,
        createdAt: Date.now(),
        lastApplied: Date.now(),
      };
    }

    if (suggestion.includes('并行')) {
      return {
        id: uuidv4(),
        pattern: `issue:parallelism|task:${context.taskType}`,
        condition: { lowParallelism: true },
        action: 'optimize_dependencies',
        successRate: 0.75,
        applicationCount: 1,
        createdAt: Date.now(),
        lastApplied: Date.now(),
      };
    }

    return null;
  }

  /**
   * 提取维度特定规则
   */
  private extractDimensionRules(
    metrics: MultiDimensionMetrics,
    context: Record<string, any>
  ): ExperienceRule[] {
    const rules: ExperienceRule[] = [];

    // 可靠性规则
    if (metrics.reliability.stabilityScore > 0.9) {
      rules.push({
        id: uuidv4(),
        pattern: `high_reliability|${context.taskType}`,
        condition: { stabilityScore: { $gt: 0.9 } },
        action: 'apply_reliability_pattern',
        successRate: metrics.reliability.stabilityScore,
        applicationCount: 1,
        createdAt: Date.now(),
        lastApplied: Date.now(),
      });
    }

    // 效率规则
    if (metrics.efficiency.parallelismEfficiency > 0.8) {
      rules.push({
        id: uuidv4(),
        pattern: `high_efficiency|${context.taskType}`,
        condition: { parallelismEfficiency: { $gt: 0.8 } },
        action: 'apply_parallel_optimization',
        successRate: metrics.efficiency.parallelismEfficiency,
        applicationCount: 1,
        createdAt: Date.now(),
        lastApplied: Date.now(),
      });
    }

    return rules;
  }

  /**
   * 查找适用的规则
   */
  findApplicable(context: Record<string, any>): ExperienceRule[] {
    return this.rules.filter(rule => this.matches(rule.condition, context));
  }

  /**
   * 获取高置信度规则
   */
  getHighConfidence(minSuccessRate: number = 0.8, minApplications: number = 3): ExperienceRule[] {
    return this.rules
      .filter(r => r.successRate >= minSuccessRate && r.applicationCount >= minApplications)
      .sort((a, b) => b.successRate - a.successRate);
  }

  /**
   * 更新规则成功率
   */
  updateSuccess(ruleId: UUID, success: boolean): void {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      const total = rule.successRate * rule.applicationCount + (success ? 1 : 0);
      rule.applicationCount++;
      rule.successRate = total / rule.applicationCount;
      rule.lastApplied = Date.now();
    }
  }

  /**
   * 添加规则（带LRU淘汰）
   */
  private addRule(rule: ExperienceRule): void {
    const existing = this.rules.findIndex(
      r => r.pattern === rule.pattern && r.action === rule.action
    );

    if (existing >= 0) {
      // 更新现有规则
      this.rules[existing] = rule;
    } else {
      // 添加新规则，LRU淘汰
      if (this.rules.length >= this.maxRules) {
        this.rules.sort((a, b) => a.lastApplied - b.lastApplied);
        this.rules.shift();
      }
      this.rules.push(rule);
    }
  }

  /**
   * 匹配条件
   */
  private matches(condition: Record<string, any>, context: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(condition)) {
      if (typeof value === 'object' && value.$gt !== undefined) {
        if (!(context[key] > value.$gt)) return false;
      } else if (context[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * 同步到记忆层
   */
  private syncToMemory(rules: ExperienceRule[]): void {
    for (const rule of rules) {
      this.memoryLayer?.recordExperience('feedback_rule', rule.pattern, rule.action, {
        ruleId: rule.id,
        successRate: rule.successRate,
        condition: rule.condition,
      });
    }
  }
}

// ========================================
// 模型微调数据管理器（增强版）
// ========================================

export class ModelFineTuningManager extends EventEmitter {
  private trainingData: FineTuningData[];
  private maxSize: number;

  constructor(maxSize: number = 10000) {
    super();
    this.trainingData = [];
    this.maxSize = maxSize;
  }

  /**
   * 收集训练数据
   */
  collect(
    input: string,
    output: string,
    context: Record<string, any>,
    evaluation: ComprehensiveEvaluation
  ): FineTuningData {
    const feedback = evaluation.success ? 'positive' : 'negative';
    const quality = evaluation.qualityScore;

    const data: FineTuningData = {
      id: uuidv4(),
      input,
      output,
      context: {
        ...context,
        qualityScore: quality,
        success: evaluation.success,
        metrics: evaluation.multiDimensionMetrics,
      },
      feedback,
      timestamp: Date.now(),
    };

    this.trainingData.push(data);

    // 限制大小
    if (this.trainingData.length > this.maxSize) {
      // 优先移除低质量的负样本
      const negativeIndex = this.trainingData.findIndex(
        d => d.feedback === 'negative' && (d.context?.qualityScore || 0) < 30
      );
      if (negativeIndex >= 0) {
        this.trainingData.splice(negativeIndex, 1);
      } else {
        this.trainingData.shift();
      }
    }

    this.emit('data:collected', data);
    return data;
  }

  /**
   * 获取高质量训练数据
   */
  getTrainingData(options?: {
    minQuality?: number;
    feedback?: 'positive' | 'negative' | 'all';
    limit?: number;
  }): Array<{
    instruction: string;
    input: string;
    output: string;
    metadata: Record<string, any>;
  }> {
    let data = this.trainingData;

    // 过滤反馈类型
    if (options?.feedback && options.feedback !== 'all') {
      data = data.filter(d => d.feedback === options.feedback);
    }

    // 过滤质量
    if (options?.minQuality !== undefined) {
      data = data.filter(d => (d.context?.qualityScore || 0) >= options.minQuality!);
    }

    // 排序：高质量正样本优先
    data.sort((a, b) => {
      const scoreA = (a.context?.qualityScore || 0) * (a.feedback === 'positive' ? 1 : -1);
      const scoreB = (b.context?.qualityScore || 0) * (b.feedback === 'positive' ? 1 : -1);
      return scoreB - scoreA;
    });

    // 限制数量
    const limited = options?.limit ? data.slice(0, options.limit) : data;

    return limited.map(d => ({
      instruction: d.context?.instruction || '',
      input: d.input,
      output: d.output,
      metadata: {
        qualityScore: d.context?.qualityScore,
        feedback: d.feedback,
        timestamp: d.timestamp,
      },
    }));
  }

  /**
   * 导出为训练格式
   */
  export(format: 'alpaca' | 'sharegpt' | 'openai' = 'alpaca', quality?: 'high' | 'medium' | 'all'): string {
    const minQuality = quality === 'high' ? 70 : quality === 'medium' ? 50 : 0;
    const data = this.getTrainingData({ minQuality, feedback: 'all' });

    switch (format) {
      case 'alpaca':
        return JSON.stringify(data, null, 2);

      case 'sharegpt':
        return JSON.stringify(
          data.map(item => ({
            conversations: [
              { from: 'system', value: item.instruction },
              { from: 'human', value: item.input },
              { from: 'gpt', value: item.output },
            ],
          })),
          null,
          2
        );

      case 'openai':
        return JSON.stringify(
          data.map(item => ({
            messages: [
              { role: 'system', content: item.instruction },
              { role: 'user', content: item.input },
              { role: 'assistant', content: item.output },
            ],
          })),
          null,
          2
        );

      default:
        return JSON.stringify(data, null, 2);
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    positive: number;
    negative: number;
    neutral: number;
    avgQuality: number;
  } {
    const total = this.trainingData.length;
    const positive = this.trainingData.filter(d => d.feedback === 'positive').length;
    const negative = this.trainingData.filter(d => d.feedback === 'negative').length;
    const neutral = this.trainingData.filter(d => d.feedback === 'neutral').length;
    const avgQuality = total > 0
      ? this.trainingData.reduce((sum, d) => sum + (d.context?.qualityScore || 0), 0) / total
      : 0;

    return { total, positive, negative, neutral, avgQuality };
  }

  /**
   * 检查是否满足微调条件
   */
  canFineTune(minSamples: number = 100, minPositiveRatio: number = 0.6): boolean {
    const stats = this.getStats();
    const positiveRatio = stats.total > 0 ? stats.positive / stats.total : 0;
    return stats.total >= minSamples && positiveRatio >= minPositiveRatio;
  }
}

// ========================================
// 反馈层核心类（整合版）
// ========================================

export class FeedbackLayer extends EventEmitter {
  private config: FeedbackConfig;
  private evaluator: ResultEvaluator;
  private errorAnalyzer: ErrorAnalyzer;
  private experienceExtractor: ExperienceExtractor;
  private fineTuningManager: ModelFineTuningManager;
  private memoryLayer?: MemoryLayer;

  constructor(config?: Partial<FeedbackConfig>, memoryLayer?: MemoryLayer) {
    super();
    this.config = {
      enableAutoEvaluation: true,
      enableExperienceExtraction: true,
      enableErrorAnalysis: true,
      enableFineTuning: true,
      enableHumanFeedback: true,
      minSamplesForFineTuning: 100,
      evaluationWeights: {
        completion: 0.25,
        accuracy: 0.25,
        efficiency: 0.2,
        reliability: 0.2,
        resourceUsage: 0.1,
      },
      thresholds: {
        completionRate: 0.9,
        accuracyScore: 0.85,
        efficiencyScore: 0.8,
        qualityScore: 80,
      },
      ...config,
    };

    this.memoryLayer = memoryLayer;
    this.evaluator = new ResultEvaluator(this.config, memoryLayer);
    this.errorAnalyzer = new ErrorAnalyzer(memoryLayer);
    this.experienceExtractor = new ExperienceExtractor(1000, memoryLayer);
    this.fineTuningManager = new ModelFineTuningManager();

    this.setupEventForwarding();
  }

  private setupEventForwarding() {
    // 转发各组件事件
    this.evaluator.on('evaluation:completed', (e) => this.emit('feedback:evaluation', e));
    this.errorAnalyzer.on('error:analyzed', (e) => this.emit('feedback:error', e));
    this.errorAnalyzer.on('postmortem:generated', (p) => this.emit('feedback:postmortem', p));
    this.experienceExtractor.on('experience:extracted', (e) => this.emit('feedback:experience', e));
  }

  /**
   * 完整反馈流程：评估 → 分析 → 提炼
   */
  async processFeedback(
    plan: ExecutionPlan,
    results: Map<UUID, TaskExecutionResult>,
    context: Record<string, any>
  ): Promise<{
    evaluation: ComprehensiveEvaluation;
    postmortem?: PostMortemReport;
    rules: ExperienceRule[];
  }> {
    // 1. 评估结果
    const evaluation = this.evaluator.evaluate(plan, results, context);

    // 2. 错误复盘（如果有失败）
    let postmortem: PostMortemReport | undefined;
    if (!evaluation.success || evaluation.multiDimensionMetrics.completion.failedTasks > 0) {
      postmortem = this.errorAnalyzer.generatePostMortem(plan, results, evaluation);
    }

    // 3. 提炼经验
    const rules = this.experienceExtractor.extract(evaluation, context);

    // 4. 收集微调数据
    if (this.config.enableFineTuning) {
      this.fineTuningManager.collect(
        context.input || '',
        context.output || '',
        context,
        evaluation
      );
    }

    this.emit('feedback:processed', { evaluation, postmortem, rules });

    return { evaluation, postmortem, rules };
  }

  /**
   * 添加人工反馈
   */
  addHumanFeedback(
    evaluationId: UUID,
    feedback: Omit<HumanFeedback, 'evaluationId' | 'timestamp'>
  ): ComprehensiveEvaluation | null {
    // 在实际应用中，这里应该查找并更新对应的评估
    // 简化实现：直接记录
    logger.info('人工反馈已记录', { evaluationId, rating: feedback.overallRating });
    this.emit('feedback:human', { evaluationId, ...feedback });
    return null;
  }

  /**
   * 获取适用的经验规则
   */
  getApplicableRules(context: Record<string, any>): ExperienceRule[] {
    return this.experienceExtractor.findApplicable(context);
  }

  /**
   * 导出微调数据
   */
  exportTrainingData(format: 'alpaca' | 'sharegpt' | 'openai' = 'alpaca'): string {
    return this.fineTuningManager.export(format);
  }

  /**
   * 检查是否可以微调
   */
  canFineTune(): boolean {
    return this.fineTuningManager.canFineTune(this.config.minSamplesForFineTuning);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    rules: number;
    trainingData: ReturnType<ModelFineTuningManager['getStats']>;
  } {
    return {
      rules: this.experienceExtractor.getHighConfidence(0, 0).length,
      trainingData: this.fineTuningManager.getStats(),
    };
  }
}

export default FeedbackLayer;
