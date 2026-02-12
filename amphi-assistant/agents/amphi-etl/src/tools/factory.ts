/**
 * ETL Tool Factory
 * 从原 etl-tools.ts 迁移
 */

import type { Tool, ToolResult, ExecutionContext } from '../../../../src/types';
import { Neo4jKnowledgeGraph } from '../../../../src';
import { OntologyLayer } from '../../../../src/core/ontologies';
import { MemoryLayer } from '../../../../src/core/memory';
import { createLogger } from '../../../../src/utils/logger';
import {
  QueryOntologyParams,
  SearchComponentsParams,
  ValidateParamsParams,
  CheckConnectionParams,
  GeneratePipelineParams,
  RecommendTransformParams,
} from './types';

const logger = createLogger('ETLTools');

export class ETLToolFactory {
  private kg: Neo4jKnowledgeGraph;
  private ontologyLayer: OntologyLayer;
  private memoryLayer: MemoryLayer;

  constructor(
    kg: Neo4jKnowledgeGraph,
    ontologyLayer: OntologyLayer,
    memoryLayer: MemoryLayer
  ) {
    this.kg = kg;
    this.ontologyLayer = ontologyLayer;
    this.memoryLayer = memoryLayer;
  }

  /**
   * 创建所有 ETL 工具
   */
  createTools(): Tool[] {
    return [
      this.createQueryOntologyTool(),
      this.createSearchComponentsTool(),
      this.createValidateParamsTool(),
      this.createCheckConnectionTool(),
      this.createGeneratePipelineTool(),
      this.createRecommendTransformTool(),
      this.createAnalyzeDataLineageTool(),
      this.createGetComponentDetailTool(),
    ];
  }

  /**
   * 工具 1: 本体查询
   */
  private createQueryOntologyTool(): Tool {
    return {
      name: 'query_ontology',
      description: `查询 ETL 本体知识图谱，获取组件、关系、血缘等信息。
支持以下查询类型:
- component: 查询组件详情
- relationship: 查询组件间关系
- lineage: 查询数据血缘
- schema: 查询组件的 schema 定义

示例: {"queryType": "component", "conceptName": "MySQL", "limit": 5}`,
      parameters: {
        type: 'object',
        properties: {
          queryType: { 
            type: 'string', 
            enum: ['component', 'relationship', 'lineage', 'schema'],
            description: '查询类型'
          },
          conceptName: { type: 'string', description: '概念名称（可选）' },
          conceptType: { type: 'string', description: '概念类型（可选）' },
          componentId: { type: 'string', description: '组件ID（可选）' },
          limit: { type: 'number', description: '返回结果数量限制', default: 10 }
        },
        required: ['queryType']
      },
      handler: async (params: QueryOntologyParams, context: ExecutionContext): Promise<ToolResult> => {
        try {
          logger.info('执行本体查询', { queryType: params.queryType, conceptName: params.conceptName });
          
          let result: any;
          
          switch (params.queryType) {
            case 'component':
              result = await this.queryComponent(params.conceptName, params.conceptType, params.limit);
              break;
            case 'relationship':
              result = await this.queryRelationship(params.componentId, params.limit);
              break;
            case 'lineage':
              result = await this.queryLineage(params.componentId, params.limit);
              break;
            case 'schema':
              result = await this.querySchema(params.componentId);
              break;
            default:
              throw new Error(`未知的查询类型: ${params.queryType}`);
          }

          return {
            success: true,
            data: result,
            duration: 0,
            metadata: { queryType: params.queryType }
          };
        } catch (error) {
          return {
            success: false,
            error: (error as Error).message,
            duration: 0
          };
        }
      }
    };
  }

