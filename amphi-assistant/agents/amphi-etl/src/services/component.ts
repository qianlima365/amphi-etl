/**
 * 组件管理服务
 * 从原 etl-agent.ts 提取
 */

import neo4j from 'neo4j-driver';
import { Neo4jKnowledgeGraph } from '../../../../src';
import { createLogger } from '../../../../src/utils/logger';
import { Component, Parameter } from '../types';

const logger = createLogger('ComponentService');

export interface ComponentServiceOptions {
  kg: Neo4jKnowledgeGraph;
}

export class ComponentService {
  private kg: Neo4jKnowledgeGraph;

  constructor(options: ComponentServiceOptions) {
    this.kg = options.kg;
  }

  /**
   * 获取本体库全量组件（不按 input/output/transform 策略过滤，一次性拉取所有 Component）
   */
  async getAll(): Promise<Component[]> {
    const batchSize = 100;
    const all: Component[] = [];
    let skip = 0;

    const baseQuery = `
      MATCH (c:Component)
      OPTIONAL MATCH (c)-[:HAS_PARAMETER]->(p:Parameter)
      WITH c, collect(p {.id, .name, .paramType, .defaultValue, .required, .description}) as params
      RETURN c.id as id, c.name as name, c.category as category,
             c.description as description, params
      ORDER BY c.name
      SKIP $skip LIMIT $limit
    `;

    while (true) {
      const results = await this.kg.query(baseQuery, {
        skip: neo4j.int(skip),
        limit: neo4j.int(batchSize),
      });
      if (results.length === 0) break;
      for (const r of results as any[]) {
        all.push({
          id: r.id,
          name: r.name,
          category: r.category,
          description: r.description ?? '',
          parameters: r.params || [],
        });
      }
      logger.debug('执行层·全量本体库分批', { batch: results.length, totalSoFar: all.length });
      if (results.length < batchSize) break;
      skip += batchSize;
    }

    logger.info('执行层·全量本体库加载完成', { total: all.length });
    return all;
  }

  /** 从全量组件中按类别筛出 input 类（与 getAllByCategory('input') 规则一致） */
  static filterInputs(all: Component[]): Component[] {
    return all.filter(
      (c) =>
        (c.category || '').toLowerCase().startsWith('input') || (c.category || '').includes('Input')
    );
  }

  /** 从全量组件中按类别筛出 output 类（与 getAllByCategory('output') 规则一致） */
  static filterOutputs(all: Component[]): Component[] {
    return all.filter(
      (c) =>
        (c.category || '').toLowerCase().startsWith('output') ||
        (c.category || '').includes('Output') ||
        (c.category || '').includes('Files')
    );
  }

  /**
   * 获取某类别的所有组件（分批加载）
   */
  async getAllByCategory(category: 'input' | 'output' | 'transform'): Promise<Component[]> {
    const batchSize = 100;
    const all: Component[] = [];
    let skip = 0;

    const categoryCondition =
      category === 'input'
        ? "c.category STARTS WITH 'input' OR c.category CONTAINS 'Input'"
        : category === 'output'
          ? "(c.category STARTS WITH 'output' OR c.category CONTAINS 'Output' OR c.category CONTAINS 'Files')"
          : "c.category CONTAINS 'transform' OR c.category CONTAINS 'Transform'";

    const baseQuery = `
      MATCH (c:Component)
      WHERE ${categoryCondition}
      OPTIONAL MATCH (c)-[:HAS_PARAMETER]->(p:Parameter)
      WITH c, collect(p {.id, .name, .paramType, .defaultValue, .required, .description}) as params
      RETURN c.id as id, c.name as name, c.category as category,
             c.description as description, params
      ORDER BY c.name
      SKIP $skip LIMIT $limit
    `;

    while (true) {
      const results = await this.kg.query(baseQuery, {
        skip: neo4j.int(skip),
        limit: neo4j.int(batchSize),
      });
      if (results.length === 0) break;
      for (const r of results as any[]) {
        all.push({
          id: r.id,
          name: r.name,
          category: r.category,
          description: r.description ?? '',
          parameters: r.params || [],
        });
      }
      logger.debug('执行层·全量组件分批', { category, batch: results.length, totalSoFar: all.length });
      if (results.length < batchSize) break;
      skip += batchSize;
    }

    logger.info('执行层·全量组件加载完成', { category, total: all.length });
    return all;
  }

