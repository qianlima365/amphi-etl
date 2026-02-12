/**
 * 执行层适配
 * 从原 etl-agent.ts 提取
 */

import { ExecutionLayer } from '../../../../src/core/execution';
import type { Tool, ToolResult, ExecutionContext } from '../../../../src/types';
import { MemoryLayer } from '../../../../src/core/memory';
import { OntologyLayer } from '../../../../src/core/ontologies';
import { Neo4jKnowledgeGraph } from '../../../../src';
import { createLogger } from '../../../../src/utils/logger';
import { ETLToolFactory } from '../tools/factory';

const logger = createLogger('ExecutionAdapter');

export interface ExecutionAdapterOptions {
  maxConcurrentTasks?: number;
  defaultTimeout?: number;
  enableSandbox?: boolean;
  retryPolicy?: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay: number;
  };
}

export class ExecutionAdapter {
  private executionLayer: ExecutionLayer;
  private toolFactory: ETLToolFactory | null = null;
  private toolsRegistered: boolean = false;

  constructor(options: ExecutionAdapterOptions = {}) {
    this.executionLayer = new ExecutionLayer({
      maxConcurrentTasks: options.maxConcurrentTasks ?? 5,
      defaultTimeout: options.defaultTimeout ?? 30000,
      retryPolicy: options.retryPolicy ?? {
        maxRetries: 3,
        backoffMultiplier: 2,
        initialDelay: 1000,
      },
      enableSandbox: options.enableSandbox ?? true,
    });

    // 注册事件监听
    this.executionLayer.on('task:start', (data) => {
      logger.info('执行层·任务开始', { taskName: data.task.name });
    });
    this.executionLayer.on('task:complete', (data) => {
      logger.info('执行层·任务完成', { taskName: data.task.name });
    });
    this.executionLayer.on('task:error', (data) => {
      logger.error('执行层·任务失败', { taskName: data.task.name, error: data.error.message });
    });
  }

  /**
   * 初始化工具工厂
   */
  initializeTools(
    kg: Neo4jKnowledgeGraph,
    ontologyLayer: OntologyLayer,
    memoryLayer: MemoryLayer
  ): void {
    this.toolFactory = new ETLToolFactory(kg, ontologyLayer, memoryLayer);
    
    const tools = this.toolFactory.createTools();
    for (const tool of tools) {
      this.executionLayer.registerTool(tool);
    }
    
    this.toolsRegistered = true;
    logger.info('执行层·工具已注册', { toolCount: tools.length });
  }

  /**
   * 获取工具
   */
  getTool(name: string): Tool | undefined {
    return this.executionLayer.getTool(name);
  }

  /**
   * 列出所有工具
   */
  listTools(): Tool[] {
    return this.executionLayer.listTools();
  }

  /**
   * 执行工具
   */
  async executeTool(
    toolName: string,
    params: any,
    context: ExecutionContext
  ): Promise<ToolResult> {
    const tool = this.getTool(toolName);
    if (!tool) {
      return {
        success: false,
        error: `工具不存在: ${toolName}`,
        duration: 0
      };
    }

    return tool.handler(params, context);
  }

  /**
   * 检查工具是否已注册
   */
  areToolsRegistered(): boolean {
    return this.toolsRegistered;
  }

  /**
   * 获取执行层实例
   */
  getExecutionLayer(): ExecutionLayer {
    return this.executionLayer;
  }
}

export default ExecutionAdapter;
