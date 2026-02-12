/**
 * Amphi ETL Agent - 核心类
 * 
 * 重构自原 etl-agent.ts，采用模块化架构：
 * - 感知层: 用户输入 + 环境状态
 * - 记忆层: 工作记忆 + 经验记忆 + 知识记忆
 * - 认知层: 意图理解 + 语义规划
 * - 执行层: 工具调用 + Pipeline 生成
 */

import { v4 as uuidv4 } from 'uuid';
import { 
  OpenAILLMService,
  Neo4jKnowledgeGraph,
  createLogger,
} from '../../../../src';
import { PostgresDialogueRepository } from '../../../../src/repositories/dialogue';
import { OntologyLayer } from '../../../../src/core/ontologies';
import { ExecutionContext } from '../../../../src/types';

import {
  Component,
  ETLConfig,
  DialoguePhase,
  UserIntent,
  DialogueMessage,
  UserPreferences,
  ProcessResult,
  AgentOptions,
  SessionState,
} from '../types';

import { OutputHandler, ConsoleOutput, SilentOutput } from '../utils/output';
import { generateId } from '../utils/helpers';

import type { Redis } from 'ioredis';
import { IntentService } from '../services/intent';
import { ComponentService } from '../services/component';
import { OntologyCacheService } from '../services/ontology-cache';
import { ParameterService } from '../services/parameter';
import { PipelineService } from '../services/pipeline';
import { SessionService } from '../services/session';

import { PerceptionAdapter } from '../layers/perception';
import { MemoryAdapter } from '../layers/memory';
import { CognitionAdapter, ETLDependencyBuilder } from '../layers/cognition';
import { ExecutionAdapter } from '../layers/execution';

const logger = createLogger('AmphiETLAgent');

export interface AmphiETLAgentOptions {
  llm: OpenAILLMService;
  kg: Neo4jKnowledgeGraph;
  repository: PostgresDialogueRepository;
  /** 可选：Redis 客户端，用于本体库全量数据短期缓存（30 分钟），每次对话缓存一次 */
  redis?: Redis;
  /** 工作空间目录，用于保存生成的 Pipeline 文件；可通过配置文件或环境变量 ETL_WORKSPACE_DIR 配置 */
  workspaceDir?: string;
  userId?: string;
  sessionId?: string;
  output?: OutputHandler;
}

export class AmphiETLAgent {
  // 依赖服务
  private llm: OpenAILLMService;
  private kg: Neo4jKnowledgeGraph;
  private repository: PostgresDialogueRepository;
  
  // 业务服务
  private intentService: IntentService;
  private componentService: ComponentService;
  private ontologyCache: OntologyCacheService | null;
  private parameterService: ParameterService;
  private pipelineService: PipelineService;
  private sessionService: SessionService;
  
  // 层适配器
  private perception: PerceptionAdapter;
  private memory: MemoryAdapter;
  private cognition?: CognitionAdapter;
  private execution: ExecutionAdapter;
  
  // 输出处理器
  private output: OutputHandler;
  
  // 状态
  private sessionId: string;
  private userId: string;
  private config: ETLConfig = { transformations: [], params: {} };
  private phase: DialoguePhase = 'INITIAL';
  private history: DialogueMessage[] = [];
  private preferences: UserPreferences = {
    commonHosts: {},
    commonPorts: {},
    recentFilePaths: [],
    recentDatabases: [],
    parameterFrequency: {},
  };
  private environmentStates: Map<string, any> = new Map();
  private parametersRequiringUserInput: Array<{
    componentId: string;
    componentName: string;
    paramName: string;
    reason: string;
  }> = [];
  private currentExperienceId?: string;

  constructor(options: AmphiETLAgentOptions) {
    this.llm = options.llm;
    this.kg = options.kg;
    this.repository = options.repository;
    this.userId = options.userId || 'anonymous';
    this.sessionId = options.sessionId || uuidv4();
    this.output = options.output || new ConsoleOutput();
    
    // 初始化服务
    this.intentService = new IntentService({ llm: this.llm, output: this.output });
    this.componentService = new ComponentService({ kg: this.kg });
    this.ontologyCache = options.redis ? new OntologyCacheService({ redis: options.redis }) : null;
    this.parameterService = new ParameterService();
    this.pipelineService = new PipelineService({
      outputDir: options.workspaceDir,
    });
    this.sessionService = new SessionService({ repository: this.repository });
    
    // 初始化层适配器
    this.perception = new PerceptionAdapter({ llm: this.llm });
    this.memory = new MemoryAdapter({ kg: this.kg });
    this.execution = new ExecutionAdapter();
  }

