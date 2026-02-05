/**
 * 从配置文件加载模型厂商与模型列表
 * 配置文件路径: config/providers.json 或环境变量 PROVIDERS_CONFIG
 */

import path from 'path';
import fs from 'fs';

export interface ModelItem {
  id: string;
  name: string;
  description?: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  displayName: string;
  description: string;
  baseUrl: string;
  requiresApiKey: boolean;
  models: ModelItem[];
}

let providersCache: ProviderConfig[] = [];
let configPath: string;

function getConfigPath(): string {
  if (configPath) return configPath;
  configPath = process.env.PROVIDERS_CONFIG || path.join(process.cwd(), 'config', 'providers.json');
  return configPath;
}

/**
 * 重新加载配置文件（修改配置后可在运行时调用）
 */
export function loadProvidersConfig(): ProviderConfig[] {
  const p = getConfigPath();
  try {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
      providersCache = Array.isArray(raw.providers) ? raw.providers : [];
      console.log(`[config] Loaded ${providersCache.length} providers from ${p}`);
    } else {
      console.warn(`[config] Providers config not found: ${p}`);
      providersCache = [];
    }
  } catch (e) {
    console.warn('[config] Failed to load providers config:', e);
    providersCache = [];
  }
  return providersCache;
}

/**
 * 获取所有厂商（供 API 返回给前端，含 models 的完整信息）
 */
export function getProvidersFromConfig(): ProviderConfig[] {
  if (providersCache.length === 0) {
    loadProvidersConfig();
  }
  return providersCache;
}

/**
 * 根据 id 获取单个厂商（供 llmService 使用，兼容 DB 的 ModelProvider 结构）
 */
export function getProviderFromConfig(providerId: string): {
  id: string;
  name: string;
  display_name: string;
  description: string;
  base_url: string;
  supported_models: string[];
  requires_api_key: boolean;
  is_active: boolean;
} | null {
  const list = getProvidersFromConfig();
  const p = list.find(x => x.id === providerId);
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    display_name: p.displayName,
    description: p.description,
    base_url: p.baseUrl,
    supported_models: (p.models || []).map(m => m.id),
    requires_api_key: p.requiresApiKey !== false,
    is_active: true,
  };
}

// 启动时加载一次
loadProvidersConfig();
