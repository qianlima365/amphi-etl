/**
 * 感知层 (Perception Layer)
 * Agent 的"五官" - 获取内外部信息
 * 
 * 核心功能:
 * - 用户输入感知: 支持自然语言、结构化指令、多模态输入
 * - 环境状态感知: 实时采集工具可用性、资源状态、数据源状态
 * - 信息清洗/归一化
 */

import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../utils/logger';
import { PerceptionError } from '../../utils/errors';
import {
  PerceptionInput,
  ParsedIntent,
  EnvironmentState,
  InputType,
  EnvironmentType,
  Entity,
  UUID,
} from '../../types';

/** 多模态输入结构 */
export interface MultimodalInput {
  type: 'image' | 'audio' | 'document' | 'table' | 'text';
  content: Buffer | string;
  mimeType: string;
  metadata?: {
    filename?: string;
    size?: number;
    encoding?: string;
  };
}

/** 信息清洗结果 */
export interface CleanedData {
  original: any;
  cleaned: any;
  normalizations: Array<{
    field: string;
    original: any;
    normalized: any;
    rule: string;
  }>;
  quality: {
    completeness: number;
    validity: number;
    consistency: number;
  };
}

const logger = createLogger('PerceptionLayer');

/** 感知层配置 */
export interface PerceptionConfig {
  enableMultimodal?: boolean;
  enableEnvironmentMonitoring?: boolean;
  environmentCheckInterval?: number;
  intentRecognitionModel?: string;
  supportedInputTypes?: InputType[];
}

/** 意图识别服务接口 */
export interface IIntentRecognizer {
  recognize(input: string, context?: any): Promise<ParsedIntent>;
}

/** 环境监控器接口 */
export interface IEnvironmentMonitor {
  checkStatus(type: EnvironmentType, name: string): Promise<EnvironmentState>;
  checkAll(): Promise<EnvironmentState[]>;
}

/** 
 * LLM 意图识别器 
 * 使用大模型进行意图识别和实体提取
 */
export class LLMIntentRecognizer implements IIntentRecognizer {
  private llmClient: any;

  constructor(llmClient: any) {
    this.llmClient = llmClient;
  }

  async recognize(input: string, context?: any): Promise<ParsedIntent> {
    try {
      // 构建提示词
      const prompt = `
请分析以下用户输入，提取意图和关键实体：

用户输入: "${input}"
上下文: ${context ? JSON.stringify(context) : '无'}

请以 JSON 格式返回：
{
  "intent": "意图名称",
  "confidence": 0.95,
  "entities": [
    {"type": "实体类型", "value": "实体值"}
  ],
  "goal": "高层级目标",
  "parameters": {}
}
`;

      // 调用 LLM 进行意图识别
      const response = await this.llmClient.complete(prompt);
      const result = JSON.parse(response);

      return {
        action: result.intent || result.action,
        confidence: result.confidence || 0.8,
        entities: result.entities || [],
        goal: result.goal,
        parameters: result.parameters || {},
      };
    } catch (error) {
      logger.error('意图识别失败', { error, input });
      throw new PerceptionError('意图识别失败', { input, error });
    }
  }
}

/** 
 * 规则意图识别器
 * 基于规则的简单意图识别（适用于内网/离线环境）
 */
export class RuleBasedIntentRecognizer implements IIntentRecognizer {
  private rules: Array<{
    pattern: RegExp;
    intent: string;
    entities: Array<{ type: string; group: number }>;
  }>;

  constructor() {
    this.rules = [
      {
        pattern: /创建|生成|新建.*ETL|工作流/i,
        intent: 'create_etl_workflow',
        entities: [
          { type: 'action', group: 1 },
          { type: 'target', group: 2 },
        ],
      },
      {
        pattern: /查询|获取|分析.*数据/i,
        intent: 'query_data',
        entities: [{ type: 'action', group: 1 }],
      },
      {
        pattern: /同步|复制|迁移.*(表|数据库)/i,
        intent: 'sync_data',
        entities: [
          { type: 'action', group: 1 },
          { type: 'target', group: 2 },
        ],
      },
    ];
  }

