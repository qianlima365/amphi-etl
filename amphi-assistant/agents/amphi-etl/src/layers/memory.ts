/**
 * 记忆层适配
 * 从原 etl-agent.ts 提取
 */

import { MemoryLayer, WorkingMemory, ExperienceMemory, KnowledgeMemory } from '../../../../src/core/memory';
import { OntologyLayer } from '../../../../src/core/ontologies';
import { Neo4jKnowledgeGraph } from '../../../../src';
import { createLogger } from '../../../../src/utils/logger';

const logger = createLogger('MemoryAdapter');

export interface MemoryAdapterOptions {
  kg: Neo4jKnowledgeGraph;
}

export class MemoryAdapter {
  private memoryLayer: MemoryLayer;
  private workingMemories: Map<string, WorkingMemory> = new Map();

  constructor(_options: MemoryAdapterOptions) {
    this.memoryLayer = new MemoryLayer({
      shortTerm: { type: 'memory', maxSize: 1000 },
      longTerm: { enabled: true },
      vector: { enabled: false },
    });
  }

  /**
   * 创建工作记忆
   */
  createWorkingMemory(agentId: string, sessionId: string): WorkingMemory {
    const wm = this.memoryLayer.createWorkingMemory(agentId, sessionId);
    this.workingMemories.set(sessionId, wm);
    this.memoryLayer.updateWorkingContext(sessionId, 'startTime', Date.now());
    return wm;
  }

  /**
   * 获取工作记忆
   */
  getWorkingMemory(sessionId: string): WorkingMemory | undefined {
    return this.workingMemories.get(sessionId);
  }

  /**
   * 更新工作上下文
   */
  updateWorkingContext(sessionId: string, key: string, value: any): void {
    this.memoryLayer.updateWorkingContext(sessionId, key, value);
  }

  /**
   * 设置临时结果
   */
  setTempResult(sessionId: string, key: string, value: any): void {
    this.memoryLayer.setTempResult(sessionId, key, value);
  }

  /**
   * 从本体论同步知识
   */
  async syncFromOntology(
    kg: Neo4jKnowledgeGraph,
    ontologyLayer: OntologyLayer
  ): Promise<number> {
    try {
      const query = `
        MATCH (c:Component)
        OPTIONAL MATCH (c)-[:HAS_PARAMETER]->(p:Parameter)
        WITH c, collect(p {
          .id, .name, .paramType, .defaultValue, .required, .description
        }) as params
        RETURN c.id as conceptId, c.name as conceptName, c.category as conceptType,
               c.description as description, params
        LIMIT 50
      `;
      const results = await kg.query(query);
      
      let synced = 0;
      for (const r of results) {
        const existing = this.memoryLayer.queryKnowledge(r.conceptName);
        if (existing.length === 0) {
          await this.memoryLayer.addKnowledge({
            conceptId: r.conceptId,
            conceptName: r.conceptName,
            conceptType: r.conceptType,
            facts: {
              description: r.description,
              parameters: r.params
            },
            relationships: [],
            source: 'ontology',
            confidence: 1.0
          });
          synced++;
        }
        
        ontologyLayer.getManager().registerConcept({
          id: r.conceptId,
          name: r.conceptName,
          type: r.conceptType,
          properties: {
            description: r.description,
            parameters: r.params
          },
          relationships: []
        });
      }
      
      if (synced > 0) {
        logger.info('记忆层·知识同步', { synced, source: 'ontology' });
      }

      return synced;
    } catch (e) {
      logger.error('记忆层·知识同步失败', { error: (e as Error).message });
      return 0;
    }
  }

  /**
   * 查询知识
   */
  queryKnowledge(conceptName?: string, keyword?: string): KnowledgeMemory[] {
    return this.memoryLayer.queryKnowledge(conceptName, keyword);
  }

  /**
   * 记录经验
   */
  recordExperience(
    domain: string,
    taskType: string,
    solution: string,
    context?: Record<string, any>
  ): ExperienceMemory {
    return this.memoryLayer.recordExperience(domain, taskType, solution, context ?? {});
  }

  /**
   * 查找相似经验
   */
  findSimilarExperiences(domain: string, context: Record<string, any>): ExperienceMemory[] {
    return this.memoryLayer.findSimilarExperiences(domain, context);
  }

  /**
   * 更新经验成功率
   */
  updateExperienceSuccess(experienceId: string, success: boolean): void {
    this.memoryLayer.updateExperienceSuccess(experienceId, success);
  }

  /**
   * 获取经验数量
   */
  getExperienceCount(): number {
    return this.memoryLayer.findSimilarExperiences('etl', {}).length;
  }

  /**
   * 获取记忆层实例
   */
  getMemoryLayer(): MemoryLayer {
    return this.memoryLayer;
  }
}

export default MemoryAdapter;
