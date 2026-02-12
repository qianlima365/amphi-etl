/**
 * 对话数据访问层接口和 PostgreSQL 实现
 * 支持对话会话持久化、用户偏好管理和日志记录
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { createLogger } from '../utils/logger';

const logger = createLogger('DialogueRepository');

// ========================================
// 类型定义
// ========================================

export interface DialogueSession {
  id: string;
  userId?: string;
  context: DialogueContext;
  createdAt: Date;
  updatedAt: Date;
}

export interface DialogueContext {
  messages: DialogueMessage[];
  currentState: string;
  collectedParams: Record<string, Record<string, any>>;
  selectedComponents: {
    input?: ComponentInfo;
    output?: ComponentInfo;
    transformations: ComponentInfo[];
  };
  metadata: {
    isComplete: boolean;
    lastUserIntent?: string;
    pendingQuestions: string[];
  };
}

export interface DialogueMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  intent?: string;
  extractedData?: any;
}

export interface ComponentInfo {
  id: string;
  name: string;
  category: string;
  description?: string;
}

export interface UserPreference {
  userId: string;
  defaultParams: Record<string, any>;
  frequentlyUsed: FrequentlyUsedComponent[];
  lastUsedComponents: LastUsedComponent[];
  updatedAt: Date;
}

export interface FrequentlyUsedComponent {
  componentId: string;
  componentName: string;
  useCount: number;
  lastUsedAt: Date;
}

export interface LastUsedComponent {
  componentId: string;
  componentName: string;
  usedAt: Date;
}

export interface DialogueLog {
  id?: number;
  sessionId: string;
  userId?: string;
  userInput: string;
  intentType: string;
  confidence: number;
  extractedConfig?: Record<string, any>;
  aiResponse: string;
  processingTime?: number;
  createdAt: Date;
}

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  /** true | { rejectUnauthorized: false } 等，与 pg.Pool 的 ssl 选项一致 */
  ssl?: boolean | { rejectUnauthorized?: boolean };
  maxConnections?: number;
  connectionTimeoutMillis?: number;
}

// ========================================
// Repository 接口
// ========================================

export interface IDialogueRepository {
  // 会话管理
  saveSession(session: DialogueSession): Promise<void>;
  loadSession(sessionId: string): Promise<DialogueSession | null>;
  deleteSession(sessionId: string): Promise<void>;
  listUserSessions(userId: string, limit?: number): Promise<DialogueSession[]>;

  // 用户偏好
  saveUserPreference(preference: UserPreference): Promise<void>;
  loadUserPreference(userId: string): Promise<UserPreference | null>;
  updateComponentUsage(userId: string, componentId: string, componentName: string): Promise<void>;

  // 日志记录
  logDialogue(log: DialogueLog): Promise<void>;
  getSessionLogs(sessionId: string): Promise<DialogueLog[]>;
  getUserDialogueHistory(userId: string, limit?: number): Promise<DialogueLog[]>;

  // 连接管理
  close(): Promise<void>;
}

// ========================================
// PostgreSQL 实现
// ========================================

export class PostgresDialogueRepository implements IDialogueRepository {
  private pool: Pool;
  private config: PostgresConfig;

