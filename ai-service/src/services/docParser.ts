/**
 * Doc Parser - 节点文档解析器
 * 
 * 负责解析 Markdown/YAML 格式的节点说明文档：
 * - 提取节点类型、参数、输入/输出规范
 * - 缓存解析结果
 * - 支持从文件或字符串解析
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// 参数规格
export interface ParamSpec {
  key: string;
  type: string;
  required: boolean;
  default?: any;
  pattern?: string;
  description?: string;
  enum?: string[];
}

// 输入/输出规格
export interface IOSpec {
  name: string;
  type: 'dataframe' | 'stream' | 'blob' | 'any';
  description?: string;
}

// 约束规格
export interface ConstraintSpec {
  requires?: string[];
  incompatible?: string[];
  maxInputs?: number;
  maxOutputs?: number;
}

// 节点规格（规范化模型）
export interface NodeSpec {
  id: string;
  name: string;
  category: 'inputs' | 'transforms' | 'outputs' | 'unstructured';
  description?: string;
  params: ParamSpec[];
  inputs: IOSpec[];
  outputs: IOSpec[];
  constraints?: ConstraintSpec;
  examples?: string[];
  tags?: string[];
}

// 解析结果
export interface ParseResult {
  success: boolean;
  nodes: NodeSpec[];
  errors?: string[];
}

// 内置节点库（基于 Amphi ETL 已有组件）
const BUILTIN_NODES: NodeSpec[] = [
  // ========== 输入组件 ==========
  {
    id: 'csvFileInput',
    name: 'CSV 文件输入',
    category: 'inputs',
    description: '从 CSV 文件读取数据',
    params: [
      { key: 'filePath', type: 'string', required: true, description: 'CSV 文件路径' },
      { key: 'delimiter', type: 'string', required: false, default: ',', description: '分隔符' },
      { key: 'encoding', type: 'string', required: false, default: 'utf-8', description: '文件编码' },
      { key: 'hasHeader', type: 'boolean', required: false, default: true, description: '是否有表头' }
    ],
    inputs: [],
    outputs: [{ name: 'out', type: 'dataframe', description: '输出数据框' }],
    tags: ['文件', 'CSV', '输入']
  },
  {
    id: 'jsonFileInput',
    name: 'JSON 文件输入',
    category: 'inputs',
    description: '从 JSON 文件读取数据',
    params: [
      { key: 'filePath', type: 'string', required: true, description: 'JSON 文件路径' },
      { key: 'jsonPath', type: 'string', required: false, description: 'JSON 路径表达式' }
    ],
    inputs: [],
    outputs: [{ name: 'out', type: 'dataframe', description: '输出数据框' }],
    tags: ['文件', 'JSON', '输入']
  },
  {
    id: 'mySQLInput',
    name: 'MySQL 数据库输入',
    category: 'inputs',
    description: '从 MySQL 数据库读取数据',
    params: [
      { key: 'host', type: 'string', required: true, description: '数据库主机' },
      { key: 'port', type: 'number', required: false, default: 3306, description: '端口' },
      { key: 'database', type: 'string', required: true, description: '数据库名' },
      { key: 'username', type: 'string', required: true, description: '用户名' },
      { key: 'password', type: 'string', required: true, description: '密码' },
      { key: 'table', type: 'string', required: false, description: '表名' },
      { key: 'query', type: 'string', required: false, description: 'SQL 查询语句' }
    ],
    inputs: [],
    outputs: [{ name: 'out', type: 'dataframe', description: '输出数据框' }],
    tags: ['数据库', 'MySQL', '输入']
  },
  {
    id: 'postgresInput',
    name: 'PostgreSQL 数据库输入',
    category: 'inputs',
    description: '从 PostgreSQL 数据库读取数据',
    params: [
      { key: 'host', type: 'string', required: true, description: '数据库主机' },
      { key: 'port', type: 'number', required: false, default: 5432, description: '端口' },
      { key: 'database', type: 'string', required: true, description: '数据库名' },
      { key: 'username', type: 'string', required: true, description: '用户名' },
      { key: 'password', type: 'string', required: true, description: '密码' },
      { key: 'table', type: 'string', required: false, description: '表名' },
      { key: 'query', type: 'string', required: false, description: 'SQL 查询语句' }
    ],
    inputs: [],
    outputs: [{ name: 'out', type: 'dataframe', description: '输出数据框' }],
    tags: ['数据库', 'PostgreSQL', '输入']
  },
  {
    id: 'apiInput',
    name: 'API 数据源输入',
    category: 'inputs',
    description: '从 REST API 获取数据',
    params: [
      { key: 'url', type: 'string', required: true, pattern: '^https?://', description: 'API URL' },
      { key: 'method', type: 'string', required: false, default: 'GET', enum: ['GET', 'POST'], description: 'HTTP 方法' },
      { key: 'headers', type: 'object', required: false, description: '请求头' },
      { key: 'body', type: 'string', required: false, description: '请求体' },
      { key: 'authType', type: 'string', required: false, enum: ['none', 'api_key', 'bearer', 'basic'], description: '认证方式' }
    ],
    inputs: [],
    outputs: [{ name: 'out', type: 'dataframe', description: '输出数据框' }],
    tags: ['API', 'REST', '输入']
  },

  // ========== 转换组件 ==========
  {
    id: 'filter',
    name: '数据过滤',
    category: 'transforms',
    description: '根据条件过滤数据行',
    params: [
      { key: 'condition', type: 'string', required: true, description: '过滤条件表达式' }
    ],
    inputs: [{ name: 'in', type: 'dataframe', description: '输入数据框' }],
    outputs: [{ name: 'out', type: 'dataframe', description: '过滤后的数据框' }],
    tags: ['转换', '过滤']
  },
  {
    id: 'aggregate',
    name: '数据聚合',
    category: 'transforms',
    description: '对数据进行分组聚合',
    params: [
      { key: 'groupBy', type: 'array', required: true, description: '分组字段' },
      { key: 'aggregations', type: 'array', required: true, description: '聚合操作列表' }
    ],
    inputs: [{ name: 'in', type: 'dataframe', description: '输入数据框' }],
    outputs: [{ name: 'out', type: 'dataframe', description: '聚合后的数据框' }],
    tags: ['转换', '聚合', '分组']
  },
  {
    id: 'join',
    name: '数据连接',
    category: 'transforms',
    description: '连接两个数据源',
    params: [
      { key: 'joinType', type: 'string', required: false, default: 'inner', enum: ['inner', 'left', 'right', 'outer'], description: '连接类型' },
      { key: 'leftKey', type: 'string', required: true, description: '左表连接键' },
      { key: 'rightKey', type: 'string', required: true, description: '右表连接键' }
    ],
    inputs: [
      { name: 'left', type: 'dataframe', description: '左输入数据框' },
      { name: 'right', type: 'dataframe', description: '右输入数据框' }
    ],
    outputs: [{ name: 'out', type: 'dataframe', description: '连接后的数据框' }],
    constraints: { maxInputs: 2 },
    tags: ['转换', '连接', 'Join']
  },
  {
    id: 'sort',
    name: '数据排序',
    category: 'transforms',
    description: '对数据进行排序',
    params: [
      { key: 'sortBy', type: 'array', required: true, description: '排序字段' },
      { key: 'ascending', type: 'boolean', required: false, default: true, description: '是否升序' }
    ],
    inputs: [{ name: 'in', type: 'dataframe', description: '输入数据框' }],
    outputs: [{ name: 'out', type: 'dataframe', description: '排序后的数据框' }],
    tags: ['转换', '排序']
  },
  {
    id: 'rename',
    name: '字段重命名',
    category: 'transforms',
    description: '重命名数据字段',
    params: [
      { key: 'mappings', type: 'object', required: true, description: '字段映射 {旧名: 新名}' }
    ],
    inputs: [{ name: 'in', type: 'dataframe', description: '输入数据框' }],
    outputs: [{ name: 'out', type: 'dataframe', description: '重命名后的数据框' }],
    tags: ['转换', '重命名']
  },
  {
    id: 'typeConverter',
    name: '类型转换',
    category: 'transforms',
    description: '转换字段数据类型',
    params: [
      { key: 'conversions', type: 'object', required: true, description: '类型转换配置 {字段: 目标类型}' }
    ],
    inputs: [{ name: 'in', type: 'dataframe', description: '输入数据框' }],
    outputs: [{ name: 'out', type: 'dataframe', description: '转换后的数据框' }],
    tags: ['转换', '类型']
  },
  {
    id: 'selectColumns',
    name: '字段选择',
    category: 'transforms',
    description: '选择或排除指定字段',
    params: [
      { key: 'columns', type: 'array', required: true, description: '要选择的字段列表' },
      { key: 'mode', type: 'string', required: false, default: 'include', enum: ['include', 'exclude'], description: '选择模式' }
    ],
    inputs: [{ name: 'in', type: 'dataframe', description: '输入数据框' }],
    outputs: [{ name: 'out', type: 'dataframe', description: '选择后的数据框' }],
    tags: ['转换', '选择', '字段']
  },

  // ========== 输出组件 ==========
  {
    id: 'csvFileOutput',
    name: 'CSV 文件输出',
    category: 'outputs',
    description: '将数据写入 CSV 文件',
    params: [
      { key: 'filePath', type: 'string', required: true, description: 'CSV 文件路径' },
      { key: 'delimiter', type: 'string', required: false, default: ',', description: '分隔符' },
      { key: 'encoding', type: 'string', required: false, default: 'utf-8', description: '文件编码' },
      { key: 'includeHeader', type: 'boolean', required: false, default: true, description: '是否包含表头' }
    ],
    inputs: [{ name: 'in', type: 'dataframe', description: '输入数据框' }],
    outputs: [],
    tags: ['文件', 'CSV', '输出']
  },
  {
    id: 'jsonFileOutput',
    name: 'JSON 文件输出',
    category: 'outputs',
    description: '将数据写入 JSON 文件',
    params: [
      { key: 'filePath', type: 'string', required: true, description: 'JSON 文件路径' },
      { key: 'orient', type: 'string', required: false, default: 'records', enum: ['records', 'columns', 'index'], description: 'JSON 格式' }
    ],
    inputs: [{ name: 'in', type: 'dataframe', description: '输入数据框' }],
    outputs: [],
    tags: ['文件', 'JSON', '输出']
  },
  {
    id: 'mySQLOutput',
    name: 'MySQL 数据库输出',
    category: 'outputs',
    description: '将数据写入 MySQL 数据库',
    params: [
      { key: 'host', type: 'string', required: true, description: '数据库主机' },
      { key: 'port', type: 'number', required: false, default: 3306, description: '端口' },
      { key: 'database', type: 'string', required: true, description: '数据库名' },
      { key: 'username', type: 'string', required: true, description: '用户名' },
      { key: 'password', type: 'string', required: true, description: '密码' },
      { key: 'table', type: 'string', required: true, description: '目标表名' },
      { key: 'ifExists', type: 'string', required: false, default: 'append', enum: ['fail', 'replace', 'append'], description: '如果表存在时的处理方式' }
    ],
    inputs: [{ name: 'in', type: 'dataframe', description: '输入数据框' }],
    outputs: [],
    tags: ['数据库', 'MySQL', '输出']
  },
  {
    id: 'postgresOutput',
    name: 'PostgreSQL 数据库输出',
    category: 'outputs',
    description: '将数据写入 PostgreSQL 数据库',
    params: [
      { key: 'host', type: 'string', required: true, description: '数据库主机' },
      { key: 'port', type: 'number', required: false, default: 5432, description: '端口' },
      { key: 'database', type: 'string', required: true, description: '数据库名' },
      { key: 'username', type: 'string', required: true, description: '用户名' },
      { key: 'password', type: 'string', required: true, description: '密码' },
      { key: 'table', type: 'string', required: true, description: '目标表名' },
      { key: 'ifExists', type: 'string', required: false, default: 'append', enum: ['fail', 'replace', 'append'], description: '如果表存在时的处理方式' }
    ],
    inputs: [{ name: 'in', type: 'dataframe', description: '输入数据框' }],
    outputs: [],
    tags: ['数据库', 'PostgreSQL', '输出']
  }
];

// 节点缓存
const nodeCache = new Map<string, NodeSpec[]>();

/**
 * Doc Parser 类
 */