  /**
   * 搜索组件
   */
  async search(
    type: 'input' | 'output' | 'transform',
    keyword: string,
    limit: number = 20
  ): Promise<Component[]> {
    logger.debug('执行层·组件搜索', { type, keyword });

    const categoryFilter = type === 'input'
      ? "c.category STARTS WITH 'input'"
      : "(c.category STARTS WITH 'output' OR c.category CONTAINS 'Files')";

    const keywordFilter = keyword
      ? `AND (c.name CONTAINS $keyword OR c.description CONTAINS $keyword)`
      : '';

    const query = `
      MATCH (c:Component)
      WHERE ${categoryFilter} ${keywordFilter}
      OPTIONAL MATCH (c)-[:HAS_PARAMETER]->(p:Parameter)
      WITH c, collect(p {.id, .name, .paramType, .defaultValue, .required, .description}) as params
      RETURN c.id as id, c.name as name, c.category as category,
             c.description as description, params
      LIMIT $limit
    `;

    try {
      const results = await this.kg.query(query, keyword ? { keyword, limit } : { limit });
      logger.debug('执行层·组件搜索结果', { count: results.length, type, keyword });
      return results.map((r: any) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        description: r.description,
        parameters: r.params || [],
      }));
    } catch (e) {
      logger.error('执行层·组件搜索失败', { error: (e as Error).message, type, keyword });
      return [];
    }
  }

  /**
   * 搜索转换组件
   */
  async searchTransform(keyword: string, limit: number = 10): Promise<Component[]> {
    logger.debug('执行层·转换组件搜索', { keyword });

    const query = `
      MATCH (c:Component)
      WHERE c.category CONTAINS 'transform' 
         OR c.category CONTAINS 'Transform'
         OR c.name CONTAINS $keyword
         OR c.description CONTAINS $keyword
      OPTIONAL MATCH (c)-[:HAS_PARAMETER]->(p:Parameter)
      WITH c, collect(p {.id, .name, .paramType, .defaultValue, .required, .description}) as params
      RETURN c.id as id, c.name as name, c.category as category, 
             c.description as description, params
      LIMIT $limit
    `;

    try {
      const results = await this.kg.query(query, { keyword, limit });
      logger.debug('执行层·转换组件结果', { count: results.length, keyword });
      return results.map((r: any) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        description: r.description,
        parameters: r.params || [],
      }));
    } catch (e) {
      logger.error('执行层·转换组件搜索失败', { error: (e as Error).message, keyword });
      return [];
    }
  }

  /**
   * 获取组件详情
   */
  async getDetail(id: string): Promise<Component | undefined> {
    logger.debug('执行层·获取组件详情', { id });

    const query = `
      MATCH (c:Component {id: $id})
      OPTIONAL MATCH (c)-[:HAS_PARAMETER]->(p:Parameter)
      WITH c, collect(p {.id, .name, .paramType, .defaultValue, .required, .description}) as params
      RETURN c.id as id, c.name as name, c.category as category,
             c.description as description, params
    `;

    const results = await this.kg.query(query, { id });
    if (results.length === 0) {
      logger.warn('执行层·组件未找到', { id });
      return undefined;
    }

    const r = results[0];
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      description: r.description,
      parameters: r.params || [],
    };
  }

  /**
   * 按关键词排序组件
   */
  rankByKeywords(components: Component[], keywords: string[]): Component[] {
    if (keywords.length === 0) return components;
    const lower = (s: string) => (s || '').toLowerCase();
    const kwArray = keywords.map(lower);
    return [...components].sort((a, b) => {
      const score = (c: Component) => {
        let s = 0;
        const name = lower(c.name);
        const desc = lower(c.description || '');
        for (const k of kwArray) {
          if (name.includes(k) || desc.includes(k)) s++;
        }
        return s;
      };
      return score(b) - score(a);
    });
  }

  /**
   * 从需求中提取组件关键词（使用LLM）
   */
  async extractKeywordsFromRequirement(
    requirement: string,
    llm: { complete: (prompt: string) => Promise<string> }
  ): Promise<{
    inputKeywords: string[];
    outputKeywords: string[];
    transformKeywords: string[];
  }> {
    const prompt = `
你是一个 ETL 组件分析助手。根据用户的自然语言需求，提取出与「数据源/输入」「目标/输出」「转换步骤」相关的关键词。

用户需求："${requirement}"

请返回 JSON，且只返回 JSON：
{
  "inputKeywords": ["与数据源、输入相关的关键词，如 CSV, 文件, MySQL, 数据库, API, Excel"],
  "outputKeywords": ["与目标、输出相关的关键词，如 MySQL, 数据库, CSV, 文件, Kafka"],
  "transformKeywords": ["与中间转换相关的关键词，如 过滤, 清洗, 聚合, filter, transform"]
}

规则：每个数组至少 1 个关键词；可包含中英文；名称要具体。
`;

    try {
      const response = await llm.complete(prompt);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');
      const inputKeywords = Array.isArray(parsed.inputKeywords) ? parsed.inputKeywords : [requirement.slice(0, 20)];
      const outputKeywords = Array.isArray(parsed.outputKeywords) ? parsed.outputKeywords : [requirement.slice(0, 20)];
      const transformKeywords = Array.isArray(parsed.transformKeywords) ? parsed.transformKeywords : [];
      logger.info('认知层·提取组件关键词', { inputKeywords, outputKeywords, transformKeywords });
      return { inputKeywords, outputKeywords, transformKeywords };
    } catch (e) {
      logger.warn('认知层·关键词提取失败', { error: (e as Error).message });
      const fallback = requirement.slice(0, 30);
      return {
        inputKeywords: [fallback],
        outputKeywords: [fallback],
        transformKeywords: [],
      };
    }
  }

  /**
   * 使用LLM选择最佳组件组合
   */
  async selectBestCombination(
    inputs: Component[],
    outputs: Component[],
    requirement: string,
    llm: { completeStream?: (prompt: string, onChunk: (chunk: string) => void) => Promise<void>; complete?: (prompt: string) => Promise<string> }
  ): Promise<{ inputId: string; outputId: string; reason?: string }> {
    logger.debug('认知层·选择最佳组件', { inputCount: inputs.length, outputCount: outputs.length });

    const prompt = `
从候选组件中选择最适合需求的组合。

需求: "${requirement}"

输入候选（数据源）:
${inputs.map(c => `- ${c.id}: ${c.name} - ${(c.description || '').slice(0, 120)}`).join('\n')}

输出候选（目标）:
${outputs.map(c => `- ${c.id}: ${c.name} - ${(c.description || '').slice(0, 120)}`).join('\n')}

请根据用户需求选择最匹配的一个输入组件 id 和一个输出组件 id。只返回 JSON：
{"inputId": "组件id", "outputId": "组件id", "reason": "简短理由"}
`;

    let result = '';
    
    if (llm.completeStream) {
      await llm.completeStream(prompt, (chunk) => { result += chunk; });
    } else if (llm.complete) {
      result = await llm.complete(prompt);
    }

    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');
      const selected = {
        inputId: parsed.inputId || inputs[0]?.id,
        outputId: parsed.outputId || outputs[0]?.id,
        reason: parsed.reason,
      };
      logger.debug('认知层·组件选择结果', selected);
      return selected;
    } catch (e) {
      logger.warn('认知层·选择解析失败，使用默认', { error: (e as Error).message });
      return { inputId: inputs[0]?.id, outputId: outputs[0]?.id };
    }
  }

  /**
   * 选择最佳转换组件
   */
  async selectBestTransform(
    components: Component[],
    requirement: string,
    llm: { completeStream?: (prompt: string, onChunk: (chunk: string) => void) => Promise<void>; complete?: (prompt: string) => Promise<string> }
  ): Promise<Component> {
    if (components.length === 1) return components[0];
    
    const prompt = `
从候选转换组件中选择最适合需求的。

需求: "${requirement}"

候选组件:
${components.map(c => `- ${c.id}: ${c.name} - ${c.description.slice(0, 100)}`).join('\n')}

返回JSON: {"id": "组件ID", "reason": "选择理由"}
`;

    let result = '';
    
    if (llm.completeStream) {
      await llm.completeStream(prompt, (chunk) => { result += chunk; });
    } else if (llm.complete) {
      result = await llm.complete(prompt);
    }

    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');
      const selected = components.find(c => c.id === parsed.id);
      return selected || components[0];
    } catch (e) {
      return components[0];
    }
  }
}

export default ComponentService;
