/**
 * Graph Builder - DAG 构建服务
 * 
 * 负责构建 Pipeline DAG：
 * - 节点匹配与筛选
 * - 参数填充
 * - 依赖关系建立
 * - 拓扑排序
 * - 环路检测
 */

import { v4 as uuidv4 } from 'uuid';
import { DocParser, NodeSpec, ParamSpec } from './docParser';

// Pipeline 节点
export interface PipelineNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, any>;
}

// Pipeline 边
export interface PipelineEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

// Pipeline 模型
export interface PipelineModel {
  name: string;
  version: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  variables?: Record<string, any>;
}

// 构建上下文
export interface BuildContext {
  requirement: string;
  variables?: Record<string, any>;
  nodeLibrary?: NodeSpec[];
  layoutConfig?: {
    startX?: number;
    startY?: number;
    horizontalGap?: number;
    verticalGap?: number;
  };
}

// 构建结果
export interface BuildResult {
  success: boolean;
  pipeline?: PipelineModel;
  warnings?: string[];
  errors?: string[];
  suggestions?: string[];
}

// 默认布局配置
const DEFAULT_LAYOUT = {
  startX: 100,
  startY: 100,
  horizontalGap: 250,
  verticalGap: 150
};

/**
 * Graph Builder 类
 */
export class GraphBuilder {
  /**
   * 从需求描述构建 Pipeline（使用规则匹配）
   */
  static buildFromRequirement(context: BuildContext): BuildResult {
    const startTime = Date.now();
    console.log('\n========== [GraphBuilder] 开始构建 Pipeline ==========');
    console.log('需求:', context.requirement.substring(0, 200));

    const warnings: string[] = [];
    const errors: string[] = [];
    const suggestions: string[] = [];

    try {
      // Step 1: 分析需求，提取关键信息
      const analysis = this.analyzeRequirement(context.requirement);
      console.log('[GraphBuilder] 需求分析:', analysis);

      // Step 2: 匹配节点
      const nodeLibrary = context.nodeLibrary || DocParser.getBuiltinNodes();
      const matchedNodes = this.matchNodesFromAnalysis(analysis, nodeLibrary);
      console.log('[GraphBuilder] 匹配到的节点:', matchedNodes.map(n => n.id));

      if (matchedNodes.length === 0) {
        errors.push('无法从需求中识别出有效的节点配置');
        suggestions.push('请明确指定数据源类型（如 MySQL、CSV）和目标类型');
        return { success: false, errors, suggestions };
      }

      // Step 3: 构建 Pipeline 节点
      const layout = { ...DEFAULT_LAYOUT, ...context.layoutConfig };
      const pipelineNodes: PipelineNode[] = [];
      const nodeIdMap = new Map<string, string>(); // 原始类型 -> 实际ID

      for (let i = 0; i < matchedNodes.length; i++) {
        const nodeSpec = matchedNodes[i];
        const nodeId = `node_${i + 1}_${nodeSpec.id}`;
        nodeIdMap.set(nodeSpec.id, nodeId);

        const node: PipelineNode = {
          id: nodeId,
          type: nodeSpec.id,
          position: this.calculatePosition(i, matchedNodes.length, layout),
          data: this.buildNodeData(nodeSpec, context.variables || {}, analysis)
        };

        pipelineNodes.push(node);
      }

      // Step 4: 建立边（依赖关系）
      const pipelineEdges = this.buildEdges(pipelineNodes, matchedNodes);

      // Step 5: 拓扑排序验证
      const topoResult = this.topologicalSort(pipelineNodes, pipelineEdges);
      if (!topoResult.success) {
        errors.push(topoResult.error || '拓扑排序失败');
        return { success: false, errors };
      }

      // Step 6: 构建最终 Pipeline
      const pipeline: PipelineModel = {
        name: this.generatePipelineName(analysis),
        version: '1.0.0',
        nodes: pipelineNodes,
        edges: pipelineEdges,
        variables: context.variables || {}
      };

      // 添加可能的警告
      if (this.hasMissingRequiredParams(pipelineNodes, matchedNodes)) {
        warnings.push('部分必填参数未填写，请在生成后手动补充');
      }

      const duration = Date.now() - startTime;
      console.log(`[GraphBuilder] 构建完成 (${duration}ms), 节点数: ${pipelineNodes.length}, 边数: ${pipelineEdges.length}`);
      console.log('========== [GraphBuilder] 构建结束 ==========\n');

      return {
        success: true,
        pipeline,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error: any) {
      console.error('[GraphBuilder] 构建错误:', error);
      errors.push(`构建失败: ${error.message}`);
      return { success: false, errors };
    }
  }

  /**
   * 分析需求，提取关键信息
   */
  private static analyzeRequirement(requirement: string): RequirementAnalysis {
    const lowerReq = requirement.toLowerCase();

    const analysis: RequirementAnalysis = {
      sourceType: null,
      targetType: null,
      transformations: [],
      entities: {}
    };

    // 检测数据源类型
    if (lowerReq.includes('mysql')) {
      analysis.sourceType = 'mysql';
    } else if (lowerReq.includes('postgres')) {
      analysis.sourceType = 'postgres';
    } else if (lowerReq.includes('csv') || lowerReq.includes('csv文件')) {
      analysis.sourceType = 'csv';
    } else if (lowerReq.includes('json') || lowerReq.includes('json文件')) {
      analysis.sourceType = 'json';
    } else if (lowerReq.includes('api') || lowerReq.includes('接口')) {
      analysis.sourceType = 'api';
    }

    // 检测目标类型
    if (lowerReq.includes('导出') || lowerReq.includes('export') || lowerReq.includes('输出')) {
      if (lowerReq.includes('csv')) {
        analysis.targetType = 'csv';
      } else if (lowerReq.includes('json')) {
        analysis.targetType = 'json';
      } else if (lowerReq.includes('mysql')) {
        analysis.targetType = 'mysql';
      } else if (lowerReq.includes('postgres')) {
        analysis.targetType = 'postgres';
      }
    }

    // 如果没有明确目标，根据上下文推断
    if (!analysis.targetType) {
      if (lowerReq.includes('到mysql') || lowerReq.includes('写入mysql')) {
        analysis.targetType = 'mysql';
      } else if (lowerReq.includes('到postgres') || lowerReq.includes('写入postgres')) {
        analysis.targetType = 'postgres';
      } else if (lowerReq.includes('到csv') || lowerReq.includes('保存为csv')) {
        analysis.targetType = 'csv';
      } else if (lowerReq.includes('到json') || lowerReq.includes('保存为json')) {
        analysis.targetType = 'json';
      }
    }

    // 如果源和目标类型相同且都是数据库，默认目标为文件
    if (analysis.sourceType === analysis.targetType && ['mysql', 'postgres'].includes(analysis.sourceType || '')) {
      analysis.targetType = 'csv';
    }

    // 检测转换操作
    if (lowerReq.includes('过滤') || lowerReq.includes('filter') || lowerReq.includes('筛选')) {
      analysis.transformations.push('filter');
    }
    if (lowerReq.includes('聚合') || lowerReq.includes('aggregate') || lowerReq.includes('汇总') || lowerReq.includes('分组')) {
      analysis.transformations.push('aggregate');
    }
    if (lowerReq.includes('排序') || lowerReq.includes('sort')) {
      analysis.transformations.push('sort');
    }
    if (lowerReq.includes('连接') || lowerReq.includes('join') || lowerReq.includes('关联')) {
      analysis.transformations.push('join');
    }
    if (lowerReq.includes('重命名') || lowerReq.includes('rename')) {
      analysis.transformations.push('rename');
    }
    if (lowerReq.includes('类型转换') || lowerReq.includes('转换类型')) {
      analysis.transformations.push('typeConverter');
    }

    // 提取实体（表名、文件路径等）
    const tableMatch = requirement.match(/表[名称]?\s*[:：]?\s*[`'""]?(\w+)[`'""]?/i);
    if (tableMatch) {
      analysis.entities.tableName = tableMatch[1];
    }

    const filePathMatch = requirement.match(/(?:文件|路径)\s*[:：]?\s*[`'""]?([^\s`'"",，]+)[`'""]?/i);
    if (filePathMatch) {
      analysis.entities.filePath = filePathMatch[1];
    }

    return analysis;
  }

  /**
   * 根据分析结果匹配节点
   */
  private static matchNodesFromAnalysis(analysis: RequirementAnalysis, nodeLibrary: NodeSpec[]): NodeSpec[] {
    const matchedNodes: NodeSpec[] = [];

    // 匹配输入节点
    const inputNode = this.findInputNode(analysis.sourceType, nodeLibrary);
    if (inputNode) {
      matchedNodes.push(inputNode);
    }

    // 匹配转换节点
    for (const transform of analysis.transformations) {
      const transformNode = nodeLibrary.find(n => n.id === transform || n.id.toLowerCase() === transform.toLowerCase());
      if (transformNode) {
        matchedNodes.push(transformNode);
      }
    }

    // 匹配输出节点
    const outputNode = this.findOutputNode(analysis.targetType, nodeLibrary);
    if (outputNode) {
      matchedNodes.push(outputNode);
    }

    return matchedNodes;
  }

  /**
   * 查找输入节点
   */
  private static findInputNode(sourceType: string | null, nodeLibrary: NodeSpec[]): NodeSpec | undefined {
    const inputNodes = nodeLibrary.filter(n => n.category === 'inputs');

    switch (sourceType) {
      case 'mysql':
        return inputNodes.find(n => n.id.toLowerCase().includes('mysql'));
      case 'postgres':
        return inputNodes.find(n => n.id.toLowerCase().includes('postgres'));
      case 'csv':
        return inputNodes.find(n => n.id.toLowerCase().includes('csv'));
      case 'json':
        return inputNodes.find(n => n.id.toLowerCase().includes('json'));
      case 'api':
        return inputNodes.find(n => n.id.toLowerCase().includes('api'));
      default:
        return inputNodes[0]; // 默认返回第一个输入节点
    }
  }

  /**
   * 查找输出节点
   */
  private static findOutputNode(targetType: string | null, nodeLibrary: NodeSpec[]): NodeSpec | undefined {
    const outputNodes = nodeLibrary.filter(n => n.category === 'outputs');

    switch (targetType) {
      case 'mysql':
        return outputNodes.find(n => n.id.toLowerCase().includes('mysql'));
      case 'postgres':
        return outputNodes.find(n => n.id.toLowerCase().includes('postgres'));
      case 'csv':
        return outputNodes.find(n => n.id.toLowerCase().includes('csv'));
      case 'json':
        return outputNodes.find(n => n.id.toLowerCase().includes('json'));
      default:
        return outputNodes.find(n => n.id.toLowerCase().includes('csv')); // 默认 CSV 输出
    }
  }

  /**
   * 计算节点位置
   */
  private static calculatePosition(
    index: number,
    total: number,
    layout: typeof DEFAULT_LAYOUT
  ): { x: number; y: number } {
    // 简单的水平布局
    return {
      x: layout.startX + index * layout.horizontalGap,
      y: layout.startY + (index % 2) * (layout.verticalGap / 2) // 轻微错开
    };
  }

  /**
   * 构建节点数据
   */
  private static buildNodeData(
    nodeSpec: NodeSpec,
    variables: Record<string, any>,
    analysis: RequirementAnalysis
  ): Record<string, any> {
    const data: Record<string, any> = {};

    for (const param of nodeSpec.params) {
      // 优先使用变量中的值
      if (variables[param.key] !== undefined) {
        data[param.key] = variables[param.key];
        continue;
      }

      // 尝试从分析结果中填充
      if (param.key === 'table' && analysis.entities.tableName) {
        data[param.key] = analysis.entities.tableName;
        continue;
      }
      if (param.key === 'filePath' && analysis.entities.filePath) {
        data[param.key] = analysis.entities.filePath;
        continue;
      }

      // 使用默认值
      if (param.default !== undefined) {
        data[param.key] = param.default;
      } else if (param.required) {
        // 为必填参数生成占位符
        data[param.key] = `{{${param.key}}}`;
      }
    }

    return data;
  }

  /**
   * 建立边（依赖关系）
   */
  private static buildEdges(nodes: PipelineNode[], nodeSpecs: NodeSpec[]): PipelineEdge[] {
    const edges: PipelineEdge[] = [];

    // 简单的线性连接：每个节点连接到下一个节点
    for (let i = 0; i < nodes.length - 1; i++) {
      const sourceNode = nodes[i];
      const targetNode = nodes[i + 1];
      const sourceSpec = nodeSpecs[i];
      const targetSpec = nodeSpecs[i + 1];

      edges.push({
        id: `edge_${i + 1}`,
        source: sourceNode.id,
        target: targetNode.id,
        sourceHandle: sourceSpec.outputs?.[0]?.name || 'out',
        targetHandle: targetSpec.inputs?.[0]?.name || 'in'
      });
    }

    return edges;
  }

  /**
   * 拓扑排序（验证 DAG 无环）
   */
  private static topologicalSort(
    nodes: PipelineNode[],
    edges: PipelineEdge[]
  ): { success: boolean; order?: string[]; error?: string } {
    const nodeIds = new Set(nodes.map(n => n.id));
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // 初始化
    for (const id of nodeIds) {
      inDegree.set(id, 0);
      adjacency.set(id, []);
    }

    // 构建邻接表和入度
    for (const edge of edges) {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        return {
          success: false,
          error: `边引用了不存在的节点: ${edge.source} -> ${edge.target}`
        };
      }

      adjacency.get(edge.source)!.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }

    // Kahn's 算法
    const queue: string[] = [];
    const order: string[] = [];

    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    while (queue.length > 0) {
      const node = queue.shift()!;
      order.push(node);

      for (const neighbor of adjacency.get(node) || []) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (order.length !== nodeIds.size) {
      return {
        success: false,
        error: 'Pipeline 存在环路，无法形成有效的 DAG'
      };
    }

    return { success: true, order };
  }

  /**
   * 检查是否有缺失的必填参数
   */
  private static hasMissingRequiredParams(nodes: PipelineNode[], nodeSpecs: NodeSpec[]): boolean {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const spec = nodeSpecs[i];

      for (const param of spec.params) {
        if (param.required) {
          const value = node.data[param.key];
          if (value === undefined || value === null || (typeof value === 'string' && value.startsWith('{{'))) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * 生成 Pipeline 名称
   */
  private static generatePipelineName(analysis: RequirementAnalysis): string {
    const parts: string[] = [];

    if (analysis.sourceType) {
      parts.push(analysis.sourceType);
    }

    if (analysis.transformations.length > 0) {
      parts.push(analysis.transformations[0]);
    }

    if (analysis.targetType) {
      parts.push(analysis.targetType);
    }

    if (parts.length === 0) {
      return 'generated_pipeline';
    }

    return parts.join('_to_') + '_pipeline';
  }

  /**
   * 验证 Pipeline 结构
   */
  static validatePipeline(pipeline: PipelineModel): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 检查基本结构
    if (!pipeline.name) {
      errors.push('Pipeline 缺少名称');
    }

    if (!pipeline.nodes || pipeline.nodes.length === 0) {
      errors.push('Pipeline 没有节点');
    }

    // 检查节点唯一性
    const nodeIds = new Set<string>();
    for (const node of pipeline.nodes || []) {
      if (nodeIds.has(node.id)) {
        errors.push(`节点 ID 重复: ${node.id}`);
      }
      nodeIds.add(node.id);
    }

    // 检查边的有效性
    for (const edge of pipeline.edges || []) {
      if (!nodeIds.has(edge.source)) {
        errors.push(`边的源节点不存在: ${edge.source}`);
      }
      if (!nodeIds.has(edge.target)) {
        errors.push(`边的目标节点不存在: ${edge.target}`);
      }
    }

    // 拓扑排序验证
    if (pipeline.nodes && pipeline.edges) {
      const topoResult = this.topologicalSort(pipeline.nodes, pipeline.edges);
      if (!topoResult.success) {
        errors.push(topoResult.error || '存在环路');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// 需求分析结果
interface RequirementAnalysis {
  sourceType: string | null;
  targetType: string | null;
  transformations: string[];
  entities: {
    tableName?: string;
    filePath?: string;
    [key: string]: any;
  };
}

export default GraphBuilder;
