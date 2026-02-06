/**
 * Neo4j 连接封装：单例驱动，会话与事务
 * 本地/ Docker 常见问题：Neo4j 4+ 与驱动加密设置需一致，本地开发可关闭加密。
 */

import neo4j, { Driver, Session } from 'neo4j-driver';

let driver: Driver | null = null;

export function getNeo4jDriver(): Driver | null {
  if (driver) return driver;
  let uri = process.env.NEO4J_URI || 'neo4j://localhost:7687';
  // 未显式启用加密时，用 neo4j:// 协议（无 TLS），避免 Neo4j 4+ 与驱动加密默认不一致
  const useEncryption = process.env.NEO4J_ENCRYPTED === 'true';
  if (!useEncryption && uri.startsWith('bolt://')) {
    uri = 'neo4j://' + uri.slice(7);
  }
  const user = process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD || 'password';
  try {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password), { encrypted: useEncryption });
    return driver;
  } catch (e) {
    console.warn('[ontology] Neo4j driver init failed:', (e as Error).message);
    return null;
  }
}

export async function closeNeo4j(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

export async function withSession<T>(fn: (session: Session) => Promise<T>): Promise<T | null> {
  const d = getNeo4jDriver();
  if (!d) return null;
  const session = d.session();
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}

export function isOntologyAvailable(): boolean {
  return getNeo4jDriver() !== null;
}