  async recognize(input: string): Promise<ParsedIntent> {
    for (const rule of this.rules) {
      const match = input.match(rule.pattern);
      if (match) {
        const entities: Entity[] = rule.entities.map((e) => ({
          type: e.type,
          value: match[e.group] || '',
        }));

        return {
          action: rule.intent,
          confidence: 0.7,
          entities,
          goal: input,
          parameters: {},
        };
      }
    }

    // 默认意图
    return {
      action: 'unknown',
      confidence: 0.3,
      entities: [],
      goal: input,
      parameters: {},
    };
  }
}

/**
 * 数据源健康检查器
 */
export interface IDataSourceHealthChecker {
  checkNeo4j(uri: string, username: string, password: string): Promise<EnvironmentState>;
  checkPostgreSQL(config: { host: string; port: number; database: string; user: string; password: string }): Promise<EnvironmentState>;
  checkMySQL(config: { host: string; port: number; database: string; user: string; password: string }): Promise<EnvironmentState>;
  checkAPI(endpoint: string, timeout?: number): Promise<EnvironmentState>;
}

/**
 * 环境监控器
 * 监控数据源、工具、资源的状态
 */
export class EnvironmentMonitor implements IEnvironmentMonitor, IDataSourceHealthChecker {
  private checks: Map<string, () => Promise<EnvironmentState>>;
  private states: Map<string, EnvironmentState>;
  private healthCheckers: IDataSourceHealthChecker;

  constructor(healthCheckers?: IDataSourceHealthChecker) {
    this.checks = new Map();
    this.states = new Map();
    this.healthCheckers = healthCheckers || this;
    this.registerDefaultChecks();
  }

  private registerDefaultChecks() {
    // 系统资源检查
    this.registerCheck('system:resources', async () => ({
      type: EnvironmentType.SYSTEM,
      name: 'system_resources',
      status: 'online',
      metrics: {
        memory: process.memoryUsage().heapUsed / 1024 / 1024,
        cpu: process.cpuUsage().user / 1000000,
      },
      lastCheck: Date.now(),
    }));

    // LLM 服务检查
    this.registerCheck('tool:llm', async () => {
      const hasApiKey = !!process.env.SILICONFLOW_API_KEY || !!process.env.OPENAI_API_KEY;
      return {
        type: EnvironmentType.TOOL,
        name: 'llm_service',
        status: hasApiKey ? 'online' : 'degraded',
        metadata: { 
          provider: process.env.SILICONFLOW_API_KEY ? 'siliconflow' : 'openai',
          configured: hasApiKey 
        },
        lastCheck: Date.now(),
      };
    });
  }

  /**
   * Neo4j 健康检查
   */
  async checkNeo4j(uri: string, username: string, password: string): Promise<EnvironmentState> {
    try {
      // 动态导入 Neo4j 驱动（如果安装了）
      let neo4j: any;
      try {
        neo4j = require('neo4j-driver');
      } catch {
        return {
          type: EnvironmentType.DATA_SOURCE,
          name: 'neo4j',
          status: 'unknown',
          metadata: { error: 'neo4j-driver 未安装' },
          lastCheck: Date.now(),
        };
      }

      const driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
        connectionTimeout: 5000,
      });
      
      const session = driver.session();
      await session.run('RETURN 1');
      await session.close();
      await driver.close();