export class DocParser {
  /**
   * 获取所有内置节点
   */
  static getBuiltinNodes(): NodeSpec[] {
    return [...BUILTIN_NODES];
  }

  /**
   * 根据 ID 获取节点
   */
  static getNodeById(id: string): NodeSpec | undefined {
    return BUILTIN_NODES.find(n => n.id === id);
  }

  /**
   * 根据分类获取节点
   */
  static getNodesByCategory(category: NodeSpec['category']): NodeSpec[] {
    return BUILTIN_NODES.filter(n => n.category === category);
  }

  /**
   * 根据标签搜索节点
   */
  static searchNodes(query: string): NodeSpec[] {
    const lowerQuery = query.toLowerCase();
    return BUILTIN_NODES.filter(n =>
      n.name.toLowerCase().includes(lowerQuery) ||
      n.description?.toLowerCase().includes(lowerQuery) ||
      n.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * 解析 Markdown 格式的节点文档
   */
  static parseMarkdown(content: string): ParseResult {
    const nodes: NodeSpec[] = [];
    const errors: string[] = [];

    try {
      // 按标题分割
      const sections = content.split(/^##\s+/m).filter(s => s.trim());

      for (const section of sections) {
        const lines = section.trim().split('\n');
        const name = lines[0]?.trim();
        if (!name) continue;

        const node: Partial<NodeSpec> = {
          id: this.generateId(name),
          name,
          category: 'transforms',
          params: [],
          inputs: [],
          outputs: []
        };

        // 解析参数表格
        const tableMatch = section.match(/\|.*\|[\s\S]*?\|/g);
        if (tableMatch) {
          for (const row of tableMatch) {
            const cells = row.split('|').map(c => c.trim()).filter(c => c);
            if (cells.length >= 3 && cells[0] !== '参数' && cells[0] !== '---') {
              node.params!.push({
                key: cells[0],
                type: cells[1] || 'string',
                required: cells[2]?.toLowerCase() === 'true' || cells[2]?.toLowerCase() === '是',
                description: cells[3] || ''
              });
            }
          }
        }

        // 解析分类
        if (section.toLowerCase().includes('输入') || section.toLowerCase().includes('input')) {
          node.category = 'inputs';
          node.outputs = [{ name: 'out', type: 'dataframe' }];
        } else if (section.toLowerCase().includes('输出') || section.toLowerCase().includes('output')) {
          node.category = 'outputs';
          node.inputs = [{ name: 'in', type: 'dataframe' }];
        } else {
          node.inputs = [{ name: 'in', type: 'dataframe' }];
          node.outputs = [{ name: 'out', type: 'dataframe' }];
        }

        nodes.push(node as NodeSpec);
      }
    } catch (error: any) {
      errors.push(`Markdown 解析错误: ${error.message}`);
    }

    return {
      success: errors.length === 0,
      nodes,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * 解析 YAML 格式的节点文档
   */
  static parseYaml(content: string): ParseResult {
    const nodes: NodeSpec[] = [];
    const errors: string[] = [];

    try {
      const docs = yaml.loadAll(content) as any[];

      for (const doc of docs) {
        if (!doc || typeof doc !== 'object') continue;

        // 如果是节点数组
        if (Array.isArray(doc)) {
          for (const item of doc) {
            const node = this.parseYamlNode(item);
            if (node) nodes.push(node);
          }
        } else if (doc.nodes && Array.isArray(doc.nodes)) {
          // 如果有 nodes 字段
          for (const item of doc.nodes) {
            const node = this.parseYamlNode(item);
            if (node) nodes.push(node);
          }
        } else {
          // 单个节点
          const node = this.parseYamlNode(doc);
          if (node) nodes.push(node);
        }
      }
    } catch (error: any) {
      errors.push(`YAML 解析错误: ${error.message}`);
    }

    return {
      success: errors.length === 0,
      nodes,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * 解析单个 YAML 节点
   */
  private static parseYamlNode(doc: any): NodeSpec | null {
    if (!doc || !doc.id) return null;

    return {
      id: doc.id,
      name: doc.name || doc.id,
      category: doc.category || 'transforms',
      description: doc.description,
      params: (doc.params || []).map((p: any) => ({
        key: p.key || p.name,
        type: p.type || 'string',
        required: p.required ?? false,
        default: p.default,
        pattern: p.pattern,
        description: p.description,
        enum: p.enum
      })),
      inputs: (doc.inputs || []).map((i: any) => ({
        name: i.name || 'in',
        type: i.type || 'dataframe',
        description: i.description
      })),
      outputs: (doc.outputs || []).map((o: any) => ({
        name: o.name || 'out',
        type: o.type || 'dataframe',
        description: o.description
      })),
      constraints: doc.constraints,
      examples: doc.examples,
      tags: doc.tags
    };
  }

  /**
   * 从文件解析节点文档
   */
  static parseFile(filePath: string): ParseResult {
    const cacheKey = filePath;

    // 检查缓存
    if (nodeCache.has(cacheKey)) {
      return {
        success: true,
        nodes: nodeCache.get(cacheKey)!
      };
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const ext = path.extname(filePath).toLowerCase();

      let result: ParseResult;
      if (ext === '.yaml' || ext === '.yml') {
        result = this.parseYaml(content);
      } else if (ext === '.md') {
        result = this.parseMarkdown(content);
      } else {
        return {
          success: false,
          nodes: [],
          errors: [`不支持的文件格式: ${ext}`]
        };
      }

      // 缓存结果
      if (result.success) {
        nodeCache.set(cacheKey, result.nodes);
      }

      return result;
    } catch (error: any) {
      return {
        success: false,
        nodes: [],
        errors: [`文件读取错误: ${error.message}`]
      };
    }
  }

  /**
   * 根据用户需求匹配节点
   */
  static matchNodes(requirement: string): NodeSpec[] {
    const lowerReq = requirement.toLowerCase();
    const matched: NodeSpec[] = [];
    const scores = new Map<string, number>();

    for (const node of BUILTIN_NODES) {
      let score = 0;

      // 名称匹配
      if (lowerReq.includes(node.name.toLowerCase())) {
        score += 10;
      }

      // ID 匹配
      if (lowerReq.includes(node.id.toLowerCase())) {
        score += 10;
      }

      // 标签匹配
      for (const tag of node.tags || []) {
        if (lowerReq.includes(tag.toLowerCase())) {
          score += 5;
        }
      }

      // 描述关键词匹配
      const descWords = (node.description || '').toLowerCase().split(/\s+/);
      for (const word of descWords) {
        if (word.length > 2 && lowerReq.includes(word)) {
          score += 2;
        }
      }

      if (score > 0) {
        scores.set(node.id, score);
        matched.push(node);
      }
    }

    // 按分数排序
    matched.sort((a, b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0));

    return matched;
  }

  /**
   * 生成节点 ID
   */
  private static generateId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * 清除缓存
   */
  static clearCache(): void {
    nodeCache.clear();
  }
}

export default DocParser;
