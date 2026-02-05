/**
 * Validator - Pipeline 验证服务
 * 
 * 负责验证 Pipeline 配置：
 * - 语法校验（JSON Schema）
 * - 逻辑校验（DAG、类型匹配、参数验证）
 * - 生成验证报告
 * - 提供自动修复建议
 */

import { DocParser, NodeSpec } from './docParser';
import { PipelineModel, PipelineNode, PipelineEdge } from './graphBuilder';

// 验证错误级别
export type ValidationLevel = 'error' | 'warning' | 'info';

// 验证问题
export interface ValidationIssue {
  level: ValidationLevel;
  code: string;
  message: string;
  path?: string;         // JSON Path
  nodeId?: string;       // 相关节点 ID
  field?: string;        // 相关字段
  suggestion?: string;   // 修复建议
  autoFix?: AutoFix;     // 自动修复配置
}

// 自动修复配置
export interface AutoFix {
  type: 'set_value' | 'remove_edge' | 'add_default' | 'rename_field';
  path: string;
  value?: any;
}

// 验证结果
export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
  fixable: boolean;      // 是否可自动修复
}

// JSON Schema for .ampln format
const AMPLN_SCHEMA = {
  type: 'object',
  required: ['name', 'version', 'nodes', 'edges'],
  properties: {
    name: { type: 'string', minLength: 1 },
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'type', 'position', 'data'],
        properties: {
          id: { type: 'string', minLength: 1 },
          type: { type: 'string', minLength: 1 },
          position: {
            type: 'object',
            required: ['x', 'y'],
            properties: {
              x: { type: 'number' },
              y: { type: 'number' }
            }
          },
          data: { type: 'object' }
        }
      }
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'source', 'target'],
        properties: {
          id: { type: 'string', minLength: 1 },
          source: { type: 'string', minLength: 1 },
          target: { type: 'string', minLength: 1 },
          sourceHandle: { type: 'string' },
          targetHandle: { type: 'string' }
        }
      }
    },
    variables: { type: 'object' }
  }
};

/**
 * Validator 类
 */
export class Validator {
  /**
   * 完整验证 Pipeline
   */
  static validate(pipeline: PipelineModel): ValidationResult {
    const issues: ValidationIssue[] = [];

    console.log('\n========== [Validator] 开始验证 Pipeline ==========');
    console.log('Pipeline 名称:', pipeline.name);
    console.log('节点数:', pipeline.nodes?.length || 0);
    console.log('边数:', pipeline.edges?.length || 0);

    // 1. 语法验证
    const syntaxIssues = this.validateSyntax(pipeline);
    issues.push(...syntaxIssues);

    // 2. 结构验证（仅当语法正确时）
    if (syntaxIssues.filter(i => i.level === 'error').length === 0) {
      const structureIssues = this.validateStructure(pipeline);
      issues.push(...structureIssues);
    }

    // 3. 逻辑验证
    const logicIssues = this.validateLogic(pipeline);
    issues.push(...logicIssues);

    // 4. 参数验证
    const paramIssues = this.validateParams(pipeline);
    issues.push(...paramIssues);

    // 统计结果
    const summary = {
      errors: issues.filter(i => i.level === 'error').length,
      warnings: issues.filter(i => i.level === 'warning').length,
      infos: issues.filter(i => i.level === 'info').length
    };

    const fixable = issues.some(i => i.autoFix);

    console.log('[Validator] 验证结果:', summary);
    console.log('========== [Validator] 验证结束 ==========\n');

    return {
      valid: summary.errors === 0,
      issues,
      summary,
      fixable
    };
  }

  /**
   * 语法验证
   */
  private static validateSyntax(pipeline: PipelineModel): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // 检查必填字段
    if (!pipeline.name || typeof pipeline.name !== 'string') {
      issues.push({
        level: 'error',
        code: 'MISSING_NAME',
        message: 'Pipeline 缺少名称',
        path: '$.name',
        suggestion: '添加 name 字段',
        autoFix: { type: 'set_value', path: '$.name', value: 'untitled_pipeline' }
      });
    }

    if (!pipeline.version || typeof pipeline.version !== 'string') {
      issues.push({
        level: 'error',
        code: 'MISSING_VERSION',
        message: 'Pipeline 缺少版本号',
        path: '$.version',
        suggestion: '添加 version 字段，格式如 1.0.0',
        autoFix: { type: 'set_value', path: '$.version', value: '1.0.0' }
      });
    } else if (!/^\d+\.\d+\.\d+$/.test(pipeline.version)) {
      issues.push({
        level: 'warning',
        code: 'INVALID_VERSION_FORMAT',
        message: `版本号格式不正确: ${pipeline.version}`,
        path: '$.version',
        suggestion: '使用 semver 格式，如 1.0.0'
      });
    }