      return {
        type: EnvironmentType.DATA_SOURCE,
        name: 'neo4j',
        status: 'online',
        lastCheck: Date.now(),
      };
    } catch (error) {
      return {
        type: EnvironmentType.DATA_SOURCE,
        name: 'neo4j',
        status: 'offline',
        metadata: { error: (error as Error).message },
        lastCheck: Date.now(),
      };
    }
  }

  /**
   * PostgreSQL 健康检查
   */
  async checkPostgreSQL(config: { host: string; port: number; database: string; user: string; password: string }): Promise<EnvironmentState> {
    try {
      // 动态导入 pg（如果安装了）
      let pg: any;
      try {
        pg = require('pg');
      } catch {
        return {
          type: EnvironmentType.DATA_SOURCE,
          name: 'postgresql',
          status: 'unknown',
          metadata: { error: 'pg 未安装' },
          lastCheck: Date.now(),
        };
      }

      const client = new pg.Client({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        connectionTimeoutMillis: 5000,
      });

      await client.connect();
      const result = await client.query('SELECT NOW()');
      await client.end();

      return {
        type: EnvironmentType.DATA_SOURCE,
        name: 'postgresql',
        status: 'online',
        metadata: { serverTime: result.rows[0].now },
        lastCheck: Date.now(),
      };
    } catch (error) {
      return {
        type: EnvironmentType.DATA_SOURCE,
        name: 'postgresql',
        status: 'offline',
        metadata: { error: (error as Error).message },
        lastCheck: Date.now(),
      };
    }
  }

  /**
   * MySQL 健康检查
   */
  async checkMySQL(config: { host: string; port: number; database: string; user: string; password: string }): Promise<EnvironmentState> {
    try {
      // 动态导入 mysql2（如果安装了）
      let mysql: any;
      try {
        mysql = require('mysql2/promise');
      } catch {
        return {
          type: EnvironmentType.DATA_SOURCE,
          name: 'mysql',
          status: 'unknown',
          metadata: { error: 'mysql2 未安装' },
          lastCheck: Date.now(),
        };
      }

      const connection = await mysql.createConnection({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        connectTimeout: 5000,
      });

      await connection.ping();
      await connection.end();

      return {
        type: EnvironmentType.DATA_SOURCE,
        name: 'mysql',
        status: 'online',
        lastCheck: Date.now(),
      };
    } catch (error) {
      return {
        type: EnvironmentType.DATA_SOURCE,
        name: 'mysql',
        status: 'offline',
        metadata: { error: (error as Error).message },
        lastCheck: Date.now(),
      };
    }
  }

  /**
   * API 健康检查
   */
  async checkAPI(endpoint: string, timeout: number = 5000): Promise<EnvironmentState> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      return {
        type: EnvironmentType.TOOL,
        name: `api_${endpoint.replace(/[^\w]/g, '_')}`,
        status: response.ok ? 'online' : 'degraded',
        metrics: { statusCode: response.status, responseTime: timeout },
        lastCheck: Date.now(),
      };
    } catch (error) {
      return {
        type: EnvironmentType.TOOL,
        name: `api_${endpoint.replace(/[^\w]/g, '_')}`,
        status: 'offline',
        metadata: { error: (error as Error).message },
        lastCheck: Date.now(),
      };
    }
  }

  /**
   * 注册数据源健康检查
   */
  registerDataSourceCheck(name: string, type: 'neo4j' | 'postgresql' | 'mysql' | 'api', config: any) {
    const checkKey = `${EnvironmentType.DATA_SOURCE}:${name}`;
    
    this.registerCheck(checkKey, async () => {
      switch (type) {
        case 'neo4j':
          return this.checkNeo4j(config.uri, config.username, config.password);
        case 'postgresql':
          return this.checkPostgreSQL(config);
        case 'mysql':
          return this.checkMySQL(config);
        case 'api':
          return this.checkAPI(config.endpoint, config.timeout);
        default:
          return {
            type: EnvironmentType.DATA_SOURCE,
            name,
            status: 'unknown',
            lastCheck: Date.now(),
          };
      }
    });
  }

  registerCheck(name: string, checkFn: () => Promise<EnvironmentState>) {
    this.checks.set(name, checkFn);
  }

  async checkStatus(type: EnvironmentType, name: string): Promise<EnvironmentState> {
    const key = `${type}:${name}`;
    const check = this.checks.get(key);

    if (!check) {
      return {
        type,
        name,
        status: 'unknown',
        lastCheck: Date.now(),
      };
    }

    try {
      const state = await check();
      this.states.set(key, state);
      return state;
    } catch (error) {
      const errorState: EnvironmentState = {
        type,
        name,
        status: 'offline',
        lastCheck: Date.now(),
        metadata: { error: (error as Error).message },
      };
      this.states.set(key, errorState);
      return errorState;
    }
  }

  async checkAll(): Promise<EnvironmentState[]> {
    const results: EnvironmentState[] = [];
    for (const [key, check] of this.checks) {
      try {
        const state = await check();
        this.states.set(key, state);
        results.push(state);
      } catch (error) {
        logger.error(`环境检查失败: ${key}`, { error });
      }
    }
    return results;
  }

  getState(key: string): EnvironmentState | undefined {
    return this.states.get(key);
  }
}

