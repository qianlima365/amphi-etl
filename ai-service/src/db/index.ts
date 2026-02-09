/**
 * SQLite Database for storing user API keys and model configurations
 */

import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Load providers from config file and sync to DB
import { getProvidersFromConfig, getProviderFromConfig } from '../config/providers';

// Database path
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'ai-service.sqlite');

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database
const db: DatabaseType = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  -- Model providers table
  CREATE TABLE IF NOT EXISTS model_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    base_url TEXT,
    supported_models TEXT,  -- JSON array of model names
    requires_api_key INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- User API keys table
  CREATE TABLE IF NOT EXISTS user_api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    api_key TEXT NOT NULL,
    base_url TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES model_providers(id),
    UNIQUE(user_id, provider_id)
  );

  -- User model preferences table
  CREATE TABLE IF NOT EXISTS user_preferences (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    default_provider_id TEXT,
    default_model TEXT,
    temperature REAL DEFAULT 0.7,
    top_p REAL DEFAULT 0.9,
    max_tokens INTEGER DEFAULT 2048,
    custom_prompt TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (default_provider_id) REFERENCES model_providers(id)
  );

  -- Chat history table
  CREATE TABLE IF NOT EXISTS chat_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    provider_id TEXT,
    model TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Create indexes
  CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);
  CREATE INDEX IF NOT EXISTS idx_chat_history_user_session ON chat_history(user_id, session_id);
`);

// Sync providers from config file to DB (so user_api_keys can reference provider_id)
const insertProvider = db.prepare(`
  INSERT OR REPLACE INTO model_providers (id, name, display_name, description, base_url, supported_models, requires_api_key)
  VALUES (@id, @name, @display_name, @description, @base_url, @supported_models, @requires_api_key)
`);

const configProviders = getProvidersFromConfig();
for (const p of configProviders) {
  const modelIds = (p.models || []).map((m: { id: string }) => m.id);
  insertProvider.run({
    id: p.id,
    name: p.name,
    display_name: p.displayName,
    description: p.description,
    base_url: p.baseUrl,
    supported_models: JSON.stringify(modelIds),
    requires_api_key: p.requiresApiKey !== false ? 1 : 0
  });
}

// Export types
export interface ModelProvider {
  id: string;
  name: string;
  display_name: string;
  description: string;
  base_url: string;
  supported_models: string[];
  requires_api_key: boolean;
  is_active: boolean;
}

export interface UserApiKey {
  id: string;
  user_id: string;
  provider_id: string;
  api_key: string;
  base_url?: string;
  is_active: boolean;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  default_provider_id?: string;
  default_model?: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  custom_prompt?: string;
}

// Database operations
export const dbOps = {
  // Get all providers (from config for full model list; DB only used for API keys)
  getProviders(): ModelProvider[] {
    const list = getProvidersFromConfig();
    return list.map(p => ({
      id: p.id,
      name: p.name,
      display_name: p.displayName,
      description: p.description,
      base_url: p.baseUrl,
      supported_models: (p.models || []).map(m => m.id),
      requires_api_key: p.requiresApiKey !== false,
      is_active: true
    }));
  },

  // Get provider by ID (from config for llmService)
  getProvider(providerId: string): ModelProvider | null {
    return getProviderFromConfig(providerId);
  },

  // Save user API key
  saveApiKey(userId: string, providerId: string, apiKey: string, baseUrl?: string): UserApiKey {
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO user_api_keys (id, user_id, provider_id, api_key, base_url)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, provider_id) DO UPDATE SET
        api_key = excluded.api_key,
        base_url = excluded.base_url,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(id, userId, providerId, apiKey, baseUrl || null);
    return this.getApiKey(userId, providerId)!;
  },

  // Get user API key for provider
  getApiKey(userId: string, providerId: string): UserApiKey | null {
    const row = db.prepare(`
      SELECT * FROM user_api_keys 
      WHERE user_id = ? AND provider_id = ? AND is_active = 1
    `).get(userId, providerId) as any;
    if (!row) return null;
    return {
      ...row,
      is_active: row.is_active === 1
    };
  },

  // Get all user API keys
  getUserApiKeys(userId: string): UserApiKey[] {
    const rows = db.prepare(`
      SELECT * FROM user_api_keys WHERE user_id = ? AND is_active = 1
    `).all(userId) as any[];
    return rows.map(row => ({
      ...row,
      is_active: row.is_active === 1
    }));
  },

  // Delete user API key
  deleteApiKey(userId: string, providerId: string): boolean {
    const result = db.prepare(`
      UPDATE user_api_keys SET is_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND provider_id = ?
    `).run(userId, providerId);
    return result.changes > 0;
  },

  // Save user preferences
  // 注意：custom_prompt 可以是空字符串，需要特殊处理
  savePreferences(userId: string, prefs: Partial<UserPreferences>): UserPreferences {
    const id = uuidv4();
    
    // 判断 custom_prompt 是否被显式设置（包括空字符串）
    const customPromptProvided = 'custom_prompt' in prefs;
    
    const stmt = db.prepare(`
      INSERT INTO user_preferences (id, user_id, default_provider_id, default_model, temperature, top_p, max_tokens, custom_prompt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        default_provider_id = COALESCE(excluded.default_provider_id, default_provider_id),
        default_model = COALESCE(excluded.default_model, default_model),
        temperature = COALESCE(excluded.temperature, temperature),
        top_p = COALESCE(excluded.top_p, top_p),
        max_tokens = COALESCE(excluded.max_tokens, max_tokens),
        custom_prompt = CASE 
          WHEN ? = 1 THEN excluded.custom_prompt 
          ELSE COALESCE(excluded.custom_prompt, custom_prompt) 
        END,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(
      id, userId,
      prefs.default_provider_id || null,
      prefs.default_model || null,
      prefs.temperature ?? 0.7,
      prefs.top_p ?? 0.9,
      prefs.max_tokens ?? 2048,
      customPromptProvided ? (prefs.custom_prompt ?? '') : null,
      customPromptProvided ? 1 : 0  // 标记是否显式设置了 custom_prompt
    );
    return this.getPreferences(userId)!;
  },

  // Get user preferences
  getPreferences(userId: string): UserPreferences | null {
    const row = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId) as any;
    return row || null;
  },

  // Save chat message
  saveChatMessage(userId: string, sessionId: string, role: string, content: string, providerId?: string, model?: string): void {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO chat_history (id, user_id, session_id, role, content, provider_id, model)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, sessionId, role, content, providerId || null, model || null);
  },

  // Get chat history
  getChatHistory(userId: string, sessionId: string, limit = 20): any[] {
    return db.prepare(`
      SELECT * FROM chat_history 
      WHERE user_id = ? AND session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, sessionId, limit) as any[];
  }
};

export default db;