  // ========================================
  // 生命周期方法
  // ========================================

  /**
   * 初始化 Agent
   */
  async initialize(): Promise<void> {
    logger.info('Agent 初始化开始', { sessionId: this.sessionId, userId: this.userId });

    // 1. 创建工作记忆
    this.memory.createWorkingMemory('amphi-etl', this.sessionId);

    // 2. 加载用户偏好
    this.preferences = await this.sessionService.loadUserPreferences(this.userId);
    logger.debug('用户偏好已加载', { keys: Object.keys(this.preferences) });

    // 3. 尝试恢复会话
    const restored = await this.sessionService.loadLastSession(
      this.userId,
      (id) => this.componentService.getDetail(id)
    );
    
    if (restored) {
      this.sessionId = restored.sessionId!;
      this.phase = restored.phase!;
      this.config = restored.config!;
      this.history = restored.history!;
      this.preferences = restored.preferences!;
      logger.info('会话已恢复', { sessionId: this.sessionId, phase: this.phase });
    } else {
      logger.info('新会话', { sessionId: this.sessionId });
    }

    // 4. 初始化认知层和执行层
    await this.initializeLayers();

    // 5. 环境检查
    await this.performEnvironmentCheck();

    logger.info('Agent 初始化完成');
  }

  /**
   * 初始化认知层和执行层
   */
  private async initializeLayers(): Promise<void> {
    // 创建本体论层
    const ontologyLayer = new OntologyLayer();
    
    // 同步知识记忆
    await this.memory.syncFromOntology(this.kg, ontologyLayer);
    
    // 初始化认知层
    this.cognition = new CognitionAdapter({ llm: this.llm, ontologyLayer });
    const wm = this.memory.getWorkingMemory(this.sessionId);
    if (wm) this.cognition.setWorkingMemory(wm);
    logger.info('认知层已初始化');

    // 初始化执行层
    this.execution.initializeTools(this.kg, ontologyLayer, this.memory.getMemoryLayer());
    logger.info('执行层已初始化', { toolCount: this.execution.listTools().length });
  }

  /**
   * 执行环境检查
   */
  private async performEnvironmentCheck(): Promise<void> {
    if (process.env.NEO4J_URI) {
      this.perception.registerDataSourceCheck('neo4j', 'neo4j', {
        uri: process.env.NEO4J_URI,
        username: process.env.NEO4J_USER || 'neo4j',
        password: process.env.NEO4J_PASSWORD || 'password'
      });
    }
    
    const states = await this.perception.checkEnvironment();
    states.forEach(s => this.environmentStates.set(s.name, s));
  }

  // ========================================
  // 核心处理流程
  // ========================================

