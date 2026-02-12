/**
 * 执行层 (Execution Layer)
 * Agent 的"手脚" - 调用工具并完成任务
 * 
 * 核心功能:
 * - 工具调用: 标准化调用内外部工具
 * - 代码执行: 生成并执行代码
 * - 任务调度: 并行/串行调度
 * - 异常处理: 重试、备用方案
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../utils/logger';
import { ExecutionError, ToolError } from '../../utils/errors';
import {
  Tool,
  ToolResult,
  SubTask,
  ExecutionPlan,
  ExecutionContext,
  CodeExecutionResult,
  TaskStatus,
  UUID,
} from '../../types';

const logger = createLogger('ExecutionLayer');

/** 执行配置 */
export interface ExecutionConfig {
  maxConcurrentTasks: number;
  defaultTimeout: number;
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay?: number;
  };
  enableSandbox: boolean;
}

/** 任务执行结果 */
export interface TaskExecutionResult {
  taskId: UUID;
  success: boolean;
  output?: any;
  error?: string;
  duration: number;
  retryCount: number;
}

/**
 * 工具注册表
 */
export class ToolRegistry {
  private tools: Map<string, Tool>;

  constructor() {
    this.tools = new Map();
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
    logger.info('工具注册成功', { toolName: tool.name });
  }

  unregister(toolName: string): void {
    this.tools.delete(toolName);
    logger.info('工具注销成功', { toolName });
  }

  get(toolName: string): Tool | undefined {
    return this.tools.get(toolName);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  has(toolName: string): boolean {
    return this.tools.has(toolName);
  }
}

/**
 * 代码执行器
 * 支持安全的代码执行（沙箱模式）
 */
export class CodeExecutor {
  private enableSandbox: boolean;

  constructor(enableSandbox: boolean = true) {
    this.enableSandbox = enableSandbox;
  }

