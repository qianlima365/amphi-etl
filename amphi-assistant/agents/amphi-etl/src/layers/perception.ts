/**
 * 感知层适配
 * 从原 etl-agent.ts 提取
 */

import { 
  PerceptionLayer, 
  EnvironmentMonitor, 
  LLMIntentRecognizer, 
  DataNormalizer,
  InputType 
} from '../../../../src';
import { ILLMService } from '../../../../src/core/cognition';
import { createLogger } from '../../../../src/utils/logger';

const logger = createLogger('PerceptionAdapter');

export interface PerceptionAdapterOptions {
  llm: ILLMService;
  enableEnvironmentMonitoring?: boolean;
}

export class PerceptionAdapter {
  private perception: PerceptionLayer;
  private environmentMonitor: EnvironmentMonitor;
  private dataNormalizer: DataNormalizer;

  constructor(options: PerceptionAdapterOptions) {
    this.environmentMonitor = new EnvironmentMonitor();
    this.perception = new PerceptionLayer(
      { enableMultimodal: false, enableEnvironmentMonitoring: options.enableEnvironmentMonitoring ?? true },
      new LLMIntentRecognizer(options.llm),
      this.environmentMonitor
    );
    this.dataNormalizer = new DataNormalizer();
  }

  /**
   * 感知用户输入
   */
  async perceive(
    input: string,
    inputType: InputType = InputType.TEXT,
    source: string = 'user',
    context?: Record<string, any>
  ): Promise<{ content: string | Buffer | object; metadata?: any }> {
    return this.perception.perceive(input, inputType, source, context);
  }

  /**
   * 注册数据源健康检查
   */
  registerDataSourceCheck(
    name: string,
    type: 'neo4j' | 'postgresql' | 'mysql' | 'api',
    config: Record<string, any>
  ): void {
    this.environmentMonitor.registerDataSourceCheck(name, type, config);
  }

  /**
   * 检查所有环境状态
   */
  async checkEnvironment(): Promise<Array<{ name: string; status: string; [key: string]: any }>> {
    const states = await this.environmentMonitor.checkAll();
    
    const offlineServices = states.filter(s => s.status === 'offline');
    const degradedServices = states.filter(s => s.status === 'degraded');
    
    if (offlineServices.length > 0) {
      logger.warn('感知层·环境·离线服务', { services: offlineServices.map(s => s.name) });
    }
    if (degradedServices.length > 0) {
      logger.warn('感知层·环境·降级服务', { services: degradedServices.map(s => s.name) });
    }
    if (offlineServices.length === 0 && degradedServices.length === 0) {
      logger.info('感知层·环境检查通过');
    }
    
    return states;
  }

  getEnvironmentMonitor(): EnvironmentMonitor {
    return this.environmentMonitor;
  }

  getDataNormalizer(): DataNormalizer {
    return this.dataNormalizer;
  }
}

export default PerceptionAdapter;