  /**
   * 处理用户输入（主入口）
   */
  async process(userInput: string): Promise<ProcessResult> {
    const processStart = Date.now();
    logger.debug('接收输入', { sessionId: this.sessionId, phase: this.phase });

    // 1. 感知层处理
    const perceptionResult = await this.perception.perceive(
      userInput,
      undefined,
      'user',
      { sessionId: this.sessionId, phase: this.phase }
    );
    
    const contentStr = typeof perceptionResult.content === 'string'
      ? perceptionResult.content
      : JSON.stringify(perceptionResult.content);

    // 2. 记录历史
    this.history.push({ role: 'user', content: contentStr, timestamp: Date.now() });
    this.memory.updateWorkingContext(this.sessionId, 'lastInput', contentStr);
    this.memory.updateWorkingContext(this.sessionId, 'currentPhase', this.phase);

    // 2.5 若处于「选择保存方式」阶段，直接根据用户输入执行生成或再次询问
    if (this.phase === 'CHOOSING_SAVE_MODE') {
      const choice = this.parseSaveModeChoice(contentStr);
      let response: string;
      let isComplete = false;
      if (choice === 'workspace') {
        response = await this.executeGeneration(true);
        isComplete = true;
      } else if (choice === 'direct') {
        response = await this.executeGeneration(false);
        isComplete = true;
      } else {
        response =
          '请选择保存方式：\n\n**1) 保存到工作空间** — 将 Pipeline 保存为文件到配置的工作空间目录\n' +
          '**2) 直接输出** — 仅在此处返回 Pipeline 内容，不写入文件\n\n' +
          '请回复 **1** 或 **2**，或说「保存到工作空间」/「直接输出」。';
      }
      this.history.push({ role: 'assistant', content: response, timestamp: Date.now() });
      await this.persistState();
      await this.sessionService.logDialogueTurn({
        sessionId: this.sessionId,
        userId: this.userId,
        userInput: contentStr,
        intentType: choice ? 'ACCEPT' : 'AMBIGUOUS',
        confidence: 1,
        extractedConfig: choice ? { saveMode: choice } : undefined,
        aiResponse: response,
        processingTimeMs: Date.now() - processStart,
      });
      return {
        response,
        isComplete,
        phase: this.phase,
        config: this.config,
        pipelineFile: isComplete ? this.getLastPipelinePath() : undefined,
      };
    }

    // 3. COLLECTING 阶段：检查参数
    if (this.phase === 'COLLECTING') {
      this.parameterService.fillDefaults(this.config, this.history, this.preferences);
      const stillMissingUser = this.getMissingUserInputParams();
      const stillMissingCritical = this.parameterService.getMissingCritical(this.config);
      if (stillMissingUser.length === 0 && stillMissingCritical.length === 0) {
        this.phase = 'CONFIRMING';
      }
    }

    // 4. 认知层：意图理解
    const intent = await this.intentService.understandIntent(contentStr, {
      phase: this.phase,
      config: this.config,
      history: this.history,
      environmentStates: this.environmentStates,
    });
    
    logger.info('意图识别完成', { type: intent.type, confidence: intent.confidence });

    // 5. 根据意图类型处理
    let response = '';
    let isComplete = false;

    switch (intent.type) {
      case 'NEW_REQUIREMENT':
        response = await this.handleNewRequirement(intent);
        break;
      case 'ACCEPT':
        response = await this.handleAccept(intent);
        isComplete = this.phase === 'COMPLETED';
        break;
      case 'REJECT':
        response = await this.handleReject(intent);
        break;
      case 'MODIFY':
        response = await this.handleModify(intent);
        break;
      case 'ADD_COMPONENT':
        response = await this.handleAddComponent(intent);
        break;
      case 'REMOVE_COMPONENT':
        response = await this.handleRemoveComponent(intent);
        break;
      case 'QUESTION':
        response = await this.handleQuestion(intent, userInput);
        break;
      case 'AMBIGUOUS':
      default:
        response = await this.handleAmbiguous(userInput);
    }

    // 6. 记录响应并持久化到数据库
    this.history.push({ role: 'assistant', content: response, timestamp: Date.now() });
    await this.persistState();
    await this.sessionService.logDialogueTurn({
      sessionId: this.sessionId,
      userId: this.userId,
      userInput: contentStr,
      intentType: intent.type,
      confidence: intent.confidence,
      extractedConfig: intent.extractedInfo,
      aiResponse: response,
      processingTimeMs: Date.now() - processStart,
    });

    return {
      response,
      isComplete,
      phase: this.phase,
      config: this.config,
      pipelineFile: isComplete ? this.getLastPipelinePath() : undefined,
    };
  }

  // ========================================
  // 意图处理器
  // ========================================

