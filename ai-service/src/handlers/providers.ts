/**
 * Provider and API Key Management Handlers
 * 
 * @swagger
 * tags:
 *   name: Providers
 *   description: Model provider and API key management
 */

import { Request, Response } from 'express';
import { dbOps } from '../db';
import { getProvidersFromConfig } from '../config/providers';
import { LLMService } from '../services/llmService';

/**
 * @swagger
 * /ai/providers:
 *   get:
 *     summary: Get all available model providers (from config, with models list)
 *     tags: [Providers]
 *     responses:
 *       200:
 *         description: List of providers with id, displayName, models[{ id, name, description }]
 */
export async function getProvidersHandler(req: Request, res: Response): Promise<void> {
  try {
    const providers = getProvidersFromConfig();
    res.json({
      success: true,
      providers: providers.map(p => ({
        id: p.id,
        name: p.name,
        displayName: p.displayName,
        description: p.description,
        baseUrl: p.baseUrl,
        requiresApiKey: p.requiresApiKey !== false,
        models: p.models || [],
        supportedModels: (p.models || []).map(m => m.id)
      }))
    });
  } catch (error: any) {
    console.error('Get providers error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * @swagger
 * /ai/apikeys:
 *   post:
 *     summary: Save user API key for a provider
 *     tags: [Providers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - providerId
 *               - apiKey
 *             properties:
 *               userId:
 *                 type: string
 *               providerId:
 *                 type: string
 *               apiKey:
 *                 type: string
 *               baseUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: API key saved
 */
export async function saveApiKeyHandler(req: Request, res: Response): Promise<void> {
  try {
    const { userId, providerId, apiKey, baseUrl } = req.body;

    if (!userId || !providerId || !apiKey) {
      res.status(400).json({ success: false, error: 'userId, providerId, and apiKey are required' });
      return;
    }

    // Verify provider exists
    const provider = dbOps.getProvider(providerId);
    if (!provider) {
      res.status(404).json({ success: false, error: 'Provider not found' });
      return;
    }

    // Save API key
    const saved = dbOps.saveApiKey(userId, providerId, apiKey, baseUrl);

    res.json({
      success: true,
      message: 'API key saved successfully',
      data: {
        providerId: saved.provider_id,
        hasApiKey: true,
        baseUrl: saved.base_url
      }
    });
  } catch (error: any) {
    console.error('Save API key error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * @swagger
 * /ai/apikeys/{userId}:
 *   get:
 *     summary: Get user's configured API keys
 *     tags: [Providers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User's API keys (masked)
 */
export async function getApiKeysHandler(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }

    const apiKeys = dbOps.getUserApiKeys(userId);
    const providers = dbOps.getProviders();

    // Return masked keys with provider info
    const result = providers.map(provider => {
      const userKey = apiKeys.find(k => k.provider_id === provider.id);
      return {
        providerId: provider.id,
        providerName: provider.display_name,
        hasApiKey: !!userKey,
        baseUrl: userKey?.base_url || provider.base_url,
        maskedKey: userKey ? `${userKey.api_key.substring(0, 8)}...${userKey.api_key.slice(-4)}` : null,
        requiresApiKey: provider.requires_api_key
      };
    });

    res.json({ success: true, apiKeys: result });
  } catch (error: any) {
    console.error('Get API keys error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * @swagger
 * /ai/apikeys/{userId}/{providerId}:
 *   delete:
 *     summary: Delete user's API key for a provider
 *     tags: [Providers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: API key deleted
 */
export async function deleteApiKeyHandler(req: Request, res: Response): Promise<void> {
  try {
    const { userId, providerId } = req.params;

    if (!userId || !providerId) {
      res.status(400).json({ success: false, error: 'userId and providerId are required' });
      return;
    }

    const deleted = dbOps.deleteApiKey(userId, providerId);

    if (deleted) {
      res.json({ success: true, message: 'API key deleted' });
    } else {
      res.status(404).json({ success: false, error: 'API key not found' });
    }
  } catch (error: any) {
    console.error('Delete API key error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * @swagger
 * /ai/apikeys/test:
 *   post:
 *     summary: Test API key connection
 *     tags: [Providers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - providerId
 *               - apiKey
 *             properties:
 *               providerId:
 *                 type: string
 *               apiKey:
 *                 type: string
 *               baseUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: Test result
 */
export async function testApiKeyHandler(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const { providerId, apiKey, baseUrl } = req.body;

  // 打印请求信息
  console.log('\n========== [Test API Key] 请求开始 ==========');
  console.log('请求时间:', new Date().toISOString());
  console.log('请求参数:', {
    providerId,
    apiKey: apiKey || '(empty)',
    baseUrl: baseUrl || '(default)'
  });

  try {
    if (!providerId) {
      const errorResult = { success: false, message: 'providerId is required' };
      console.log('返回结果:', errorResult);
      console.log('========== [Test API Key] 请求结束 (参数错误) ==========\n');
      res.status(400).json(errorResult);
      return;
    }

    const provider = dbOps.getProvider(providerId);
    console.log('厂商信息:', provider ? {
      id: provider.id,
      name: provider.name,
      display_name: provider.display_name,
      base_url: provider.base_url,
      requires_api_key: provider.requires_api_key,
      supported_models: provider.supported_models
    } : '(未找到)');

    const keyToUse = provider && !provider.requires_api_key ? (apiKey || '') : apiKey;
    if (provider?.requires_api_key && !keyToUse) {
      const errorResult = { success: false, message: '请先输入 API Key' };
      console.log('返回结果:', errorResult);
      console.log('========== [Test API Key] 请求结束 (缺少 API Key) ==========\n');
      res.status(400).json(errorResult);
      return;
    }

    console.log('调用 LLMService.testConnection...');
    const result = await LLMService.testConnection(providerId, keyToUse, baseUrl);
    const duration = Date.now() - startTime;

    console.log('返回结果:', result);
    console.log(`耗时: ${duration}ms`);
    console.log('========== [Test API Key] 请求结束 (成功) ==========\n');

    res.json(result);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const errorResult = { success: false, message: error.message || '连接测试失败' };

    console.error('错误详情:', error);
    console.log('返回结果:', errorResult);
    console.log(`耗时: ${duration}ms`);
    console.log('========== [Test API Key] 请求结束 (异常) ==========\n');

    res.status(500).json(errorResult);
  }
}

/**
 * @swagger
 * /ai/preferences:
 *   post:
 *     summary: Save user preferences
 *     tags: [Providers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *               defaultProviderId:
 *                 type: string
 *               defaultModel:
 *                 type: string
 *               temperature:
 *                 type: number
 *               topP:
 *                 type: number
 *               maxTokens:
 *                 type: integer
 *               customPrompt:
 *                 type: string
 *     responses:
 *       200:
 *         description: Preferences saved
 */
export async function savePreferencesHandler(req: Request, res: Response): Promise<void> {
  try {
    const { userId, defaultProviderId, defaultModel, temperature, topP, maxTokens, customPrompt } = req.body;

    if (!userId) {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }

    const prefs = dbOps.savePreferences(userId, {
      default_provider_id: defaultProviderId,
      default_model: defaultModel,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      custom_prompt: customPrompt
    });

    res.json({ success: true, preferences: prefs });
  } catch (error: any) {
    console.error('Save preferences error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * @swagger
 * /ai/preferences/{userId}:
 *   get:
 *     summary: Get user preferences
 *     tags: [Providers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User preferences
 */
export async function getPreferencesHandler(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }

    const prefs = dbOps.getPreferences(userId);
    res.json({ success: true, preferences: prefs });
  } catch (error: any) {
    console.error('Get preferences error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
