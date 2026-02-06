/**
 * 本体数据模型：节点类型与关系类型常量、DTO
 * 对应功能规划文档中的 Component / Parameter / DataType / Category 及关系
 */

// ---------- 节点标签 ----------
export const NODE_LABELS = {
  Component: 'Component',
  Parameter: 'Parameter',
  DataType: 'DataType',
  Category: 'Category',
} as const;

// ---------- 关系类型 ----------
export const REL_TYPES = {
  HAS_PARAMETER: 'HAS_PARAMETER',
  ACCEPTS_INPUT: 'ACCEPTS_INPUT',
  PRODUCES_OUTPUT: 'PRODUCES_OUTPUT',
  CAN_FOLLOW: 'CAN_FOLLOW',
  BELONGS_TO_CATEGORY: 'BELONGS_TO_CATEGORY',
  PARAMETER_TYPE: 'PARAMETER_TYPE',
  OPTION_OF: 'OPTION_OF',
} as const;

// ---------- DTO ----------
export interface ComponentNode {
  id: string;
  name: string;
  displayName?: string;  // 展示名，可设为中文，图谱默认显示此项
  description?: string;
  category?: string;
  pipelineType?: string; // 对应前端 type，如 pandas_df_input
  source?: string;       // 来源文件路径
}

export interface ParameterNode {
  id: string;
  name: string;
  displayName?: string;  // 展示名，可设为中文，图谱默认显示此项
  paramType: string;     // input | select | radio | codeTextarea | ...
  defaultValue?: unknown;
  required?: boolean;
  description?: string;
  options?: Array<{ value: string; label?: string }>;
  advanced?: boolean;
  condition?: Record<string, unknown>;
}

export interface DataTypeNode {
  id: string;
  name: string;
}

export interface CategoryNode {
  id: string;
  name: string;
}

export interface RelationshipCreate {
  fromId: string;
  toId: string;
  type: keyof typeof REL_TYPES;
  fromLabel?: keyof typeof NODE_LABELS;
  toLabel?: keyof typeof NODE_LABELS;
  properties?: Record<string, unknown>;
}

export interface GraphForViz {
  nodes: Array<{ id: string; label: string; type: string; data?: Record<string, unknown> }>;
  edges: Array<{ id: string; source: string; target: string; type: string; displayName?: string }>;
}

export interface OntologySearchResult {
  components: ComponentNode[];
  parameters: ParameterNode[];
  total: number;
}