  /**
   * 处理新需求
   */
  private async handleNewRequirement(intent: UserIntent): Promise<string> {
    this.phase = 'PROPOSING';
    this.config = { transformations: [], params: {} };

    const requirementText = this.history[this.history.length - 1]?.content || '';
    const inputKeyword = intent.extractedInfo?.sourceType || '';
    const outputKeyword = intent.extractedInfo?.targetType || '';

    // 1. 提取关键词
    const { inputKeywords, outputKeywords } = await this.componentService.extractKeywordsFromRequirement(
      requirementText,
      this.llm
    );
    
    const effectiveInputKw = inputKeyword ? [inputKeyword, ...inputKeywords] : inputKeywords;
    const effectiveOutputKw = outputKeyword ? [outputKeyword, ...outputKeywords] : outputKeywords;

    // 2. 获取本体库全量数据（优先 Redis 短期缓存，30 分钟；未配置或未命中则从 Neo4j 拉取并写回缓存）
    this.output.info('正在从组件库加载全量组件…');
    let allComponents =
      this.ontologyCache !== null ? await this.ontologyCache.get(this.sessionId) : null;
    if (allComponents === null) {
      allComponents = await this.componentService.getAll();
      if (this.ontologyCache !== null) {
        await this.ontologyCache.set(this.sessionId, allComponents);
      }
    }
    const allInputs = ComponentService.filterInputs(allComponents);
    const allOutputs = ComponentService.filterOutputs(allComponents);

    logger.info('本体库·全量加载·调试', {
      total: allComponents.length,
      inputCount: allInputs.length,
      outputCount: allOutputs.length,
      components: allComponents.map((c) => ({ id: c.id, name: c.name, category: c.category })),
      inputIds: allInputs.map((c) => c.id),
      outputIds: allOutputs.map((c) => c.id),
    });

    if (allInputs.length === 0) return '系统中暂无可用的「输入/数据源」类组件，请检查 Neo4j 知识库。';
    if (allOutputs.length === 0) return '系统中暂无可用的「输出/目标」类组件，请检查 Neo4j 知识库。';

    // 3. 按关键词排序
    const rankedInputs = this.componentService.rankByKeywords(allInputs, effectiveInputKw);
    const rankedOutputs = this.componentService.rankByKeywords(allOutputs, effectiveOutputKw);
    const maxCandidates = 40;

    // 4. 选择最佳组件
    this.output.info(`正在从 ${rankedInputs.slice(0, maxCandidates).length} 个输入、${rankedOutputs.slice(0, maxCandidates).length} 个输出中匹配…`);
    const bestMatch = await this.componentService.selectBestCombination(
      rankedInputs.slice(0, maxCandidates),
      rankedOutputs.slice(0, maxCandidates),
      requirementText,
      this.llm
    );

    // 5. 获取组件详情
    this.config.input = await this.componentService.getDetail(bestMatch.inputId);
    this.config.output = await this.componentService.getDetail(bestMatch.outputId);

    if (!this.config.input || !this.config.output) {
      return `已匹配到组合，但获取组件详情失败，请稍后重试。`;
    }

    this.output.info(`已匹配: ${this.config.input.name} → ${this.config.output.name}`);

    // 6. 检索相似经验
    const similarExps = this.memory.findSimilarExperiences('etl_pipeline', {
      source: this.config.input.name,
      target: this.config.output.name,
    });
    if (similarExps.length > 0) {
      this.currentExperienceId = similarExps[0].id;
    }

    // 7. 填充参数并判断需要用户输入的参数
    this.parameterService.fillDefaults(this.config, this.history, this.preferences);
    this.parametersRequiringUserInput = await this.parameterService.getRequiringUserInput(
      this.config,
      this.llm
    );
    
    const missingUser = this.getMissingUserInputParams();
    const missingCritical = this.parameterService.getMissingCritical(this.config);
    const hasAnyMissing = missingUser.length > 0 || missingCritical.length > 0;

    if (hasAnyMissing) {
      this.phase = 'COLLECTING';
      if (missingUser.length > 0) {
        return (
          this.formatProposal() +
          '\n\n📌 **以下参数需要您提供：**\n' +
          this.parameterService.formatMissing(missingUser) +
          '\n\n请直接说明参数值，或说「直接生成」使用默认值。'
        );
      }
    }

    return this.formatProposal() + '\n\n这个方案是否符合您的需求？';
  }

