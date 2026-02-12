/**
 * 会话管理服务
 * 从原 etl-agent.ts 提取
 */

import { PostgresDialogueRepository } from '../../../../src/repositories/dialogue';
import { createLogger } from '../../../../src/utils/logger';
import { SessionState, ETLConfig, DialoguePhase, UserPreferences, Component } from '../types';

const logger = createLogger('SessionService');

export interface SessionServiceOptions {
  repository: PostgresDialogueRepository;
}

export class SessionService {
  private repository: PostgresDialogueRepository;

  constructor(options: SessionServiceOptions) {
    this.repository = options.repository;
  }

  /**
   * 加载用户偏好
   */
  async loadUserPreferences(userId: string): Promise<UserPreferences> {
    const defaults: UserPreferences = {
      commonHosts: {},
      commonPorts: {},
      recentFilePaths: [],
      recentDatabases: [],
      parameterFrequency: {},
    };

    try {
      const preference = await this.repository.loadUserPreference(userId);
      const prefs = preference?.defaultParams?.etl as Record<string, unknown> | undefined;
      if (prefs && typeof prefs === 'object') {
        return {
          commonHosts: (prefs.commonHosts as Record<string, string>) || {},
          commonPorts: (prefs.commonPorts as Record<string, string>) || {},
          recentFilePaths: Array.isArray(prefs.recentFilePaths) ? prefs.recentFilePaths as string[] : [],
          recentDatabases: Array.isArray(prefs.recentDatabases) ? prefs.recentDatabases as string[] : [],
          parameterFrequency: (prefs.parameterFrequency as Record<string, number>) || {},
        };
      }
    } catch (e) {
      logger.error('加载用户偏好失败', { error: (e as Error).message });
    }

    return defaults;
  }

  /**
   * 保存用户偏好
   */
  async saveUserPreferences(userId: string, preferences: UserPreferences): Promise<void> {
    try {
      const preference = await this.repository.loadUserPreference(userId);
      const existing = preference ?? {
        userId,
        defaultParams: {},
        frequentlyUsed: [],
        lastUsedComponents: [],
        updatedAt: new Date(),
      };
      await this.repository.saveUserPreference({
        ...existing,
        defaultParams: { ...existing.defaultParams, etl: preferences },
        updatedAt: new Date(),
      });
      logger.debug('记忆层·用户偏好已保存');
    } catch (e) {
      logger.error('保存用户偏好失败', { error: (e as Error).message });
    }
  }

  /**
   * 尝试加载最近会话
   */
  async loadLastSession(
    userId: string,
    getComponentDetail: (id: string) => Promise<Component | undefined>
  ): Promise<Partial<SessionState> | null> {
    try {
      const sessions = await this.repository.listUserSessions(userId, 1);
      
      if (sessions.length === 0) return null;
      
      const lastSession = sessions[0];
      const timeDiff = Date.now() - new Date(lastSession.updatedAt).getTime();
      
      // 只恢复30分钟内的未完成会话
      if (timeDiff > 30 * 60 * 1000) return null;
      if (lastSession.context.metadata?.isComplete) return null;

      // 恢复配置
      const config: ETLConfig = {
        transformations: [],
        params: lastSession.context.collectedParams || {},
      };

      // 恢复组件选择
      const selected = lastSession.context.selectedComponents;
      if (selected?.input?.id) {
        config.input = await getComponentDetail(selected.input.id);
      }
      if (selected?.output?.id) {
        config.output = await getComponentDetail(selected.output.id);
      }
      if (selected?.transformations?.length) {
        for (const t of selected.transformations) {
          const detail = await getComponentDetail(t.id);
          if (detail) config.transformations.push(detail);
        }
      }

      const messages = lastSession.context.messages || [];
      
      return {
        sessionId: lastSession.id,
        userId,
        phase: lastSession.context.currentState as DialoguePhase,
        config,
        history: messages.filter((m): m is { role: 'user' | 'assistant'; content: string; timestamp: number } =>
          (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
        ).map(m => ({ 
          role: m.role as 'user' | 'assistant', 
          content: m.content, 
          timestamp: (m as any).timestamp ?? Date.now() 
        })),
        preferences: await this.loadUserPreferences(userId),
        updatedAt: new Date(lastSession.updatedAt),
      };
    } catch (e) {
      logger.error('记忆层·加载历史会话失败', { error: (e as Error).message });
      return null;
    }
  }

  /**
   * 记录单轮对话到 dialogue_logs 表（便于按轮次查询、分析）
   */
  async logDialogueTurn(params: {
    sessionId: string;
    userId: string;
    userInput: string;
    intentType: string;
    confidence: number;
    extractedConfig?: Record<string, any>;
    aiResponse: string;
    processingTimeMs?: number;
  }): Promise<void> {
    try {
      await this.repository.logDialogue({
        sessionId: params.sessionId,
        userId: params.userId,
        userInput: params.userInput,
        intentType: params.intentType,
        confidence: params.confidence,
        extractedConfig: params.extractedConfig,
        aiResponse: params.aiResponse,
        processingTime: params.processingTimeMs ?? undefined,
        createdAt: new Date(),
      });
    } catch (e) {
      logger.error('记录对话日志失败', { error: (e as Error).message });
    }
  }

  /**
   * 保存会话状态（含完整对话 history 到 dialogue_sessions.context）
   */
  async saveSession(state: SessionState): Promise<void> {
    try {
      await this.repository.saveSession({
        id: state.sessionId,
        userId: state.userId,
        context: {
          messages: state.history,
          currentState: state.phase,
          collectedParams: state.config.params,
          selectedComponents: {
            input: state.config.input ? { 
              id: state.config.input.id, 
              name: state.config.input.name, 
              category: state.config.input.category 
            } : undefined,
            output: state.config.output ? { 
              id: state.config.output.id, 
              name: state.config.output.name, 
              category: state.config.output.category 
            } : undefined,
            transformations: state.config.transformations.map(t => ({ 
              id: t.id, 
              name: t.name, 
              category: t.category 
            })),
          },
          metadata: { 
            isComplete: state.phase === 'COMPLETED', 
            pendingQuestions: [], 
            lastUserIntent: '' 
          },
        },
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      });
      logger.debug('会话已保存', { sessionId: state.sessionId, historyLength: state.history.length });
    } catch (e) {
      logger.error('保存会话失败', { error: (e as Error).message, sessionId: state.sessionId });
      throw e;
    }
  }
}

export default SessionService;
