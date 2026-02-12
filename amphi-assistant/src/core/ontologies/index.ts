/**
 * 本体论语义层 (Ontology Layer)
 * 实现「本体论+LLM」的核心结合点
 * 
 * 核心功能:
 * - 本体论概念定义与管理
 * - 知识图谱集成
 * - 基于本体论的语义决策
 * - ETL 领域本体支持
 */

import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../utils/logger';
import {
  OntologyConcept,
  OntologyRelationship,
  UUID,
} from '../../types';

const logger = createLogger('OntologyLayer');

/** 知识图谱连接接口 */
export interface IKnowledgeGraph {
  query(cypher: string, params?: Record<string, any>): Promise<any[]>;
  createNode(label: string, properties: Record<string, any>): Promise<UUID>;
  createEdge(from: UUID, to: UUID, type: string, properties?: Record<string, any>): Promise<void>;
}

/**
 * ETL 领域本体定义
 */
export const ETLDomainOntology = {
  // 概念类型
  CONCEPTS: {
    DATA_SOURCE: 'DataSource',
    DATA_TARGET: 'DataTarget',
    TRANSFORMATION: 'Transformation',
    DATA_FIELD: 'DataField',
    VALIDATION_RULE: 'ValidationRule',
    PIPELINE: 'Pipeline',
  },

  // 关系类型
  RELATIONSHIPS: {
    EXTRACTS_FROM: 'EXTRACTS_FROM',
    LOADS_TO: 'LOADS_TO',
    TRANSFORMS: 'TRANSFORMS',
    HAS_FIELD: 'HAS_FIELD',
    VALIDATES_WITH: 'VALIDATES_WITH',
    DEPENDS_ON: 'DEPENDS_ON',
    PART_OF: 'PART_OF',
  },

  // 属性定义
  PROPERTIES: {
    DATA_SOURCE: ['name', 'type', 'connection', 'schema', 'refreshRate'],
    DATA_FIELD: ['name', 'dataType', 'nullable', 'defaultValue', 'description'],
    TRANSFORMATION: ['name', 'type', 'logic', 'inputFields', 'outputFields'],
    VALIDATION_RULE: ['name', 'condition', 'severity', 'errorMessage'],
  },
};

/**
 * 本体论管理器
 */
export class OntologyManager {
  private concepts: Map<UUID, OntologyConcept>;
  private kg?: IKnowledgeGraph;

  constructor(kg?: IKnowledgeGraph) {
    this.concepts = new Map();
    this.kg = kg;
    this.initializeETLOntology();
  }

  /**
   * 初始化 ETL 本体
   */
  private initializeETLOntology(): void {
    // 创建基础概念
    const concepts = [
      {
        id: uuidv4(),
        name: ETLDomainOntology.CONCEPTS.DATA_SOURCE,
        type: 'entity',
        properties: {
          description: '数据来源，如数据库、API、文件等',
          properties: ETLDomainOntology.PROPERTIES.DATA_SOURCE,
        },
        relationships: [],
      },
      {
        id: uuidv4(),
        name: ETLDomainOntology.CONCEPTS.DATA_TARGET,
        type: 'entity',
        properties: {
          description: '数据目标，如数据仓库、数据湖等',
          properties: ETLDomainOntology.PROPERTIES.DATA_SOURCE,
        },
        relationships: [],
      },
      {
        id: uuidv4(),
        name: ETLDomainOntology.CONCEPTS.TRANSFORMATION,
        type: 'process',
        properties: {
          description: '数据转换操作',
          properties: ETLDomainOntology.PROPERTIES.TRANSFORMATION,
        },
        relationships: [],
      },
      {
        id: uuidv4(),
        name: ETLDomainOntology.CONCEPTS.DATA_FIELD,
        type: 'attribute',
        properties: {
          description: '数据字段/列',
          properties: ETLDomainOntology.PROPERTIES.DATA_FIELD,
        },
        relationships: [],
      },
      {
        id: uuidv4(),
        name: ETLDomainOntology.CONCEPTS.VALIDATION_RULE,
        type: 'rule',
        properties: {
          description: '数据验证规则',
          properties: ETLDomainOntology.PROPERTIES.VALIDATION_RULE,
        },
        relationships: [],
      },
    ];

    for (const concept of concepts) {
      this.concepts.set(concept.id, concept);
    }

    logger.info('ETL 本体初始化完成', { conceptCount: concepts.length });
  }

  /**
   * 注册概念
   */
  registerConcept(concept: OntologyConcept): UUID {
    const id = concept.id || uuidv4();
    concept.id = id;
    this.concepts.set(id, concept);

    // 同步到知识图谱
    if (this.kg) {
      this.kg.createNode(concept.type, {
        id,
        name: concept.name,
        ...concept.properties,
      });
    }

    logger.debug('概念注册成功', { id, name: concept.name });
    return id;
  }