  /**
   * 处理确认
   */
  private async handleAccept(intent: UserIntent): Promise<string> {
    if (this.phase === 'INITIAL') {
      return '请告诉我您想要完成什么数据处理任务？';
    }

    const forceGenerate = Boolean(intent.forceGenerate);
    const missingFromLLM = this.getMissingUserInputParams();
    const missingCritical = this.parameterService.getMissingCritical(this.config);
    const hasAnyMissing = missingFromLLM.length > 0 || missingCritical.length > 0;

    if (forceGenerate || !hasAnyMissing) {
      if (forceGenerate && hasAnyMissing) {
        logger.info('用户要求直接生成', { missingCount: missingFromLLM.length + missingCritical.length });
      }
      this.phase = 'CHOOSING_SAVE_MODE';
      return (
        '✅ 方案已确认，请选择保存方式：\n\n' +
        '**1) 保存到工作空间** — 将 Pipeline 保存为文件到配置的工作空间目录\n' +
        '**2) 直接输出** — 仅在此处返回 Pipeline 内容，不写入文件\n\n' +
        '请回复 **1** 或 **2**，或说「保存到工作空间」/「直接输出」。'
      );
    }

    this.phase = 'COLLECTING';
    if (missingFromLLM.length > 0) {
      return (
        '✅ 方案已确认。\n\n为生成工作流，请先提供以下参数：\n\n' +
        this.parameterService.formatMissing(missingFromLLM) +
        '\n\n提供完成后请再说一次「确认」或「生成」。若希望先用默认值生成，可说「直接生成」。'
      );
    }

    return (
      '✅ 方案已确认。\n\n还缺以下信息：\n' +
      missingCritical.map(p => `• ${p}`).join('\n') +
      '\n\n请继续提供，或说「直接生成」。'
    );
  }

  /**
   * 处理拒绝
   */
  private async handleReject(_intent: UserIntent): Promise<string> {
    if (this.phase === 'INITIAL') {
      return '请告诉我您想要完成什么数据处理任务？';
    }
    return '请问哪里不符合您的需求？请告诉我具体需要修改的地方。';
  }

  /**
   * 处理修改
   */
  private async handleModify(intent: UserIntent): Promise<string> {
    const changes = intent.extractedInfo?.paramChanges;
    
    if (changes) {
      for (const [compId, params] of Object.entries(changes)) {
        if (!this.config.params[compId]) this.config.params[compId] = {};
        Object.assign(this.config.params[compId], params);
      }
      this.phase = 'PROPOSING';
      return `已更新配置。\n${this.formatProposal()}\n\n还有其他需要修改的吗？`;
    }

    return '好的，请告诉我具体要修改什么？（例如：改成localhost、换另一个表名）';
  }

  /**
   * 处理添加组件
   */
  private async handleAddComponent(intent: UserIntent): Promise<string> {
    const componentToAdd = intent.extractedInfo?.componentToAdd;
    
    if (!componentToAdd) {
      return '您想添加什么组件？可以描述一下功能，比如"数据清洗"、"过滤空值"等。';
    }

    const searchKeyword = componentToAdd.componentType || componentToAdd.description || '';
    this.output.info(`正在查找组件: ${searchKeyword}`);
    
    const transformComps = await this.componentService.searchTransform(searchKeyword);
    
    if (transformComps.length === 0) {
      return `抱歉，没有找到"${searchKeyword}"相关的转换组件。\n\n您可以尝试：\n• "过滤数据"\n• "数据清洗"\n• "字段转换"`;
    }

    const selectedComp = await this.componentService.selectBestTransform(
      transformComps,
      searchKeyword,
      this.llm
    );
    
    const compDetail = await this.componentService.getDetail(selectedComp.id);
    if (!compDetail) return '抱歉，无法获取组件详情。';

    this.config.transformations.push(compDetail);
    
    if (!this.config.params[compDetail.id]) {
      this.config.params[compDetail.id] = {};
    }
    compDetail.parameters.forEach((param) => {
      if (param.defaultValue && !this.config.params[compDetail.id][param.name]) {
        this.config.params[compDetail.id][param.name] = param.defaultValue;
      }
    });

    this.phase = 'PROPOSING';
    return `✅ 已添加 ${compDetail.name}\n${this.formatProposal()}\n\n还有其他需要添加或修改的吗？`;
  }

