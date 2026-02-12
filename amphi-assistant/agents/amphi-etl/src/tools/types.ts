/**
 * ETL 工具参数类型定义
 * 从原 etl-tools.ts 提取
 * 
 * 注意：此文件保留在 tools/ 目录用于工具相关类型
 * 通用类型请从 ../types/index.ts 导入
 */

export interface QueryOntologyParams {
  queryType: 'component' | 'relationship' | 'lineage' | 'schema';
  conceptName?: string;
  conceptType?: string;
  componentId?: string;
  limit?: number;
}

export interface SearchComponentsParams {
  keyword: string;
  category?: 'input' | 'output' | 'transform';
  limit?: number;
}

export interface ValidateParamsParams {
  componentId: string;
  parameters: Record<string, any>;
}

export interface CheckConnectionParams {
  connectionType: 'database' | 'file' | 'api';
  connectionConfig: Record<string, any>;
}

export interface GeneratePipelineParams {
  input?: { id: string; params: Record<string, any> };
  output?: { id: string; params: Record<string, any> };
  transformations: Array<{ id: string; params: Record<string, any> }>;
}

export interface RecommendTransformParams {
  sourceType: string;
  targetType: string;
  sourceSchema?: Record<string, string>;
  targetSchema?: Record<string, string>;
}