  /**
   * 获取概念
   */
  getConcept(id: UUID): OntologyConcept | undefined {
    return this.concepts.get(id);
  }

  /**
   * 按名称查找概念
   */
  findConceptByName(name: string): OntologyConcept | undefined {
    for (const concept of this.concepts.values()) {
      if (concept.name === name) {
        return concept;
      }
    }
    return undefined;
  }

  /**
   * 按类型查找概念
   */
  findConceptsByType(type: string): OntologyConcept[] {
    return Array.from(this.concepts.values()).filter((c) => c.type === type);
  }

  /**
   * 添加关系
   */
  addRelationship(
    fromId: UUID,
    toId: UUID,
    type: string,
    properties?: Record<string, any>
  ): void {
    const from = this.concepts.get(fromId);
    const to = this.concepts.get(toId);

    if (!from || !to) {
      throw new Error('概念不存在');
    }

    const relationship: OntologyRelationship = {
      type,
      target: toId,
      properties,
    };

    from.relationships.push(relationship);

    // 同步到知识图谱
    if (this.kg) {
      this.kg.createEdge(fromId, toId, type, properties);
    }

    logger.debug('关系添加成功', { fromId, toId, type });
  }

  /**
   * 查询关系
   */
  queryRelationships(
    conceptId: UUID,
    relationshipType?: string
  ): OntologyRelationship[] {
    const concept = this.concepts.get(conceptId);
    if (!concept) return [];

    if (relationshipType) {
      return concept.relationships.filter((r) => r.type === relationshipType);
    }

    return concept.relationships;
  }

