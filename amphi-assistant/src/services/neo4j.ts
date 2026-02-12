/**
 * Neo4j 知识图谱连接实现
 */

import neo4j, { Driver, Session, AuthToken } from 'neo4j-driver';
import { createLogger } from '../utils/logger';
import { IKnowledgeGraph } from '../core/ontologies';
import { UUID } from '../types';

const logger = createLogger('Neo4jKnowledgeGraph');

/** Neo4j 属性值：基本类型或其数组 */
type Neo4jPropertyValue = string | number | boolean | null | (string | number | boolean)[];

/**
 * Neo4j 只支持基本类型或基本类型数组，将嵌套对象序列化为 JSON 字符串
 */
function toNeo4jProperties(properties: Record<string, any>): Record<string, Neo4jPropertyValue> {
  const out: Record<string, Neo4jPropertyValue> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === null || value === undefined) {
      out[key] = null;
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (Array.isArray(value)) {
      const flat = value.every(
        (v) => v === null || v === undefined || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
      );
      out[key] = flat ? (value as (string | number | boolean)[]) : JSON.stringify(value);
    } else if (typeof value === 'object') {
      out[key] = JSON.stringify(value);
    } else {
      out[key] = String(value);
    }
  }
  return out;
}

/**
 * Neo4j 配置
 */
export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

/**
 * Neo4j 知识图谱实现
 */
export class Neo4jKnowledgeGraph implements IKnowledgeGraph {
  private driver: Driver;
  private database?: string;

  constructor(config: Neo4jConfig) {
    const auth: AuthToken = neo4j.auth.basic(config.username, config.password);
    this.driver = neo4j.driver(config.uri, auth);
    this.database = config.database;
    logger.info('Neo4j 连接已初始化', { uri: config.uri });
  }

  /**
   * 验证连接
   */
  async verifyConnectivity(): Promise<boolean> {
    try {
      await this.driver.verifyConnectivity();
      logger.info('Neo4j 连接验证成功');
      return true;
    } catch (error) {
      logger.error('Neo4j 连接验证失败', { error });
      return false;
    }
  }

  /**
   * 执行 Cypher 查询
   */
  async query(cypher: string, params?: Record<string, any>): Promise<any[]> {
    const session: Session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(cypher, params);
      const records = result.records;
      const cypherPreview = cypher.replace(/\s+/g, ' ').trim().slice(0, 120);
      logger.debug('数据库·查询节点与边', {
        recordCount: records.length,
        cypherPreview: cypherPreview + (cypher.length > 120 ? '...' : ''),
        paramsKeys: params ? Object.keys(params) : [],
      });
      return records.map((record) => {
        const obj: Record<string, any> = {};
        for (const key of record.keys) {
          const keyStr = String(key);
          const value = record.get(keyStr);
          // 处理 Neo4j 节点类型
          if (value && typeof value === 'object' && 'properties' in value) {
            obj[keyStr] = {
              ...(value as any).properties,
              labels: (value as any).labels,
            };
          } else {
            obj[keyStr] = value;
          }
        }
        return obj;
      });
    } finally {
      await session.close();
    }
  }

  /**
   * 创建节点
   */
  async createNode(label: string, properties: Record<string, any>): Promise<UUID> {
    const session: Session = this.driver.session({ database: this.database });
    try {
      const id = properties.id || crypto.randomUUID();
      const cypher = `
        CREATE (n:${label} $properties)
        RETURN n
      `;
      const safeProps = toNeo4jProperties({ ...properties, id });
      await session.run(cypher, { properties: safeProps });
      logger.debug('节点创建成功', { label, id });
      return id;
    } finally {
      await session.close();
    }
  }

  /**
   * 创建关系
   */
  async createEdge(
    fromId: UUID,
    toId: UUID,
    type: string,
    properties?: Record<string, any>
  ): Promise<void> {
    const session: Session = this.driver.session({ database: this.database });
    try {
      const cypher = `
        MATCH (a {id: $fromId}), (b {id: $toId})
        CREATE (a)-[r:${type} $properties]->(b)
        RETURN r
      `;
      const safeProps = toNeo4jProperties(properties || {});
      await session.run(cypher, { fromId, toId, properties: safeProps });
      logger.debug('关系创建成功', { fromId, toId, type });
    } finally {
      await session.close();
    }
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    await this.driver.close();
    logger.info('Neo4j 连接已关闭');
  }
}

/**
 * 从环境变量创建 Neo4j 连接
 */
export function createNeo4jFromEnv(): Neo4jKnowledgeGraph {
  const uri = process.env.NEO4J_URI;
  const username = process.env.NEO4J_USER;
  const password = process.env.NEO4J_PASSWORD;

  if (!uri || !username || !password) {
    throw new Error('Neo4j 环境变量未配置 (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD)');
  }

  return new Neo4jKnowledgeGraph({ uri, username, password });
}

export default Neo4jKnowledgeGraph;