  constructor(config: PostgresConfig) {
    this.config = config;
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl,
      max: config.maxConnections || 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis ?? 10000,
    });

    this.pool.on('error', (err) => {
      logger.error('PostgreSQL 连接池错误', { error: err.message });
    });

    logger.info('PostgreSQL 连接池已初始化', { host: config.host, database: config.database });
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW()');
      client.release();
      logger.info('PostgreSQL 连接测试成功', { time: result.rows[0].now });
      return true;
    } catch (error) {
      const err = error as Error & { code?: string };
      logger.error('PostgreSQL 连接测试失败', {
        message: err?.message ?? String(error),
        code: err?.code,
      });
      return false;
    }
  }

  /**
   * 保存/更新会话
   */
  async saveSession(session: DialogueSession): Promise<void> {
    const query = `
      INSERT INTO dialogue_sessions (id, user_id, context, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        context = EXCLUDED.context,
        updated_at = EXCLUDED.updated_at
    `;

    try {
      await this.pool.query(query, [
        session.id,
        session.userId || null,
        JSON.stringify(session.context),
        session.createdAt,
        session.updatedAt,
      ]);
      logger.debug('会话已保存', { sessionId: session.id, userId: session.userId });
    } catch (error) {
      logger.error('保存会话失败', { error, sessionId: session.id });
      throw error;
    }
  }

  /**
   * 加载会话
   */
  async loadSession(sessionId: string): Promise<DialogueSession | null> {
    const query = `
      SELECT id, user_id, context, created_at, updated_at
      FROM dialogue_sessions
      WHERE id = $1
    `;

    try {
      const result = await this.pool.query(query, [sessionId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        context: typeof row.context === 'string' ? JSON.parse(row.context) : row.context,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error('加载会话失败', { error, sessionId });
      throw error;
    }
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    const query = 'DELETE FROM dialogue_sessions WHERE id = $1';
    
    try {
      await this.pool.query(query, [sessionId]);
      logger.debug('会话已删除', { sessionId });
    } catch (error) {
      logger.error('删除会话失败', { error, sessionId });
      throw error;
    }
  }

  /**
   * 列出用户的所有会话
   */
  async listUserSessions(userId: string, limit: number = 10): Promise<DialogueSession[]> {
    const query = `
      SELECT id, user_id, context, created_at, updated_at
      FROM dialogue_sessions
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT $2
    `;

    try {
      const result = await this.pool.query(query, [userId, limit]);
      
      return result.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        context: typeof row.context === 'string' ? JSON.parse(row.context) : row.context,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error('列出用户会话失败', { error, userId });
      throw error;
    }
  }

  /**
   * 保存用户偏好
   */
  async saveUserPreference(preference: UserPreference): Promise<void> {
    const query = `
      INSERT INTO user_preferences (user_id, default_params, frequently_used, last_used_components, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) DO UPDATE SET
        default_params = EXCLUDED.default_params,
        frequently_used = EXCLUDED.frequently_used,
        last_used_components = EXCLUDED.last_used_components,
        updated_at = EXCLUDED.updated_at
    `;

    try {
      await this.pool.query(query, [
        preference.userId,
        JSON.stringify(preference.defaultParams),
        JSON.stringify(preference.frequentlyUsed),
        JSON.stringify(preference.lastUsedComponents),
        preference.updatedAt,
      ]);
      logger.debug('用户偏好已保存', { userId: preference.userId });
    } catch (error) {
      logger.error('保存用户偏好失败', { error, userId: preference.userId });
      throw error;
    }
  }

  /**
   * 加载用户偏好
   */
  async loadUserPreference(userId: string): Promise<UserPreference | null> {
    const query = `
      SELECT user_id, default_params, frequently_used, last_used_components, updated_at
      FROM user_preferences
      WHERE user_id = $1
    `;

    try {
      const result = await this.pool.query(query, [userId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        userId: row.user_id,
        defaultParams: typeof row.default_params === 'string' ? JSON.parse(row.default_params) : row.default_params,
        frequentlyUsed: typeof row.frequently_used === 'string' ? JSON.parse(row.frequently_used) : row.frequently_used,
        lastUsedComponents: typeof row.last_used_components === 'string' ? JSON.parse(row.last_used_components) : row.last_used_components,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error('加载用户偏好失败', { error, userId });
      throw error;
    }
  }

  /**
   * 更新组件使用记录
   */
  async updateComponentUsage(
    userId: string,
    componentId: string,
    componentName: string
  ): Promise<void> {
    const now = new Date();

    // 先加载现有偏好
    const preference = await this.loadUserPreference(userId) || {
      userId,
      defaultParams: {},
      frequentlyUsed: [],
      lastUsedComponents: [],
      updatedAt: now,
    };

    // 更新最近使用
    preference.lastUsedComponents = preference.lastUsedComponents
      .filter((c) => c.componentId !== componentId)
      .slice(0, 9); // 保留最近10个
    
    preference.lastUsedComponents.unshift({
      componentId,
      componentName,
      usedAt: now,
    });

    // 更新使用频率
    const existingFreq = preference.frequentlyUsed.find(
      (f) => f.componentId === componentId
    );
    
    if (existingFreq) {
      existingFreq.useCount++;
      existingFreq.lastUsedAt = now;
    } else {
      preference.frequentlyUsed.push({
        componentId,
        componentName,
        useCount: 1,
        lastUsedAt: now,
      });
    }

    preference.updatedAt = now;

    // 保存
    await this.saveUserPreference(preference);
  }

  /**
   * 记录对话日志
   */
  async logDialogue(log: DialogueLog): Promise<void> {
    const query = `
      INSERT INTO dialogue_logs 
        (session_id, user_id, user_input, intent_type, confidence, extracted_config, ai_response, processing_time, created_at)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    try {
      await this.pool.query(query, [
        log.sessionId,
        log.userId || null,
        log.userInput,
        log.intentType,
        log.confidence,
        log.extractedConfig ? JSON.stringify(log.extractedConfig) : null,
        log.aiResponse,
        log.processingTime || null,
        log.createdAt,
      ]);
      logger.debug('对话日志已记录', { sessionId: log.sessionId });
    } catch (error) {
      logger.error('记录对话日志失败', { error, sessionId: log.sessionId });
      throw error;
    }
  }

  /**
   * 获取会话的所有日志
   */
  async getSessionLogs(sessionId: string): Promise<DialogueLog[]> {
    const query = `
      SELECT id, session_id, user_id, user_input, intent_type, confidence, 
             extracted_config, ai_response, processing_time, created_at
      FROM dialogue_logs
      WHERE session_id = $1
      ORDER BY created_at ASC
    `;

    try {
      const result = await this.pool.query(query, [sessionId]);
      
      return result.rows.map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        userId: row.user_id,
        userInput: row.user_input,
        intentType: row.intent_type,
        confidence: row.confidence,
        extractedConfig: typeof row.extracted_config === 'string' 
          ? JSON.parse(row.extracted_config) 
          : row.extracted_config,
        aiResponse: row.ai_response,
        processingTime: row.processing_time,
        createdAt: row.created_at,
      }));
    } catch (error) {
      logger.error('获取会话日志失败', { error, sessionId });
      throw error;
    }
  }

  /**
   * 获取用户对话历史
   */
  async getUserDialogueHistory(userId: string, limit: number = 50): Promise<DialogueLog[]> {
    const query = `
      SELECT id, session_id, user_id, user_input, intent_type, confidence, 
             extracted_config, ai_response, processing_time, created_at
      FROM dialogue_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    try {
      const result = await this.pool.query(query, [userId, limit]);
      
      return result.rows.map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        userId: row.user_id,
        userInput: row.user_input,
        intentType: row.intent_type,
        confidence: row.confidence,
        extractedConfig: typeof row.extracted_config === 'string' 
          ? JSON.parse(row.extracted_config) 
          : row.extracted_config,
        aiResponse: row.ai_response,
        processingTime: row.processing_time,
        createdAt: row.created_at,
      }));
    } catch (error) {
      logger.error('获取用户对话历史失败', { error, userId });
      throw error;
    }
  }

  /**
   * 关闭连接池
   */
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('PostgreSQL 连接池已关闭');
  }
}

// ========================================
// 工厂函数
// ========================================

export function createPostgresRepositoryFromEnv(): PostgresDialogueRepository {
  const useSsl = process.env.POSTGRES_SSL === 'true' || process.env.POSTGRES_SSL === '1';
  const rejectUnauthorized = process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false';
  const ssl: PostgresConfig['ssl'] = useSsl
    ? rejectUnauthorized
      ? true
      : { rejectUnauthorized: false }
    : false;

  const config: PostgresConfig = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DATABASE || 'agent_memory',
    user: process.env.POSTGRES_USER || 'agent',
    password: process.env.POSTGRES_PASSWORD || '',
    ssl,
    maxConnections: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '10', 10),
    connectionTimeoutMillis: parseInt(process.env.POSTGRES_CONNECT_TIMEOUT || '10000', 10),
  };

  return new PostgresDialogueRepository(config);
}

export default PostgresDialogueRepository;
