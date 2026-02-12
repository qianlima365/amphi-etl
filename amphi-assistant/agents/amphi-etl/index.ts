/**
 * Amphi ETL Agent - 统一导出
 * 
 * 提供三种使用方式：
 * 1. CLI 模式: npm run agent:etl:cli
 * 2. API 模式: npm run agent:etl:api
 * 3. SDK 集成: import { AmphiETLClient } from './amphi-etl'
 */

// 核心类
export { AmphiETLAgent, AmphiETLAgentOptions } from './src/core';

// 类型定义
export * from './src/types';

// 服务层
export { IntentService } from './src/services/intent';
export { ComponentService } from './src/services/component';
export { ParameterService } from './src/services/parameter';
export { PipelineService } from './src/services/pipeline';
export { SessionService } from './src/services/session';

// 层适配器
export { PerceptionAdapter } from './src/layers/perception';
export { MemoryAdapter } from './src/layers/memory';
export { CognitionAdapter, ETLDependencyBuilder } from './src/layers/cognition';
export { ExecutionAdapter } from './src/layers/execution';

// SDK
export { 
  AmphiETLClient, 
  AmphiETLWebSocketClient, 
  ETLSession,
  type SDKOptions,
  type SessionOptions 
} from './sdk';

// 工具
export { ETLToolFactory } from './src/tools/factory';
export * from './src/tools/types';

// 工具函数
export { OutputHandler, ConsoleOutput, SilentOutput, CallbackOutput } from './src/utils/output';
export * from './src/utils/helpers';