    if (!pipeline.nodes || !Array.isArray(pipeline.nodes)) {
      issues.push({
        level: 'error',
        code: 'MISSING_NODES',
        message: 'Pipeline 缺少 nodes 数组',
        path: '$.nodes',
        suggestion: '添加 nodes 数组',
        autoFix: { type: 'set_value', path: '$.nodes', value: [] }
      });
    }

    if (!pipeline.edges || !Array.isArray(pipeline.edges)) {
      issues.push({
        level: 'warning',
        code: 'MISSING_EDGES',
        message: 'Pipeline 缺少 edges 数组',
        path: '$.edges',
        suggestion: '添加 edges 数组',
        autoFix: { type: 'set_value', path: '$.edges', value: [] }
      });
    }

    return issues;
  }

  /**
   * 结构验证
   */
  private static validateStructure(pipeline: PipelineModel): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const nodeIds = new Set<string>();

    // 验证节点结构
    for (let i = 0; i < (pipeline.nodes || []).length; i++) {
      const node = pipeline.nodes[i];
      const path = `$.nodes[${i}]`;

      // 检查节点 ID
      if (!node.id) {
        issues.push({
          level: 'error',
          code: 'MISSING_NODE_ID',
          message: `节点 [${i}] 缺少 id`,
          path: `${path}.id`,
          nodeId: `node_${i}`,
          suggestion: '添加唯一的节点 ID'
        });
      } else if (nodeIds.has(node.id)) {
        issues.push({
          level: 'error',
          code: 'DUPLICATE_NODE_ID',
          message: `节点 ID 重复: ${node.id}`,
          path: `${path}.id`,
          nodeId: node.id,
          suggestion: '确保每个节点 ID 唯一'
        });
      } else {
        nodeIds.add(node.id);
      }

      // 检查节点类型
      if (!node.type) {
        issues.push({
          level: 'error',
          code: 'MISSING_NODE_TYPE',
          message: `节点 ${node.id || i} 缺少 type`,
          path: `${path}.type`,
          nodeId: node.id,
          suggestion: '指定节点类型'
        });
      }

      // 检查节点位置
      if (!node.position || typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
        issues.push({
          level: 'warning',
          code: 'INVALID_POSITION',
          message: `节点 ${node.id || i} 位置信息不完整`,
          path: `${path}.position`,
          nodeId: node.id,
          suggestion: '添加 position: { x: number, y: number }',
          autoFix: { type: 'set_value', path: `${path}.position`, value: { x: 100 + i * 200, y: 100 } }
        });
      }

      // 检查节点数据
      if (!node.data || typeof node.data !== 'object') {
        issues.push({
          level: 'warning',
          code: 'MISSING_NODE_DATA',
          message: `节点 ${node.id || i} 缺少 data`,
          path: `${path}.data`,
          nodeId: node.id,
          suggestion: '添加 data 对象',
          autoFix: { type: 'set_value', path: `${path}.data`, value: {} }
        });
      }
    }

    // 验证边结构
    for (let i = 0; i < (pipeline.edges || []).length; i++) {
      const edge = pipeline.edges[i];
      const path = `$.edges[${i}]`;

      if (!edge.id) {
        issues.push({
          level: 'warning',
          code: 'MISSING_EDGE_ID',
          message: `边 [${i}] 缺少 id`,
          path: `${path}.id`,
          suggestion: '添加边 ID',
          autoFix: { type: 'set_value', path: `${path}.id`, value: `edge_${i + 1}` }
        });
      }

      if (!edge.source) {
        issues.push({
          level: 'error',
          code: 'MISSING_EDGE_SOURCE',
          message: `边 ${edge.id || i} 缺少 source`,
          path: `${path}.source`,
          suggestion: '指定源节点 ID'
        });
      } else if (!nodeIds.has(edge.source)) {
        issues.push({
          level: 'error',
          code: 'INVALID_EDGE_SOURCE',
          message: `边 ${edge.id || i} 的源节点不存在: ${edge.source}`,
          path: `${path}.source`,
          suggestion: '确保源节点 ID 存在于 nodes 中',
          autoFix: { type: 'remove_edge', path: path }
        });
      }

      if (!edge.target) {
        issues.push({
          level: 'error',
          code: 'MISSING_EDGE_TARGET',
          message: `边 ${edge.id || i} 缺少 target`,
          path: `${path}.target`,
          suggestion: '指定目标节点 ID'
        });
      } else if (!nodeIds.has(edge.target)) {
        issues.push({
          level: 'error',
          code: 'INVALID_EDGE_TARGET',
          message: `边 ${edge.id || i} 的目标节点不存在: ${edge.target}`,
          path: `${path}.target`,
          suggestion: '确保目标节点 ID 存在于 nodes 中',
          autoFix: { type: 'remove_edge', path: path }
        });
      }
    }

    return issues;
  }

  /**
   * 逻辑验证
   */
  private static validateLogic(pipeline: PipelineModel): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!pipeline.nodes || pipeline.nodes.length === 0) {
      issues.push({
        level: 'warning',
        code: 'EMPTY_PIPELINE',
        message: 'Pipeline 没有任何节点',
        suggestion: '添加至少一个节点'
      });
      return issues;
    }

    // 检查 DAG 无环
    const cycleResult = this.detectCycle(pipeline.nodes, pipeline.edges || []);
    if (cycleResult.hasCycle) {
      issues.push({
        level: 'error',
        code: 'CYCLE_DETECTED',
        message: `Pipeline 存在环路: ${cycleResult.cyclePath?.join(' -> ')}`,
        suggestion: '移除或修改边以消除环路'
      });
    }

    // 检查孤立节点
    const connectedNodes = new Set<string>();
    for (const edge of pipeline.edges || []) {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
    }

    if (pipeline.nodes.length > 1) {
      for (const node of pipeline.nodes) {
        if (!connectedNodes.has(node.id)) {
          issues.push({
            level: 'warning',
            code: 'ISOLATED_NODE',
            message: `节点 ${node.id} 是孤立的，没有任何连接`,
            nodeId: node.id,
            suggestion: '连接此节点或将其删除'
          });
        }
      }
    }

    // 检查输入输出类型匹配
    const nodeTypeMap = new Map<string, string>();
    for (const node of pipeline.nodes) {
      nodeTypeMap.set(node.id, node.type);
    }

    for (const edge of pipeline.edges || []) {
      const sourceType = nodeTypeMap.get(edge.source);
      const targetType = nodeTypeMap.get(edge.target);

      if (sourceType && targetType) {
        const sourceSpec = DocParser.getNodeById(sourceType);
        const targetSpec = DocParser.getNodeById(targetType);

        if (sourceSpec && targetSpec) {
          // 检查输出节点不应该有出边
          if (sourceSpec.category === 'outputs') {
            issues.push({
              level: 'warning',
              code: 'OUTPUT_HAS_OUTGOING_EDGE',
              message: `输出节点 ${edge.source} 不应该有出边`,
              nodeId: edge.source,
              suggestion: '输出节点应该是终点'
            });
          }

          // 检查输入节点不应该有入边
          if (targetSpec.category === 'inputs') {
            issues.push({
              level: 'warning',
              code: 'INPUT_HAS_INCOMING_EDGE',
              message: `输入节点 ${edge.target} 不应该有入边`,
              nodeId: edge.target,
              suggestion: '输入节点应该是起点'
            });
          }
        }
      }
    }

    return issues;
  }

  /**
   * 参数验证
   */
  private static validateParams(pipeline: PipelineModel): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (let i = 0; i < (pipeline.nodes || []).length; i++) {
      const node = pipeline.nodes[i];
      const path = `$.nodes[${i}]`;
      const nodeSpec = DocParser.getNodeById(node.type);

      if (!nodeSpec) {
        issues.push({
          level: 'warning',
          code: 'UNKNOWN_NODE_TYPE',
          message: `未知的节点类型: ${node.type}`,
          path: `${path}.type`,
          nodeId: node.id,
          suggestion: '检查节点类型是否正确'
        });
        continue;
      }

      // 验证必填参数
      for (const param of nodeSpec.params) {
        if (param.required) {
          const value = node.data?.[param.key];
          
          if (value === undefined || value === null) {
            issues.push({
              level: 'error',
              code: 'MISSING_REQUIRED_PARAM',
              message: `节点 ${node.id} 缺少必填参数: ${param.key}`,
              path: `${path}.data.${param.key}`,
              nodeId: node.id,
              field: param.key,
              suggestion: `添加参数 ${param.key} (${param.description || param.type})`,
              autoFix: param.default !== undefined ? {
                type: 'add_default',
                path: `${path}.data.${param.key}`,
                value: param.default
              } : undefined
            });
          } else if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
            issues.push({
              level: 'warning',
              code: 'PLACEHOLDER_PARAM',
              message: `节点 ${node.id} 的参数 ${param.key} 是占位符`,
              path: `${path}.data.${param.key}`,
              nodeId: node.id,
              field: param.key,
              suggestion: '请填写实际值'
            });
          }
        }

        // 验证枚举值
        if (param.enum && node.data?.[param.key] !== undefined) {
          const value = node.data[param.key];
          if (!param.enum.includes(value)) {
            issues.push({
              level: 'error',
              code: 'INVALID_ENUM_VALUE',
              message: `节点 ${node.id} 的参数 ${param.key} 值无效: ${value}`,
              path: `${path}.data.${param.key}`,
              nodeId: node.id,
              field: param.key,
              suggestion: `允许的值: ${param.enum.join(', ')}`
            });
          }
        }

        // 验证正则模式
        if (param.pattern && node.data?.[param.key] !== undefined) {
          const value = String(node.data[param.key]);
          const regex = new RegExp(param.pattern);
          if (!regex.test(value)) {
            issues.push({
              level: 'error',
              code: 'INVALID_PARAM_FORMAT',
              message: `节点 ${node.id} 的参数 ${param.key} 格式不正确`,
              path: `${path}.data.${param.key}`,
              nodeId: node.id,
              field: param.key,
              suggestion: `需要匹配格式: ${param.pattern}`
            });
          }
        }
      }
    }

    return issues;
  }

  /**
   * 检测环路
   */
  private static detectCycle(nodes: PipelineNode[], edges: PipelineEdge[]): { hasCycle: boolean; cyclePath?: string[] } {
    const nodeIds = new Set(nodes.map(n => n.id));
    const adjacency = new Map<string, string[]>();

    for (const id of nodeIds) {
      adjacency.set(id, []);
    }

    for (const edge of edges) {
      if (adjacency.has(edge.source)) {
        adjacency.get(edge.source)!.push(edge.target);
      }
    }

    // DFS 检测环
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      for (const neighbor of adjacency.get(node) || []) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          path.push(neighbor);
          return true;
        }
      }

      recursionStack.delete(node);
      path.pop();
      return false;
    };

    for (const nodeId of nodeIds) {
      if (!visited.has(nodeId)) {
        if (dfs(nodeId)) {
          // 提取环路径
          const cycleStart = path[path.length - 1];
          const cycleStartIndex = path.indexOf(cycleStart);
          return {
            hasCycle: true,
            cyclePath: path.slice(cycleStartIndex)
          };
        }
      }
    }

    return { hasCycle: false };
  }

  /**
   * 应用自动修复
   */
  static applyAutoFixes(pipeline: PipelineModel, issues: ValidationIssue[]): PipelineModel {
    let result = JSON.parse(JSON.stringify(pipeline)); // Deep clone

    const fixableIssues = issues.filter(i => i.autoFix);
    const edgesToRemove: number[] = [];

    for (const issue of fixableIssues) {
      const fix = issue.autoFix!;

      switch (fix.type) {
        case 'set_value':
          this.setValueByPath(result, fix.path, fix.value);
          break;

        case 'add_default':
          this.setValueByPath(result, fix.path, fix.value);
          break;

        case 'remove_edge':
          const edgeMatch = fix.path.match(/\$\.edges\[(\d+)\]/);
          if (edgeMatch) {
            edgesToRemove.push(parseInt(edgeMatch[1]));
          }
          break;
      }
    }

    // 移除标记的边（从后往前删除，避免索引问题）
    if (edgesToRemove.length > 0 && result.edges) {
      edgesToRemove.sort((a, b) => b - a);
      for (const index of edgesToRemove) {
        result.edges.splice(index, 1);
      }
    }

    return result;
  }

  /**
   * 根据 JSON Path 设置值
   */
  private static setValueByPath(obj: any, path: string, value: any): void {
    const parts = path.replace(/^\$\./, '').split(/\.|\[|\]/).filter(p => p);
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const index = parseInt(part);

      if (!isNaN(index)) {
        current = current[index];
      } else {
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
    }

    const lastPart = parts[parts.length - 1];
    const lastIndex = parseInt(lastPart);

    if (!isNaN(lastIndex)) {
      current[lastIndex] = value;
    } else {
      current[lastPart] = value;
    }
  }
}

export default Validator;