  /**
   * 处理移除组件
   */
  private async handleRemoveComponent(intent: UserIntent): Promise<string> {
    const componentToRemove = intent.extractedInfo?.componentToRemove;
    
    if (!componentToRemove || this.config.transformations.length === 0) {
      return '当前没有可以移除的转换组件。';
    }

    const index = this.config.transformations.findIndex(
      t => t.id.toLowerCase().includes(componentToRemove.componentType.toLowerCase())
    );
    
    if (index >= 0) {
      const removed = this.config.transformations.splice(index, 1)[0];
      delete this.config.params[removed.id];
      return `已移除 ${removed.name}\n${this.formatProposal()}`;
    }

    return `没有找到要移除的组件。当前转换链：${this.config.transformations.map(t => t.name).join(' → ') || '无'}`;
  }

  /**
   * 处理问题
   */
  private async handleQuestion(_intent: UserIntent, question: string): Promise<string> {
    const relevantComp = this.config.input || this.config.output;
    
    const prompt = `
回答用户关于ETL组件的问题。

当前组件: ${relevantComp ? `${relevantComp.name} - ${relevantComp.description}` : '未选择'}
可用参数: ${relevantComp ? relevantComp.parameters.map(p => `${p.name}(${p.description})`).join(', ') : '无'}

问题: "${question}"

给出简洁、专业的回答:
`;

    return this.llm.complete(prompt);
  }

  /**
   * 处理模糊输入
   */
  private async handleAmbiguous(userInput: string): Promise<string> {
    if (this.history.length <= 1) {
      return `你好！我是ETL编排助手。\n\n请描述您的数据处理需求，例如：\n• "把CSV文件导入MySQL数据库"\n• "从PostgreSQL导出数据到CSV"\n• "同步两个数据库的表数据"`;
    }

    if (this.phase === 'COLLECTING') {
      const missingNow = this.getMissingUserInputParams();
      const missingCriticalNow = this.parameterService.getMissingCritical(this.config);
      
      if (missingNow.length === 0 && missingCriticalNow.length === 0) {
        return '✅ 参数已齐。请说「确认」或「生成」以生成工作流。';
      }
      
      if (missingNow.length > 0) {
        return (
          '已记录您刚才提供的信息。\n\n还缺以下参数：\n' +
          this.parameterService.formatMissing(missingNow) +
          '\n\n请继续提供，或说「直接生成」。'
        );
      }
    }

    return '能详细说明一下吗？我没有完全理解您的意思。';
  }

  // ========================================
  // 执行生成
  // ========================================

  /**
   * 解析用户选择的保存方式
   */
  private parseSaveModeChoice(content: string): 'workspace' | 'direct' | null {
    const t = content.trim().toLowerCase().replace(/\s+/g, '');
    if (t === '1' || t === '工作空间' || t === '保存到工作空间' || t === '保存' || /^保存到/.test(t) || /工作空间/.test(t)) {
      return 'workspace';
    }
    if (t === '2' || t === '直接输出' || t === '仅输出' || t === '输出' || /^直接输出/.test(t)) {
      return 'direct';
    }
    return null;
  }

  /**
   * 执行 Pipeline 生成
   * @param saveToWorkspace true = 保存到工作空间目录；false = 仅返回内容，不写文件
   */
  private async executeGeneration(saveToWorkspace: boolean): Promise<string> {
    const pipeline = this.pipelineService.generate(this.config);
    let filepath: string | undefined;
    if (saveToWorkspace) {
      filepath = this.pipelineService.save(pipeline);
    }
    this.phase = 'COMPLETED';

    const { preferences, hasNew } = this.parameterService.learnFromConfig(
      this.config,
      this.preferences
    );
    if (hasNew) {
      this.preferences = preferences;
      await this.sessionService.saveUserPreferences(this.userId, this.preferences);
    }

    if (this.currentExperienceId) {
      this.memory.updateExperienceSuccess(this.currentExperienceId, true);
    } else {
      const exp = this.memory.recordExperience('etl_pipeline', `${this.config.input?.name}→${this.config.output?.name}`, JSON.stringify({
        input: this.config.input?.id,
        output: this.config.output?.id,
        transformations: this.config.transformations.map(t => t.id),
        params: this.config.params
      }), {
        source: this.config.input?.name,
        target: this.config.output?.name,
      });
      this.currentExperienceId = exp.id;
    }

    this.memory.setTempResult(this.sessionId, 'final_pipeline', {
      filepath,
      input: this.config.input?.name,
      output: this.config.output?.name
    });

    if (saveToWorkspace && filepath) {
      return `✅ Pipeline 已生成并保存到工作空间！\n📁 文件: ${filepath}`;
    }
    const jsonStr = JSON.stringify(pipeline, null, 2);
    return `✅ Pipeline 已生成（直接输出）：\n\n\`\`\`json\n${jsonStr}\n\`\`\``;
  }

