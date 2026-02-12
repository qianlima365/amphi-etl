/**
 * 认知层适配
 * 从原 etl-agent.ts 提取
 */

import { CognitionLayer, PlanningStrategy, ExecutionPlan, SubTask, DependencyBuilder, EnvironmentChange } from '../../../../src/core/cognition';
import { OntologyLayer, ETLDomainOntology } from '../../../../src/core/ontologies';
import { ILLMService } from '../../../../src/core/cognition';
import { createLogger } from '../../../../src/utils/logger';
import { WorkingMemory } from '../../../../src/core/memory';

const logger = createLogger('CognitionAdapter');

export interface CognitionAdapterOptions {
  llm: ILLMService;
  ontologyLayer: OntologyLayer;
}

/**
 * ETL 依赖构建器
 */
export class ETLDependencyBuilder implements DependencyBuilder {
  buildDependencies(subtasks: SubTask[], context?: Record<string, any>): void {
    if (!context?.semanticConcepts) {
      this.buildHeuristicDependencies(subtasks);
      return;
    }

    const conceptTypes = new Set(
      (context.semanticConcepts as any[]).map((c: any) => c.type)
    );
    
    if (conceptTypes.has(ETLDomainOntology.CONCEPTS.DATA_SOURCE) &&
        conceptTypes.has(ETLDomainOntology.CONCEPTS.TRANSFORMATION)) {
      const sourceTasks = subtasks.filter(t => 
        t.name.toLowerCase().includes('connect') || 
        t.name.toLowerCase().includes('source') ||
        t.name.toLowerCase().includes('extract')
      );
      const transformTasks = subtasks.filter(t => 
        t.name.toLowerCase().includes('transform') ||
        t.name.toLowerCase().includes('convert')
      );
      
      for (const transform of transformTasks) {
        for (const source of sourceTasks) {
          if (!transform.dependencies.includes(source.id)) {
            transform.dependencies.push(source.id);
          }
        }
      }
    }

    this.buildDataFlowDependencies(subtasks);
  }

  private buildDataFlowDependencies(subtasks: SubTask[]): void {
    const extractTask = subtasks.find(t => t.name.toLowerCase().includes('extract'));
    const loadTask = subtasks.find(t => t.name.toLowerCase().includes('load'));
    const validateTask = subtasks.find(t => t.name.toLowerCase().includes('valid'));

    if (extractTask && loadTask) {
      const transformTasks = subtasks.filter(t => 
        t.name.toLowerCase().includes('transform')
      );
      if (transformTasks.length > 0) {
        const lastTransform = transformTasks[transformTasks.length - 1];
        if (!loadTask.dependencies.includes(lastTransform.id)) {
          loadTask.dependencies.push(lastTransform.id);
        }
      } else if (!loadTask.dependencies.includes(extractTask.id)) {
        loadTask.dependencies.push(extractTask.id);
      }
    }

    if (loadTask && validateTask && !validateTask.dependencies.includes(loadTask.id)) {
      validateTask.dependencies.push(loadTask.id);
    }
  }

  private buildHeuristicDependencies(subtasks: SubTask[]): void {
    this.buildDataFlowDependencies(subtasks);
    
    const validateTasks = subtasks.filter(t => 
      t.name.toLowerCase().includes('valid') || 
      t.name.toLowerCase().includes('check')
    );
    
    for (const validateTask of validateTasks) {
      const otherTasks = subtasks.filter(t => t.id !== validateTask.id);
      for (const task of otherTasks) {
        if (!validateTask.dependencies.includes(task.id)) {
          validateTask.dependencies.push(task.id);
        }
      }
    }
  }
}

export class CognitionAdapter {
  private cognition: CognitionLayer;
  private dependencyBuilder: ETLDependencyBuilder;

  constructor(options: CognitionAdapterOptions) {
    this.cognition = new CognitionLayer(
      options.llm,
      {
        planningStrategy: PlanningStrategy.SEMANTIC,
        enableDynamicPlanning: true,
        enableUncertaintyTracking: true,
        maxRetries: 3,
      },
      options.ontologyLayer
    );
    this.dependencyBuilder = new ETLDependencyBuilder();
  }

  /**
   * 创建执行计划
   */
  async createPlan(
    intent: { action: string; confidence: number; parameters: Record<string, any> },
    context: { sessionId: string; userId: string; phase: string }
  ): Promise<ExecutionPlan | null> {
    try {
      const plan = await this.cognition.plan(intent, context, this.dependencyBuilder);
      logger.info('认知层·计划创建完成', { subtaskCount: plan.subtasks.length });
      
      if (plan.uncertainty) {
        logger.debug('认知层·计划置信度', { 
          confidence: plan.uncertainty.overallConfidence,
          risks: plan.uncertainty.riskFactors 
        });
      }
      
      return plan;
    } catch (error) {
      logger.error('认知层·计划创建失败', { error: (error as Error).message });
      return null;
    }
  }

  /**
   * 处理环境变化
   */
  async handleEnvironmentChange(
    currentPlan: ExecutionPlan,
    change: EnvironmentChange
  ): Promise<ExecutionPlan | null> {
    try {
      const adjustedPlan = await this.cognition.replanForEnvironmentChange(currentPlan, change);
      logger.info('认知层·计划已调整');
      return adjustedPlan;
    } catch (error) {
      logger.error('认知层·环境重规划失败', { error: (error as Error).message });
      return null;
    }
  }

  /**
   * 解决不确定性
   */
  async resolveUncertainty(
    hypotheses: Array<{ description: string; confidence: number }>,
    context: Record<string, any>
  ): Promise<{ selectedOption: string; confidence: number } | null> {
    try {
      const decision = await this.cognition.resolveUncertainty(hypotheses, context);
      logger.info('认知层·不确定性决策', { selected: decision.selectedOption });
      return decision;
    } catch (error) {
      logger.error('认知层·不确定性决策失败', { error: (error as Error).message });
      return null;
    }
  }

  /**
   * 设置工作记忆
   */
  setWorkingMemory(workingMemory: WorkingMemory): void {
    this.cognition.setWorkingMemory(workingMemory);
  }

  /**
   * 添加假设
   */
  addHypothesis(description: string, confidence: number, riskFactors: string[]): void {
    this.cognition.addHypothesis(description, confidence, riskFactors);
  }

  /**
   * 获取依赖构建器
   */
  getDependencyBuilder(): ETLDependencyBuilder {
    return this.dependencyBuilder;
  }
}

export default CognitionAdapter;