  /**
   * 语义匹配
   * 根据输入描述匹配最合适的概念
   */
  semanticMatch(description: string, conceptType?: string): OntologyConcept[] {
    const candidates = conceptType
      ? this.findConceptsByType(conceptType)
      : Array.from(this.concepts.values());

    // 简化的语义匹配（基于关键词）
    const keywords = description.toLowerCase().split(/\s+/);
    
    return candidates
      .map((concept) => {
        const conceptText = JSON.stringify(concept).toLowerCase();
        const score = keywords.reduce((acc, keyword) => {
          return acc + (conceptText.includes(keyword) ? 1 : 0);
        }, 0);
        return { concept, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.concept);
  }
}

/**
 * ETL 本体论助手
 * 专门处理 ETL 场景的本体论操作
 */
export class ETLOntologyHelper {
  private ontology: OntologyManager;

  constructor(ontology: OntologyManager) {
    this.ontology = ontology;
  }

  /**
   * 注册数据源
   */
  registerDataSource(
    name: string,
    type: string,
    connection: Record<string, any>,
    schema?: Record<string, any>
  ): UUID {
    return this.ontology.registerConcept({
      id: uuidv4(),
      name,
      type: ETLDomainOntology.CONCEPTS.DATA_SOURCE,
      properties: {
        sourceType: type,
        connection,
        schema,
      },
      relationships: [],
    });
  }

  /**
   * 注册转换规则
   */
  registerTransformation(
    name: string,
    transformType: string,
    logic: string,
    inputFields: string[],
    outputFields: string[]
  ): UUID {
    return this.ontology.registerConcept({
      id: uuidv4(),
      name,
      type: ETLDomainOntology.CONCEPTS.TRANSFORMATION,
      properties: {
        transformType,
        logic,
        inputFields,
        outputFields,
      },
      relationships: [],
    });
  }

  /**
   * 注册验证规则
   */
  registerValidationRule(
    name: string,
    condition: string,
    severity: 'error' | 'warning',
    errorMessage: string
  ): UUID {
    return this.ontology.registerConcept({
      id: uuidv4(),
      name,
      type: ETLDomainOntology.CONCEPTS.VALIDATION_RULE,
      properties: {
        condition,
        severity,
        errorMessage,
      },
      relationships: [],
    });
  }

  /**
   * 创建 ETL 流程
   */
  createETLFlow(
    sourceId: UUID,
    targetId: UUID,
    transformationIds: UUID[]
  ): UUID {
    const pipelineId = uuidv4();

    // 创建管道概念
    this.ontology.registerConcept({
      id: pipelineId,
      name: `Pipeline-${pipelineId.slice(0, 8)}`,
      type: ETLDomainOntology.CONCEPTS.PIPELINE,
      properties: {
        sourceId,
        targetId,
        transformationIds,
      },
      relationships: [],
    });

    // 建立关系
    for (const transformId of transformationIds) {
      this.ontology.addRelationship(
        sourceId,
        transformId,
        ETLDomainOntology.RELATIONSHIPS.TRANSFORMS
      );
      this.ontology.addRelationship(
        transformId,
        targetId,
        ETLDomainOntology.RELATIONSHIPS.LOADS_TO
      );
    }

    return pipelineId;
  }

  /**
   * 根据目标自动匹配转换规则
   */
  autoMatchTransformations(
    sourceSchema: Record<string, string>,
    targetSchema: Record<string, string>
  ): Array<{
    sourceField: string;
    targetField: string;
    suggestedTransformations: string[];
  }> {
    const mappings: Array<{
      sourceField: string;
      targetField: string;
      suggestedTransformations: string[];
    }> = [];

    for (const [sourceField, sourceType] of Object.entries(sourceSchema)) {
      for (const [targetField, targetType] of Object.entries(targetSchema)) {
        const transformations = this.suggestTransformations(sourceType, targetType);
        
        if (transformations.length > 0) {
          mappings.push({
            sourceField,
            targetField,
            suggestedTransformations: transformations,
          });
        }
      }
    }

    return mappings;
  }

  /**
   * 建议转换方式
   */
  private suggestTransformations(
    sourceType: string,
    targetType: string
  ): string[] {
    const suggestions: string[] = [];

    // 类型转换建议
    if (sourceType !== targetType) {
      suggestions.push(`cast_to_${targetType}`);
    }

    // 字符串相关
    if (sourceType === 'string' && targetType === 'string') {
      suggestions.push('trim', 'uppercase', 'lowercase', 'regex_extract');
    }

    // 日期相关
    if (sourceType.includes('date') || targetType.includes('date')) {
      suggestions.push('date_parse', 'date_format', 'date_diff');
    }

    // 数值相关
    if (['int', 'float', 'decimal', 'number'].some((t) => 
      sourceType.includes(t) || targetType.includes(t)
    )) {
      suggestions.push('round', 'abs', 'ceil', 'floor');
    }

    return suggestions;
  }

  /**
   * 获取数据血缘
   */
  getDataLineage(fieldId: UUID): {
    upstream: UUID[];
    downstream: UUID[];
    transformations: UUID[];
  } {
    const concept = this.ontology.getConcept(fieldId);
    if (!concept) {
      return { upstream: [], downstream: [], transformations: [] };
    }

    const upstream: UUID[] = [];
    const downstream: UUID[] = [];
    const transformations: UUID[] = [];

    for (const rel of concept.relationships) {
      if (rel.type === ETLDomainOntology.RELATIONSHIPS.EXTRACTS_FROM) {
        upstream.push(rel.target);
      } else if (rel.type === ETLDomainOntology.RELATIONSHIPS.LOADS_TO) {
        downstream.push(rel.target);
      } else if (rel.type === ETLDomainOntology.RELATIONSHIPS.TRANSFORMS) {
        transformations.push(rel.target);
      }
    }

    return { upstream, downstream, transformations };
  }
}

/**
 * 本体论层核心类
 */
export class OntologyLayer {
  private manager: OntologyManager;
  private etlHelper: ETLOntologyHelper;

  constructor(kg?: IKnowledgeGraph) {
    this.manager = new OntologyManager(kg);
    this.etlHelper = new ETLOntologyHelper(this.manager);
  }

  /**
   * 获取本体管理器
   */
  getManager(): OntologyManager {
    return this.manager;
  }

  /**
   * 获取 ETL 助手
   */
  getETLHelper(): ETLOntologyHelper {
    return this.etlHelper;
  }

  /**
   * 语义决策支持
   * 根据本体论知识辅助决策
   */
  semanticDecisionSupport(
    intent: string,
    context: Record<string, any>
  ): {
    relevantConcepts: OntologyConcept[];
    suggestedActions: string[];
    confidence: number;
  } {
    // 匹配相关概念
    const relevantConcepts = this.manager.semanticMatch(intent);

    // 基于匹配结果生成建议
    const suggestedActions: string[] = [];
    let confidence = 0;

    for (const concept of relevantConcepts.slice(0, 3)) {
      confidence += 0.3;

      if (concept.type === ETLDomainOntology.CONCEPTS.DATA_SOURCE) {
        suggestedActions.push(`连接数据源: ${concept.name}`);
      } else if (concept.type === ETLDomainOntology.CONCEPTS.TRANSFORMATION) {
        suggestedActions.push(`应用转换: ${concept.name}`);
      } else if (concept.type === ETLDomainOntology.CONCEPTS.VALIDATION_RULE) {
        suggestedActions.push(`启用验证: ${concept.name}`);
      }
    }

    return {
      relevantConcepts,
      suggestedActions: [...new Set(suggestedActions)],
      confidence: Math.min(confidence, 1.0),
    };
  }
}

export default OntologyLayer;