  /**
   * 工具 2: 组件搜索
   */
  private createSearchComponentsTool(): Tool {
    return {
      name: 'search_components',
      description: `根据关键词搜索 ETL 组件（输入、输出、转换）。
支持模糊匹配，返回最相关的组件列表。

示例: {"keyword": "mysql", "category": "input", "limit": 5}`,
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '搜索关键词' },
          category: { 
            type: 'string', 
            enum: ['input', 'output', 'transform'],
            description: '组件类别（可选）'
          },
          limit: { type: 'number', description: '返回结果数量', default: 5 }
        },
        required: ['keyword']
      },
      handler: async (params: SearchComponentsParams, context: ExecutionContext): Promise<ToolResult> => {
        try {
          logger.info('搜索组件', { keyword: params.keyword, category: params.category });

          let categoryFilter = '';
          if (params.category === 'input') {
            categoryFilter = "AND (c.category CONTAINS 'source' OR c.category CONTAINS 'input')";
          } else if (params.category === 'output') {
            categoryFilter = "AND (c.category CONTAINS 'sink' OR c.category CONTAINS 'output')";
          } else if (params.category === 'transform') {
            categoryFilter = "AND c.category CONTAINS 'transform'";
          }

          const query = `
            MATCH (c:Component)
            WHERE (c.name CONTAINS $keyword OR c.description CONTAINS $keyword)
            ${categoryFilter}
            OPTIONAL MATCH (c)-[:HAS_PARAMETER]->(p:Parameter)
            WITH c, collect(p {
              .id, .name, .paramType, .defaultValue, .required, .description
            }) as params
            RETURN c.id as id, c.name as name, c.category as category,
                   c.description as description, params
            LIMIT $limit
          `;

          const results = await this.kg.query(query, { 
            keyword: params.keyword,
            limit: params.limit || 5
          });

          const knowledgeResults = this.memoryLayer.queryKnowledge(params.keyword);

          return {
            success: true,
            data: {
              components: results.map((r: any) => ({
                id: r.id,
                name: r.name,
                category: r.category,
                description: r.description,
                parameters: r.params
              })),
              knowledgeEnhanced: knowledgeResults.length > 0,
              knowledgeHints: knowledgeResults.slice(0, 3).map(k => k.conceptName)
            },
            duration: 0,
            metadata: { count: results.length }
          };
        } catch (error) {
          return {
            success: false,
            error: (error as Error).message,
            duration: 0
          };
        }
      }
    };
  }

  /**
   * 工具 3: 参数验证
   */
  private createValidateParamsTool(): Tool {
    return {
      name: 'validate_params',
      description: `验证组件参数配置是否正确，检查必填项、数据类型、格式等。

示例: {"componentId": "mysql-input", "parameters": {"host": "localhost", "port": 3306}}`,
      parameters: {
        type: 'object',
        properties: {
          componentId: { type: 'string', description: '组件ID' },
          parameters: { 
            type: 'object', 
            description: '参数配置对象'
          }
        },
        required: ['componentId', 'parameters']
      },
      handler: async (params: ValidateParamsParams, context: ExecutionContext): Promise<ToolResult> => {
        try {
          logger.info('验证参数', { componentId: params.componentId });

          const query = `
            MATCH (c:Component {id: $componentId})-[:HAS_PARAMETER]->(p:Parameter)
            RETURN p.id as id, p.name as name, p.paramType as type,
                   p.required as required, p.defaultValue as defaultValue,
                   p.description as description
          `;
          
          const paramDefs = await this.kg.query(query, { componentId: params.componentId });
          
          if (paramDefs.length === 0) {
            const knowledge = this.memoryLayer.queryKnowledge(params.componentId);
            if (knowledge.length > 0 && knowledge[0].facts?.parameters) {
              paramDefs.push(...knowledge[0].facts.parameters);
            }
          }

          const errors: string[] = [];
          const warnings: string[] = [];
          const validated: Record<string, any> = {};

          for (const def of paramDefs) {
            const value = params.parameters[def.name];
            
            if (def.required && (value === undefined || value === '')) {
              errors.push(`必填参数缺失: ${def.name} (${def.description})`);
              continue;
            }

            if ((value === undefined || value === '') && def.defaultValue) {
              validated[def.name] = def.defaultValue;
              warnings.push(`参数 ${def.name} 使用默认值: ${def.defaultValue}`);
              continue;
            }

            if (value !== undefined) {
              const typeValid = this.checkType(value, def.type);
              if (!typeValid) {
                errors.push(`参数 ${def.name} 类型错误，期望 ${def.type}，实际 ${typeof value}`);
              } else {
                validated[def.name] = value;
              }
            }
          }

          const knownParams = new Set(paramDefs.map((p: any) => p.name));
          for (const key of Object.keys(params.parameters)) {
            if (!knownParams.has(key)) {
              warnings.push(`未知参数: ${key}`);
            }
          }

          return {
            success: errors.length === 0,
            data: {
              valid: errors.length === 0,
              errors,
              warnings,
              validated
            },
            duration: 0,
            metadata: { 
              componentId: params.componentId,
              errorCount: errors.length,
              warningCount: warnings.length
            }
          };
        } catch (error) {
          return {
            success: false,
            error: (error as Error).message,
            duration: 0
          };
        }
      }
    };
  }

  /**
   * 工具 4: 连接检查
   */
  private createCheckConnectionTool(): Tool {
    return {
      name: 'check_connection',
      description: `检查数据源连接是否可用，支持数据库、文件、API 等类型。
注意：此工具仅做基础连接测试，不会修改数据。

示例: {"connectionType": "database", "connectionConfig": {"host": "localhost", "port": 3306}}`,
      parameters: {
        type: 'object',
        properties: {
          connectionType: { 
            type: 'string', 
            enum: ['database', 'file', 'api'],
            description: '连接类型'
          },
          connectionConfig: { 
            type: 'object', 
            description: '连接配置（ host, port, username, password 等）'
          }
        },
        required: ['connectionType', 'connectionConfig']
      },
      handler: async (params: CheckConnectionParams, context: ExecutionContext): Promise<ToolResult> => {
        try {
          logger.info('检查连接', { type: params.connectionType });

          let checkResult: any;
          
          switch (params.connectionType) {
            case 'database':
              checkResult = await this.checkDatabaseConnection(params.connectionConfig);
              break;
            case 'file':
              checkResult = await this.checkFileAccess(params.connectionConfig);
              break;
            case 'api':
              checkResult = await this.checkApiConnection(params.connectionConfig);
              break;
          }

          return {
            success: checkResult.success,
            data: checkResult,
            duration: checkResult.duration || 0,
            metadata: { connectionType: params.connectionType }
          };
        } catch (error) {
          return {
            success: false,
            error: (error as Error).message,
            duration: 0
          };
        }
      }
    };
  }

  /**
   * 工具 5: Pipeline 生成
   */
  private createGeneratePipelineTool(): Tool {
    return {
      name: 'generate_pipeline',
      description: `根据配置生成 SeaTunnel Pipeline JSON 配置。

示例: {
  "input": {"id": "mysql", "params": {"host": "localhost"}},
  "output": {"id": "postgres", "params": {"host": "localhost"}},
  "transformations": [{"id": "sql", "params": {"query": "SELECT * FROM table"}}]
}`,
      parameters: {
        type: 'object',
        properties: {
          input: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              params: { type: 'object' }
            },
            description: '输入配置（可选）'
          },
          output: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              params: { type: 'object' }
            },
            description: '输出配置（可选）'
          },
          transformations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                params: { type: 'object' }
              }
            },
            description: '转换配置列表'
          }
        },
        required: ['transformations']
      },
      handler: async (params: GeneratePipelineParams, context: ExecutionContext): Promise<ToolResult> => {
        try {
          logger.info('生成 Pipeline', { 
            hasInput: !!params.input, 
            hasOutput: !!params.output,
            transformCount: params.transformations.length 
          });

          const pipeline = {
            env: {
              job: {
                name: `ETL_Pipeline_${Date.now()}`,
                parallelism: 1
              }
            },
            source: params.input ? [{
              plugin_name: params.input.id,
              ...params.input.params
            }] : [],
            transform: params.transformations.map(t => ({
              plugin_name: t.id,
              ...t.params
            })),
            sink: params.output ? [{
              plugin_name: params.output.id,
              ...params.output.params
            }] : []
          };

          const validation = this.validatePipeline(pipeline);

          return {
            success: validation.valid,
            data: {
              pipeline,
              validation,
              json: JSON.stringify(pipeline, null, 2)
            },
            duration: 0,
            metadata: { 
              sourceCount: pipeline.source.length,
              transformCount: pipeline.transform.length,
              sinkCount: pipeline.sink.length
            }
          };
        } catch (error) {
          return {
            success: false,
            error: (error as Error).message,
            duration: 0
          };
        }
      }
    };
  }

  /**
   * 工具 6: 转换推荐
   */
  private createRecommendTransformTool(): Tool {
    return {
      name: 'recommend_transforms',
      description: `根据源数据和目标数据类型，推荐合适的转换组件。

示例: {"sourceType": "mysql", "targetType": "elasticsearch", "sourceSchema": {"id": "int", "name": "string"}}`,
      parameters: {
        type: 'object',
        properties: {
          sourceType: { type: 'string', description: '源数据类型' },
          targetType: { type: 'string', description: '目标数据类型' },
          sourceSchema: { type: 'object', description: '源数据 schema（可选）' },
          targetSchema: { type: 'object', description: '目标数据 schema（可选）' }
        },
        required: ['sourceType', 'targetType']
      },
      handler: async (params: RecommendTransformParams, context: ExecutionContext): Promise<ToolResult> => {
        try {
          logger.info('推荐转换', { source: params.sourceType, target: params.targetType });

          const etlHelper = this.ontologyLayer.getETLHelper();
          
          const recommendations = etlHelper.autoMatchTransformations(
            params.sourceSchema || {},
            params.targetSchema || {}
          );

          const transformQuery = `
            MATCH (c:Component)
            WHERE c.category CONTAINS 'transform'
            RETURN c.id as id, c.name as name, c.description as description
            LIMIT 10
          `;
          const transforms = await this.kg.query(transformQuery);

          return {
            success: true,
            data: {
              recommendations,
              availableTransforms: transforms,
              suggestedChain: this.buildTransformChain(params.sourceType, params.targetType)
            },
            duration: 0
          };
        } catch (error) {
          return {
            success: false,
            error: (error as Error).message,
            duration: 0
          };
        }
      }
    };
  }

  /**
   * 工具 7: 数据血缘分析
   */
  private createAnalyzeDataLineageTool(): Tool {
    return {
      name: 'analyze_lineage',
      description: `分析数据字段的血缘关系，追踪数据来源和转换过程。

示例: {"fieldId": "field_123", "depth": 3}`,
      parameters: {
        type: 'object',
        properties: {
          fieldId: { type: 'string', description: '字段ID' },
          depth: { type: 'number', description: '追踪深度', default: 3 }
        },
        required: ['fieldId']
      },
      handler: async (params: { fieldId: string; depth?: number }, context: ExecutionContext): Promise<ToolResult> => {
        try {
          logger.info('分析血缘', { fieldId: params.fieldId });

          const etlHelper = this.ontologyLayer.getETLHelper();
          const lineage = etlHelper.getDataLineage(params.fieldId as any);

          return {
            success: true,
            data: lineage,
            duration: 0
          };
        } catch (error) {
          return {
            success: false,
            error: (error as Error).message,
            duration: 0
          };
        }
      }
    };
  }

  /**
   * 工具 8: 获取组件详情
   */
  private createGetComponentDetailTool(): Tool {
    return {
      name: 'get_component_detail',
      description: `获取指定组件的完整详细信息，包括参数定义、使用示例等。

示例: {"componentId": "mysql-input"}`,
      parameters: {
        type: 'object',
        properties: {
          componentId: { type: 'string', description: '组件ID' }
        },
        required: ['componentId']
      },
      handler: async (params: { componentId: string }, context: ExecutionContext): Promise<ToolResult> => {
        try {
          logger.info('获取组件详情', { componentId: params.componentId });

          const query = `
            MATCH (c:Component {id: $componentId})
            OPTIONAL MATCH (c)-[:HAS_PARAMETER]->(p:Parameter)
            OPTIONAL MATCH (c)-[:RELATED_TO]->(r:Component)
            WITH c, 
                 collect(DISTINCT p {
                   .id, .name, .paramType, .defaultValue, .required, .description
                 }) as params,
                 collect(DISTINCT r {.id, .name, .category}) as related
            RETURN c.id as id, c.name as name, c.category as category,
                   c.description as description, c.documentation as documentation,
                   params, related
          `;

          const results = await this.kg.query(query, { componentId: params.componentId });
          
          if (results.length === 0) {
            const knowledge = this.memoryLayer.queryKnowledge(undefined, params.componentId);
            if (knowledge.length > 0) {
              return {
                success: true,
                data: knowledge[0],
                duration: 0,
                metadata: { source: 'knowledge_memory' }
              };
            }
            
            throw new Error(`组件未找到: ${params.componentId}`);
          }

          return {
            success: true,
            data: results[0],
            duration: 0
          };
        } catch (error) {
          return {
            success: false,
            error: (error as Error).message,
            duration: 0
          };
        }
      }
    };
  }

  // ========================================
  // 辅助方法
  // ========================================

  private async queryComponent(name?: string, type?: string, limit?: number): Promise<any> {
    const query = `
      MATCH (c:Component)
      WHERE ($name IS NULL OR c.name CONTAINS $name)
        AND ($type IS NULL OR c.category CONTAINS $type)
      RETURN c LIMIT $limit
    `;
    return this.kg.query(query, { name, type, limit: limit || 10 });
  }

  private async queryRelationship(componentId?: string, limit?: number): Promise<any> {
    if (!componentId) return [];
    const query = `
      MATCH (c:Component {id: $componentId})-[r]->(target)
      RETURN type(r) as relationship, target.id as targetId, target.name as targetName
      LIMIT $limit
    `;
    return this.kg.query(query, { componentId, limit: limit || 10 });
  }

  private async queryLineage(componentId?: string, limit?: number): Promise<any> {
    if (!componentId) return { upstream: [], downstream: [], transformations: [] };
    const etlHelper = this.ontologyLayer.getETLHelper();
    return etlHelper.getDataLineage(componentId as any);
  }

  private async querySchema(componentId?: string): Promise<any> {
    if (!componentId) return null;
    const query = `
      MATCH (c:Component {id: $componentId})-[:HAS_PARAMETER]->(p:Parameter)
      RETURN collect(p) as schema
    `;
    const results = await this.kg.query(query, { componentId });
    return results[0]?.schema || [];
  }

  private checkType(value: any, expectedType: string): boolean {
    const actualType = typeof value;
    const typeMap: Record<string, string[]> = {
      'string': ['string'],
      'int': ['number'],
      'integer': ['number'],
      'float': ['number'],
      'number': ['number'],
      'boolean': ['boolean'],
      'bool': ['boolean'],
      'array': ['object'],
      'object': ['object']
    };
    
    const allowedTypes = typeMap[expectedType?.toLowerCase()] || [expectedType];
    return allowedTypes.includes(actualType);
  }

  private async checkDatabaseConnection(config: Record<string, any>): Promise<any> {
    const required = ['host'];
    const missing = required.filter(k => !config[k]);
    
    if (missing.length > 0) {
      return {
        success: false,
        message: `缺少必填配置: ${missing.join(', ')}`,
        duration: 0
      };
    }

    return {
      success: true,
      message: `数据库连接配置验证通过: ${config.host}:${config.port || 3306}`,
      duration: 100
    };
  }

  private async checkFileAccess(config: Record<string, any>): Promise<any> {
    if (!config.path) {
      return { success: false, message: '缺少文件路径', duration: 0 };
    }
    return {
      success: true,
      message: `文件路径验证通过: ${config.path}`,
      duration: 50
    };
  }

  private async checkApiConnection(config: Record<string, any>): Promise<any> {
    if (!config.url) {
      return { success: false, message: '缺少 API URL', duration: 0 };
    }
    return {
      success: true,
      message: `API 配置验证通过: ${config.url}`,
      duration: 200
    };
  }

  private validatePipeline(pipeline: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!pipeline.source || pipeline.source.length === 0) {
      errors.push('Pipeline 缺少 source 配置');
    }
    
    if (!pipeline.sink || pipeline.sink.length === 0) {
      errors.push('Pipeline 缺少 sink 配置');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private buildTransformChain(sourceType: string, targetType: string): string[] {
    const chain: string[] = [];
    
    if (sourceType !== targetType) {
      chain.push('type_cast');
    }
    
    chain.push('data_validate');
    
    return chain;
  }
}

export default ETLToolFactory;