/**
 * 多模态输入处理器
 * 将图片、音频、文档等转换为文本
 */
export class MultimodalProcessor {
  private llmClient: any;

  constructor(llmClient?: any) {
    this.llmClient = llmClient;
  }

  /**
   * 处理多模态输入
   */
  async process(input: MultimodalInput): Promise<string> {
    switch (input.type) {
      case 'image':
        return this.processImage(input);
      case 'audio':
        return this.processAudio(input);
      case 'document':
        return this.processDocument(input);
      case 'table':
        return this.processTable(input);
      case 'text':
        return typeof input.content === 'string' 
          ? input.content 
          : input.content.toString('utf-8');
      default:
        throw new PerceptionError(`不支持的输入类型: ${input.type}`);
    }
  }

  /**
   * 图片处理 - OCR + 理解
   */
  private async processImage(input: MultimodalInput): Promise<string> {
    if (!this.llmClient) {
      throw new PerceptionError('图片处理需要 LLM 客户端');
    }
    
    // 如果是基于 OpenAI 的模型，支持视觉能力
    try {
      const base64Image = input.content.toString('base64');
      const response = await this.llmClient.chat([
        {
          role: 'user',
          content: [
            { type: 'text', text: '请描述这张图片的内容，如果是数据流程图、架构图或数据库表结构，请详细说明其中的组件和关系。' },
            {
              type: 'image_url',
              image_url: {
                url: `data:${input.mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ]);
      return response;
    } catch (error) {
      logger.error('图片处理失败', { error });
      return `[图片: ${input.metadata?.filename || 'unknown'} - 无法解析]`;
    }
  }

  /**
   * 音频处理 - 语音识别
   */
  private async processAudio(input: MultimodalInput): Promise<string> {
    // 简化实现 - 实际需要调用语音识别服务
    logger.info('音频输入，需语音识别', { filename: input.metadata?.filename });
    
    // 如果是文本格式的音频文件（如 SRT 字幕），直接返回
    if (input.mimeType === 'text/plain' || input.mimeType === 'application/srt') {
      return input.content.toString('utf-8');
    }
    
    return `[音频: ${input.metadata?.filename || 'unknown'} - 请先转换为文本]`;
  }

  /**
   * 文档处理 - 提取文本
   */
  private async processDocument(input: MultimodalInput): Promise<string> {
    const content = input.content.toString('utf-8');
    
    // 根据文档类型处理
    if (input.mimeType === 'application/json') {
      try {
        const json = JSON.parse(content);
        return this.formatJsonForAgent(json);
      } catch {
        return content;
      }
    }
    
    if (input.mimeType === 'text/csv' || input.mimeType === 'text/tsv') {
      return this.formatTableForAgent(content, input.mimeType);
    }
    
    if (input.mimeType === 'application/xml' || input.mimeType === 'text/xml') {
      return this.formatXmlForAgent(content);
    }
    
    // 普通文本
    return content.substring(0, 5000); // 限制长度
  }

  /**
   * 表格处理
   */
  private async processTable(input: MultimodalInput): Promise<string> {
    const content = input.content.toString('utf-8');
    return this.formatTableForAgent(content, input.mimeType);
  }

  /**
   * 格式化 JSON 为 Agent 可理解的文本
   */
  private formatJsonForAgent(json: any): string {
    const parts: string[] = [];
    
    if (json.source && json.target) {
      parts.push(`数据源: ${JSON.stringify(json.source)}`);
      parts.push(`数据目标: ${JSON.stringify(json.target)}`);
    }
    
    if (json.transformations?.length) {
      parts.push(`转换步骤: ${json.transformations.map((t: any) => t.name || t.type).join(', ')}`);
    }
    
    if (parts.length === 0) {
      return JSON.stringify(json, null, 2).substring(0, 2000);
    }
    
    return parts.join('\n');
  }

  /**
   * 格式化表格为 Agent 可理解的文本
   */
  private formatTableForAgent(content: string, mimeType: string): string {
    const delimiter = mimeType === 'text/tsv' ? '\t' : ',';
    const lines = content.split('\n').slice(0, 20); // 只取前20行
    
    if (lines.length < 2) return content;
    
    const headers = lines[0].split(delimiter).map(h => h.trim());
    const sample = lines.slice(1, 4).map(line => {
      const cells = line.split(delimiter).map(c => c.trim());
      return headers.map((h, i) => `${h}: ${cells[i] || ''}`).join(', ');
    });
    
    return `表格结构:\n字段: ${headers.join(', ')}\n示例数据:\n${sample.join('\n')}
    `.trim();
  }

  /**
   * 格式化 XML 为 Agent 可理解的文本
   */
  private formatXmlForAgent(content: string): string {
    // 简单提取 XML 中的关键节点
    const nodeMatches = content.match(/<([\w:]+)[^>]*>([^<]+)<\/\1>/g);
    if (nodeMatches) {
      return nodeMatches.slice(0, 50).join('\n'); // 只取前50个节点
    }
    return content.substring(0, 2000);
  }
}

/**
 * 信息清洗与归一化器
 */
export class DataNormalizer {
  private rules: Array<{
    name: string;
    test: (value: any) => boolean;
    transform: (value: any) => any;
  }>;

  constructor() {
    this.rules = this.buildDefaultRules();
  }

  /**
   * 清洗和归一化数据
   */
  clean(data: any): CleanedData {
    const normalizations: CleanedData['normalizations'] = [];
    let cleaned = data;

    // 如果是字符串，进行基础清洗
    if (typeof data === 'string') {
      cleaned = this.cleanString(data);
      if (cleaned !== data) {
        normalizations.push({
          field: 'text',
          original: data,
          normalized: cleaned,
          rule: 'string_cleaning',
        });
      }
    }

    // 如果是对象，递归处理
    if (typeof data === 'object' && data !== null) {
      cleaned = this.cleanObject(data, '', normalizations);
    }

    // 计算质量指标
    const quality = this.calculateQuality(data, cleaned);

    return {
      original: data,
      cleaned,
      normalizations,
      quality,
    };
  }

  /**
   * 字符串清洗
   */
  private cleanString(str: string): string {
    return str
      .trim()
      .replace(/[\s\u200b\u200c\u200d\ufeff]+/g, ' ') // 清除零宽空格
      .replace(/[（\(]/g, '(') // 统一括号
      .replace(/[）\)]/g, ')')
      .replace(/[，,]/g, ',') // 统一逗号
      .replace(/[：:]/g, ':'); // 统一冒号
  }

  /**
   * 对象清洗
   */
  private cleanObject(obj: any, prefix: string, normalizations: CleanedData['normalizations']): any {
    if (Array.isArray(obj)) {
      return obj.map((item, index) => 
        this.cleanObject(item, `${prefix}[${index}]`, normalizations)
      );
    }

    if (typeof obj === 'object' && obj !== null) {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        
        // 应用规则
        for (const rule of this.rules) {
          if (rule.test(value)) {
            const newValue = rule.transform(value);
            if (newValue !== value) {
              normalizations.push({
                field: fullKey,
                original: value,
                normalized: newValue,
                rule: rule.name,
              });
              cleaned[key] = newValue;
              break;
            }
          }
        }
        
        if (!cleaned[key]) {
          cleaned[key] = this.cleanObject(value, fullKey, normalizations);
        }
      }
      return cleaned;
    }

    return obj;
  }

  /**
   * 构建默认清洗规则
   */
  private buildDefaultRules(): Array<{
    name: string;
    test: (value: any) => boolean;
    transform: (value: any) => any;
  }> {
    return [
      // 主机地址归一化
      {
        name: 'host_normalization',
        test: (v: any) => typeof v === 'string' && /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(v),
        transform: (v: any) => 'localhost',
      },
      // 端口号转数字
      {
        name: 'port_to_number',
        test: (v: any) => typeof v === 'string' && /^\d+$/.test(v),
        transform: (v: any) => parseInt(v, 10),
      },
      // 数据库名称小写
      {
        name: 'database_lowercase',
        test: (v: any) => typeof v === 'string' && /database|dbname/i.test(v),
        transform: (v: any) => (v as string).toLowerCase(),
      },
      // 路径统一化
      {
        name: 'path_normalization',
        test: (v: any) => typeof v === 'string' && /[\\/]/.test(v),
        transform: (v: any) => (v as string).replace(/\\/g, '/'),
      },
    ];
  }

  /**
   * 计算数据质量指标
   */
  private calculateQuality(original: any, cleaned: any): CleanedData['quality'] {
    const originalStr = JSON.stringify(original);
    const cleanedStr = JSON.stringify(cleaned);
    
    // 完整性：是否有内容
    const completeness = originalStr.length > 0 ? 1 : 0;
    
    // 有效性：是否包含无效字符
    const invalidChars = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;
    const validity = invalidChars.test(originalStr) ? 0.5 : 1;
    
    // 一致性：格式是否统一
    const consistency = originalStr === cleanedStr ? 1 : 0.8;
    
    return { completeness, validity, consistency };
  }

  /**
   * 添加自定义清洗规则
   */
  addRule(rule: { name: string; test: (value: any) => boolean; transform: (value: any) => any }) {
    this.rules.push(rule);
  }
}

/**
 * 感知层核心类
 */
export class PerceptionLayer {
  private config: PerceptionConfig;
  private intentRecognizer: IIntentRecognizer;
  private environmentMonitor: IEnvironmentMonitor;
  private multimodalProcessor: MultimodalProcessor;
  private dataNormalizer: DataNormalizer;
  private inputs: PerceptionInput[];

  constructor(
    config: PerceptionConfig = {},
    intentRecognizer?: IIntentRecognizer,
    environmentMonitor?: IEnvironmentMonitor,
    llmClient?: any
  ) {
    this.config = {
      enableMultimodal: false,
      enableEnvironmentMonitoring: true,
      environmentCheckInterval: 30000,
      supportedInputTypes: [InputType.TEXT, InputType.JSON, InputType.STRUCTURED],
      ...config,
    };

    this.intentRecognizer = intentRecognizer || new RuleBasedIntentRecognizer();
    this.environmentMonitor = environmentMonitor || new EnvironmentMonitor();
    this.multimodalProcessor = new MultimodalProcessor(llmClient);
    this.dataNormalizer = new DataNormalizer();
    this.inputs = [];

    // 启动环境监控
    if (this.config.enableEnvironmentMonitoring) {
      this.startEnvironmentMonitoring();
    }
  }

  /**
   * 接收并处理输入 - 支持多模态和清洗
   */
  async perceive(
    content: string | object | Buffer | MultimodalInput,
    type: InputType = InputType.TEXT,
    source: string = 'user',
    metadata?: Record<string, any>
  ): Promise<PerceptionInput> {
    let processedContent: string;
    let inputType = type;

    // 多模态输入处理
    if (this.config.enableMultimodal && this.isMultimodalInput(content)) {
      processedContent = await this.multimodalProcessor.process(content as MultimodalInput);
      inputType = this.mapMultimodalType((content as MultimodalInput).type);
    } else if (Buffer.isBuffer(content)) {
      // Buffer 输入尝试作为文本解析
      processedContent = content.toString('utf-8');
    } else if (typeof content === 'object') {
      processedContent = JSON.stringify(content);
    } else {
      processedContent = content as string;
    }

    // 信息清洗和归一化
    const cleaned = this.dataNormalizer.clean(processedContent);
    if (cleaned.normalizations.length > 0) {
      logger.debug('信息已清洗', { 
        normalizations: cleaned.normalizations.length,
        quality: cleaned.quality 
      });
    }

    const input: PerceptionInput = {
      id: uuidv4(),
      type: inputType,
      source,
      content: cleaned.cleaned,
      metadata: {
        ...metadata,
        originalContent: processedContent,
        quality: cleaned.quality,
        normalizations: cleaned.normalizations,
      },
      timestamp: Date.now(),
    };

    this.inputs.push(input);
    logger.info('接收输入', { inputId: input.id, type: inputType, source, quality: cleaned.quality });

    return input;
  }

  /**
   * 检查是否为多模态输入
   */
  private isMultimodalInput(content: any): boolean {
    return content && typeof content === 'object' && 'type' in content && 
           ['image', 'audio', 'document', 'table', 'text'].includes(content.type);
  }

  /**
   * 映射多模态类型到 InputType
   */
  private mapMultimodalType(multimodalType: string): InputType {
    const typeMap: Record<string, InputType> = {
      'image': InputType.IMAGE,
      'audio': InputType.VOICE,
      'document': InputType.FILE,
      'table': InputType.STRUCTURED,
      'text': InputType.TEXT,
    };
    return typeMap[multimodalType] || InputType.TEXT;
  }

  /**
   * 解析意图
   */
  async parseIntent(input: PerceptionInput): Promise<ParsedIntent> {
    if (typeof input.content !== 'string') {
      throw new PerceptionError('当前仅支持文本输入的意图识别');
    }

    const intent = await this.intentRecognizer.recognize(input.content, input.metadata);
    logger.info('意图识别完成', {
      inputId: input.id,
      intent: intent.intent,
      confidence: intent.confidence,
    });

    return intent;
  }

  /**
   * 获取环境状态
   */
  async getEnvironmentState(type: EnvironmentType, name: string): Promise<EnvironmentState> {
    return this.environmentMonitor.checkStatus(type, name);
  }

  /**
   * 获取所有环境状态
   */
  async getAllEnvironmentStates(): Promise<EnvironmentState[]> {
    return this.environmentMonitor.checkAll();
  }

  /**
   * 注册环境检查
   */
  registerEnvironmentCheck(name: string, checkFn: () => Promise<EnvironmentState>) {
    (this.environmentMonitor as EnvironmentMonitor).registerCheck(name, checkFn);
  }

  /**
   * 启动环境监控定时器
   */
  private startEnvironmentMonitoring() {
    setInterval(async () => {
      try {
        await this.environmentMonitor.checkAll();
        logger.debug('环境状态检查完成');
      } catch (error) {
        logger.error('环境状态检查失败', { error });
      }
    }, this.config.environmentCheckInterval);
  }

  /**
   * 获取最近的输入历史
   */
  getRecentInputs(limit: number = 10): PerceptionInput[] {
    return this.inputs.slice(-limit);
  }

  /**
   * 清理历史输入
   */
  clearInputs() {
    this.inputs = [];
  }
}

export default PerceptionLayer;
