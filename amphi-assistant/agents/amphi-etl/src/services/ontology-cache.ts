/**
 * 本体库全量数据 - Redis 短期记忆缓存
 *
 * 设计：
 * - Key: etl:ontology:session:{sessionId}  便于按会话查找
 * - Value: JSON { fetchedAt, components }  方便调试与校验
 * - TTL: 30 分钟，每次对话使用同一会话时命中缓存，需要组件信息时直接从缓存匹配
 */

import type { Redis } from 'ioredis';
import { createLogger } from '../../../../src/utils/logger';
import type { Component } from '../types';

const logger = createLogger('OntologyCache');

const KEY_PREFIX = 'etl:ontology:session:';
const TTL_SECONDS = 30 * 60; // 30 分钟

export interface OntologyCachePayload {
  fetchedAt: number;
  components: Component[];
}

export interface OntologyCacheServiceOptions {
  redis: Redis;
  ttlSeconds?: number;
}

export class OntologyCacheService {
  private redis: Redis;
  private ttl: number;

  constructor(options: OntologyCacheServiceOptions) {
    this.redis = options.redis;
    this.ttl = options.ttlSeconds ?? TTL_SECONDS;
  }

  private key(sessionId: string): string {
    return `${KEY_PREFIX}${sessionId}`;
  }

  /**
   * 从缓存获取该会话的本体库全量组件；未命中返回 null
   */
  async get(sessionId: string): Promise<Component[] | null> {
    const k = this.key(sessionId);
    try {
      const raw = await this.redis.get(k);
      if (!raw) {
        logger.debug('本体库缓存未命中', { sessionId, key: k });
        return null;
      }
      const payload = JSON.parse(raw) as OntologyCachePayload;
      if (!Array.isArray(payload.components)) {
        logger.warn('本体库缓存数据格式异常', { sessionId });
        return null;
      }
      logger.info('本体库·从缓存加载', {
        sessionId,
        key: k,
        count: payload.components.length,
        fetchedAt: payload.fetchedAt,
      });
      return payload.components;
    } catch (e) {
      logger.warn('本体库缓存读取失败', { sessionId, error: (e as Error).message });
      return null;
    }
  }

  /**
   * 将本体库全量组件写入缓存，有效期 30 分钟；每次对话缓存一次
   */
  async set(sessionId: string, components: Component[]): Promise<void> {
    const k = this.key(sessionId);
    const payload: OntologyCachePayload = {
      fetchedAt: Date.now(),
      components,
    };
    try {
      await this.redis.setex(k, this.ttl, JSON.stringify(payload));
      logger.info('本体库·写入缓存', {
        sessionId,
        key: k,
        count: components.length,
        ttlSeconds: this.ttl,
      });
    } catch (e) {
      logger.warn('本体库缓存写入失败', { sessionId, error: (e as Error).message });
    }
  }
}