  /**
   * 执行 JavaScript/TypeScript 代码
   */
  async executeJavaScript(code: string, context: Record<string, any> = {}): Promise<CodeExecutionResult> {
    const startTime = Date.now();

    try {
      // 创建安全的上下文
      const sandbox = {
        console: {
          log: (...args: any[]) => logger.debug('Code output', { args }),
          error: (...args: any[]) => logger.error('Code error', { args }),
        },
        ...context,
      };

      if (this.enableSandbox) {
        // 使用 vm2 或其他沙箱方案（简化实现）
        const result = await this.runInSandbox(code, sandbox);
        return {
          success: true,
          output: result,
          executionTime: Date.now() - startTime,
        };
      } else {
        // 直接执行（不安全，仅用于开发）
        const fn = new Function(...Object.keys(sandbox), code);
        const result = fn(...Object.values(sandbox));
        return {
          success: true,
          output: await result,
          executionTime: Date.now() - startTime,
        };
      }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: (error as Error).message,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 执行 SQL
   */
  async executeSQL(
    sql: string,
    connection: any,
    context: Record<string, any> = {}
  ): Promise<CodeExecutionResult> {
    const startTime = Date.now();

    try {
      // 这里应该集成实际的数据库连接
      // 简化实现
      logger.info('执行 SQL', { sql });
      
      return {
        success: true,
        output: JSON.stringify({ rows: [], rowCount: 0 }),
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: (error as Error).message,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 执行 Python 代码（通过子进程）
   */
  async executePython(code: string, context: Record<string, any> = {}): Promise<CodeExecutionResult> {
    const startTime = Date.now();

    try {
      // 简化实现 - 实际应该使用 child_process 或 Docker 沙箱
      logger.info('执行 Python', { code: code.substring(0, 100) });

      return {
        success: true,
        output: 'Python execution simulated',
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: (error as Error).message,
        executionTime: Date.now() - startTime,
      };
    }
  }

  private async runInSandbox(code: string, context: any): Promise<any> {
    // 简化实现 - 实际应该使用 vm2 或类似的沙箱
    return `Sandbox execution: ${code.substring(0, 50)}...`;
  }
}

/**
 * 任务执行器
 */
export class TaskExecutor extends EventEmitter {
  private registry: ToolRegistry;
  private codeExecutor: CodeExecutor;
  private config: ExecutionConfig;
  private runningTasks: Map<UUID, AbortController>;

  constructor(registry: ToolRegistry, config: ExecutionConfig) {
    super();
    this.registry = registry;
    this.codeExecutor = new CodeExecutor(config.enableSandbox);
    this.config = config;
    this.runningTasks = new Map();
  }

  /**
   * 执行单个任务
   */
  async executeTask(
    task: SubTask,
    context: ExecutionContext
  ): Promise<TaskExecutionResult> {
    const startTime = Date.now();
    const abortController = new AbortController();
    this.runningTasks.set(task.id, abortController);

    this.emit('task:start', { task });
    logger.info('开始执行任务', { taskId: task.id, taskName: task.name });

    try {
      // 更新任务状态
      task.status = TaskStatus.RUNNING;

      let result: any;
      
      // 根据任务类型选择执行方式
      if (task.tools && task.tools.length > 0) {
        // 工具调用
        result = await this.executeWithTools(task, context, abortController.signal);
      } else if (task.description.includes('代码') || task.description.includes('code')) {
        // 代码生成和执行
        result = await this.executeWithCode(task, context);
      } else {
        // 默认处理
        result = { status: 'completed', message: 'Task completed' };
      }

      task.status = TaskStatus.COMPLETED;
      task.output = result;

      const executionResult: TaskExecutionResult = {
        taskId: task.id,
        success: true,
        output: result,
        duration: Date.now() - startTime,
        retryCount: task.retryCount,
      };

      this.emit('task:complete', { task, result });
      logger.info('任务执行完成', { taskId: task.id, duration: executionResult.duration });

      return executionResult;
    } catch (error) {
      task.status = TaskStatus.FAILED;
      
      const executionResult: TaskExecutionResult = {
        taskId: task.id,
        success: false,
        error: (error as Error).message,
        duration: Date.now() - startTime,
        retryCount: task.retryCount,
      };

      this.emit('task:error', { task, error });
      logger.error('任务执行失败', { taskId: task.id, error });

      return executionResult;
    } finally {
      this.runningTasks.delete(task.id);
    }
  }

  /**
   * 使用工具执行任务
   */
  private async executeWithTools(
    task: SubTask,
    context: ExecutionContext,
    abortSignal: AbortSignal
  ): Promise<any> {
    const results: ToolResult[] = [];

    for (const toolName of task.tools || []) {
      const tool = this.registry.get(toolName);
      
      if (!tool) {
        throw new ToolError(`工具未找到: ${toolName}`);
      }

      logger.debug('调用工具', { toolName, taskId: task.id });

      const toolResult = await this.executeWithRetry(
        () => tool.handler(task.input || {}, { ...context, abortSignal }),
        task
      );

      results.push(toolResult);

      if (!toolResult.success) {
        throw new ToolError(`工具调用失败: ${toolName}`, toolResult);
      }
    }

    return results.length === 1 ? results[0].data : results;
  }

  /**
   * 使用代码执行任务
   */
  private async executeWithCode(
    task: SubTask,
    context: ExecutionContext
  ): Promise<any> {
    // 生成代码（简化实现）
    const code = `
// 自动生成的代码
const result = await processTask(${JSON.stringify(task.input)});
return result;
    `;

    const result = await this.codeExecutor.executeJavaScript(code, {
      task,
      context,
    });

    if (!result.success) {
      throw new ExecutionError(`代码执行失败: ${result.error}`);
    }

    return result.output;
  }

  /**
   * 带重试的执行
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    task: SubTask
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.retryPolicy.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        task.retryCount = attempt + 1;

        if (attempt < this.config.retryPolicy.maxRetries) {
          const initialDelay = this.config.retryPolicy.initialDelay || 1000;
          const delay = initialDelay * 
                        Math.pow(this.config.retryPolicy.backoffMultiplier, attempt);
          
          logger.warn(`任务重试`, { taskId: task.id, attempt: attempt + 1, delay });
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: UUID): boolean {
    const controller = this.runningTasks.get(taskId);
    if (controller) {
      controller.abort();
      this.runningTasks.delete(taskId);
      logger.info('任务已取消', { taskId });
      return true;
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * 任务调度器
 */
export class TaskScheduler extends EventEmitter {
  private config: ExecutionConfig;
  private executor: TaskExecutor;

  constructor(executor: TaskExecutor, config: ExecutionConfig) {
    super();
    this.executor = executor;
    this.config = config;
  }

  /**
   * 执行完整计划
   */
  async executePlan(
    plan: ExecutionPlan,
    context: ExecutionContext
  ): Promise<Map<UUID, TaskExecutionResult>> {
    const results = new Map<UUID, TaskExecutionResult>();
    plan.status = TaskStatus.RUNNING;

    logger.info('开始执行计划', { planId: plan.id, parallelGroups: plan.parallelGroups.length });

    // 按并行组顺序执行
    for (const group of plan.parallelGroups) {
      const tasks = plan.subtasks.filter((t) => group.includes(t.id));
      
      logger.debug('执行并行组', { 
        planId: plan.id, 
        groupSize: tasks.length,
        taskIds: tasks.map((t) => t.id),
      });

      // 并行执行组内任务
      const groupResults = await Promise.all(
        tasks.map((task) => this.executor.executeTask(task, context))
      );

      // 存储结果
      for (const result of groupResults) {
        results.set(result.taskId, result);

        // 如果任务失败，可能需要中断或调整
        if (!result.success) {
          this.emit('task:failed', { taskId: result.taskId, planId: plan.id });
        }
      }
    }

    // 更新计划状态
    const allSuccess = Array.from(results.values()).every((r) => r.success);
    plan.status = allSuccess ? TaskStatus.COMPLETED : TaskStatus.FAILED;

    logger.info('计划执行完成', { planId: plan.id, status: plan.status });

    return results;
  }

  /**
   * 执行单个任务
   */
  async executeSingleTask(
    task: SubTask,
    context: ExecutionContext
  ): Promise<TaskExecutionResult> {
    return this.executor.executeTask(task, context);
  }
}

/**
 * 执行层核心类
 */
export class ExecutionLayer extends EventEmitter {
  private registry: ToolRegistry;
  private executor: TaskExecutor;
  private scheduler: TaskScheduler;
  private codeExecutor: CodeExecutor;
  private config: ExecutionConfig;

  constructor(config?: Partial<ExecutionConfig>) {
    super();
    this.config = {
      maxConcurrentTasks: 5,
      defaultTimeout: 30000,
      retryPolicy: {
        maxRetries: 3,
        backoffMultiplier: 2,
        initialDelay: 1000,
      },
      enableSandbox: true,
      ...config,
    };

    this.registry = new ToolRegistry();
    this.executor = new TaskExecutor(this.registry, this.config);
    this.scheduler = new TaskScheduler(this.executor, this.config);
    this.codeExecutor = new CodeExecutor(this.config.enableSandbox);

    // 转发事件
    this.executor.on('task:start', (data) => this.emit('task:start', data));
    this.executor.on('task:complete', (data) => this.emit('task:complete', data));
    this.executor.on('task:error', (data) => this.emit('task:error', data));
  }

  /**
   * 注册工具
   */
  registerTool(tool: Tool): void {
    this.registry.register(tool);
  }

  /**
   * 批量注册工具
   */
  registerTools(tools: Tool[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  /**
   * 获取工具
   */
  getTool(name: string): Tool | undefined {
    return this.registry.get(name);
  }

  /**
   * 列出所有工具
   */
  listTools(): Tool[] {
    return this.registry.list();
  }

  /**
   * 执行计划
   */
  async executePlan(
    plan: ExecutionPlan,
    context: ExecutionContext
  ): Promise<Map<UUID, TaskExecutionResult>> {
    return this.scheduler.executePlan(plan, context);
  }

  /**
   * 执行单个任务
   */
  async executeTask(
    task: SubTask,
    context: ExecutionContext
  ): Promise<TaskExecutionResult> {
    return this.scheduler.executeSingleTask(task, context);
  }

  /**
   * 执行代码
   */
  async executeCode(
    code: string,
    language: 'javascript' | 'python' | 'sql' = 'javascript',
    context: Record<string, any> = {}
  ): Promise<CodeExecutionResult> {
    switch (language) {
      case 'javascript':
        return this.codeExecutor.executeJavaScript(code, context);
      case 'python':
        return this.codeExecutor.executePython(code, context);
      case 'sql':
        return this.codeExecutor.executeSQL(code, null, context);
      default:
        throw new ExecutionError(`不支持的代码语言: ${language}`);
    }
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: UUID): boolean {
    return this.executor.cancelTask(taskId);
  }
}

export default ExecutionLayer;