  // ========================================
  // 工具增强方法
  // ========================================

  /**
   * 使用工具处理
   */
  async processWithTools(userInput: string): Promise<ProcessResult & { toolCalls?: any[] }> {
    if (!this.execution.areToolsRegistered()) {
      return this.process(userInput);
    }

    // 构建执行上下文
    const context: ExecutionContext = {
      taskId: generateId(),
      agentId: this.sessionId,
      sessionId: this.sessionId,
      planId: generateId(),
      memory: {
        shortTerm: new Map(),
        get: async (key: string) => this.memory.getWorkingMemory(this.sessionId)?.tempResults.get(key),
        set: async (key: string, value: any) => {
          this.memory.setTempResult(this.sessionId, key, value);
        },
      },
      logger: console,
    };

    // 让LLM决定调用哪些工具
    const toolDecision = await this.decideToolCalls(userInput);
    const toolResults: any[] = [];

    for (const call of toolDecision) {
      const result = await this.execution.executeTool(call.tool, call.params, context);
      toolResults.push({ tool: call.tool, params: call.params, result });
      
      if (result.success) {
        this.memory.setTempResult(this.sessionId, `tool_result_${call.tool}`, result.data);
      }
    }

    // 使用工具结果增强意图理解
    const result = await this.process(userInput);
    return { ...result, toolCalls: toolResults };
  }

  /**
   * 决定调用哪些工具
   */
  private async decideToolCalls(userInput: string): Promise<Array<{ tool: string; params: any }>> {
    const tools = this.execution.listTools();
    
    const prompt = `
根据用户输入，决定是否需要调用工具。

用户输入: "${userInput}"
当前阶段: ${this.phase}

可用工具:
${tools.map(t => `- ${t.name}: ${t.description?.slice(0, 100)}`).join('\n')}

请返回需要调用的工具列表（JSON）：
[{"tool": "工具名", "params": {参数对象}, "reason": "调用原因"}]
如果不需要调用工具，返回 []。
`;

    try {
      const response = await this.llm.complete(prompt);
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : '[]');
      return Array.isArray(parsed) ? parsed.filter((p: any) => p.tool) : [];
    } catch {
      return [];
    }
  }

  // ========================================
  // 辅助方法
  // ========================================

  private getMissingUserInputParams(): Array<{ componentName: string; paramName: string; reason: string }> {
    const missing: Array<{ componentName: string; paramName: string; reason: string }> = [];
    for (const item of this.parametersRequiringUserInput) {
      const value = this.config.params[item.componentId]?.[item.paramName];
      if (value === undefined || value === null || String(value).trim() === '') {
        missing.push({ componentName: item.componentName, paramName: item.paramName, reason: item.reason });
      }
    }
    return missing;
  }

  private formatProposal(): string {
    return this.pipelineService.formatProposal(this.config);
  }

  private getLastPipelinePath(): string | undefined {
    const wm = this.memory.getWorkingMemory(this.sessionId);
    const result = wm?.tempResults.get('final_pipeline');
    return result?.filepath;
  }

  private async persistState(): Promise<void> {
    await this.sessionService.saveSession({
      sessionId: this.sessionId,
      userId: this.userId,
      phase: this.phase,
      config: this.config,
      history: this.history,
      preferences: this.preferences,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // ========================================
  // Getters
  // ========================================

  getSessionId(): string { return this.sessionId; }
  getUserId(): string { return this.userId; }
  getPhase(): DialoguePhase { return this.phase; }
  getConfig(): ETLConfig { return this.config; }
  getHistory(): DialogueMessage[] { return [...this.history]; }
}

export default AmphiETLAgent;
