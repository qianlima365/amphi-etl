/**
 * 参数管理服务
 * 从原 etl-agent.ts 提取
 */

import { createLogger } from '../../../../src/utils/logger';
import { Component, ETLConfig, UserPreferences } from '../types';

const logger = createLogger('ParameterService');

export interface ParameterServiceOptions {
  // 无需外部依赖
}

export class ParameterService {
  constructor(_options: ParameterServiceOptions = {}) {}

  /**
   * 填充默认参数
   */
  fillDefaults(
    config: ETLConfig,
    history: Array<{ role: string; content: string; timestamp: number }>,
    preferences: UserPreferences
  ): void {
    const historyParams = this.extractFromHistory(history);
    
    [config.input, config.output, ...config.transformations].forEach((comp) => {
      if (!comp) return;
      if (!config.params[comp.id]) config.params[comp.id] = {};

      comp.parameters.forEach((param) => {
        if (!config.params[comp!.id][param.name]) {
          // 从历史对话获取
          const historyValue = this.findInHistory(historyParams, param.name, comp.category);
          if (historyValue) {
            config.params[comp!.id][param.name] = historyValue;
            logger.debug('记忆层·从历史填充参数', { param: param.name });
            return;
          }

          // 从用户偏好获取
          const prefValue = this.getFromPreferences(comp, param.name, preferences);
          if (prefValue) {
            config.params[comp!.id][param.name] = prefValue;
            logger.debug('记忆层·从偏好填充参数', { param: param.name });
            return;
          }
          
          // 使用默认值
          if (param.defaultValue) {
            let value = param.defaultValue;
            
            // 智能默认值
            if (!value || value === '') {
              if (param.name === 'host') value = 'localhost';
              if (param.name === 'port') {
                if (comp.name.toLowerCase().includes('mysql')) value = '3306';
                if (comp.name.toLowerCase().includes('postgres')) value = '5432';
              }
              if (param.name === 'fileLocation') value = 'local';
            }
            
            if (value) config.params[comp!.id][param.name] = value;
          }
        }
      });
    });
  }

  /**
   * 从历史对话中提取参数值
   */
  extractFromHistory(history: Array<{ role: string; content: string }>): Array<{paramName: string; value: string; category?: string}> {
    const params: Array<{paramName: string; value: string; category?: string}> = [];
    
    const patterns = [
      { regex: /主机[:：\s]+(\S+)/i, name: 'host' },
      { regex: /host[:\s]+(\S+)/i, name: 'host' },
      { regex: /端口[:：\s]+(\d+)/i, name: 'port' },
      { regex: /port[:\s]+(\d+)/i, name: 'port' },
      { regex: /数据库[:：\s]+(\S+)/i, name: 'databaseName' },
      { regex: /database[:\s]+(\S+)/i, name: 'databaseName' },
      { regex: /dbname[:\s]+(\S+)/i, name: 'databaseName' },
      { regex: /表[:：\s]+(\S+)/i, name: 'tableName' },
      { regex: /table[:\s]+(\S+)/i, name: 'tableName' },
      { regex: /文件路径[:：\s]+(\S+)/i, name: 'filePath' },
      { regex: /file[:\s]+(\S+)/i, name: 'filePath' },
      { regex: /path[:\s]+(\S+)/i, name: 'filePath' },
      { regex: /用户名[:：\s]+(\S+)/i, name: 'username' },
      { regex: /username[:\s]+(\S+)/i, name: 'username' },
      { regex: /user[:\s]+(\S+)/i, name: 'username' },
      { regex: /密码[:：\s]+(\S+)/i, name: 'password' },
      { regex: /password[:\s]+(\S+)/i, name: 'password' },
    ];
    
    for (const message of history) {
      if (message.role !== 'user') continue;
      
      for (const pattern of patterns) {
        const match = message.content.match(pattern.regex);
        if (match && match[1]) {
          params.push({
            paramName: pattern.name,
            value: match[1].trim()
          });
        }
      }
    }
    
    return params;
  }

  /**
   * 在历史参数中查找匹配值
   */
  findInHistory(
    historyParams: Array<{paramName: string; value: string}>, 
    paramName: string,
    _category: string
  ): string | undefined {
    for (let i = historyParams.length - 1; i >= 0; i--) {
      const p = historyParams[i];
      if (p.paramName === paramName) return p.value;
      // 别名匹配
      if (paramName === 'databaseName' && p.paramName === 'database') return p.value;
      if (paramName === 'tableName' && p.paramName === 'table') return p.value;
      if (paramName === 'filePath' && (p.paramName === 'file' || p.paramName === 'path')) return p.value;
      if (paramName === 'username' && p.paramName === 'user') return p.value;
    }
    return undefined;
  }

  /**
   * 从用户偏好获取参数值
   */
  getFromPreferences(comp: Component, paramName: string, preferences: UserPreferences): string | undefined {
    const compType = comp.category.split('.')[0];
    const key = `${compType}_${comp.name}`;
    
    if (paramName === 'host') return preferences.commonHosts[key];
    if (paramName === 'port') return preferences.commonPorts[key];
    
    return undefined;
  }

  /**
   * 获取缺失的关键参数
   */
  getMissingCritical(config: ETLConfig): string[] {
    const missing: string[] = [];
    
    [config.input, config.output].forEach((comp) => {
      if (!comp) return;
      const params = config.params[comp.id] || {};
      
      comp.parameters.forEach((param) => {
        if (param.required && !params[param.name]) {
          if (['filePath', 'host', 'databaseName', 'tableName'].includes(param.name)) {
            const prompts: Record<string, string> = {
              'filePath': `请提供 ${comp.name} 的文件路径：`,
              'host': `请提供 ${comp.name} 的主机地址（如 localhost）：`,
              'databaseName': '请提供数据库名称：',
              'tableName': '请提供表名：',
            };
            missing.push(prompts[param.name] || `请提供 ${param.name}：`);
          }
        }
      });
    });
    
    return missing;
  }

  /**
   * 使用LLM判断哪些参数需要用户输入
   */
  async getRequiringUserInput(
    config: ETLConfig,
    llm: { complete: (prompt: string) => Promise<string> }
  ): Promise<Array<{
    componentId: string;
    componentName: string;
    paramName: string;
    reason: string;
  }>> {
    const components = [
      config.input,
      config.output,
      ...(config.transformations || []),
    ].filter(Boolean) as Component[];

    if (components.length === 0) return [];

    const paramList = components.map((c) => ({
      componentId: c.id,
      componentName: c.name,
      parameters: (c.parameters || []).map((p) => ({
        name: p.name,
        description: p.description || '',
        required: p.required,
        defaultValue: p.defaultValue || '',
      })),
    }));

    const prompt = `
你是一个 ETL 参数分析助手。根据当前工作流中的组件及其参数定义，判断：哪些参数**必须由用户提供**（如文件路径、数据库连接、表名、账号密码等），哪些可以**仅用默认值、不必询问用户**。

当前组件与参数（JSON）：
${JSON.stringify(paramList, null, 2)}

规则：需要用户提供的通常是：文件路径、主机、端口、数据库名、表名、用户名、密码、API 地址等。可用默认值的：超时、编码、开关等。

只返回 JSON 数组：
[ { "componentId": "id", "componentName": "名称", "paramName": "参数名", "reason": "为何需用户提供" } ]
若无必须由用户提供的参数则返回 []。
`;

    try {
      const response = await llm.complete(prompt);
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : '[]');
      if (!Array.isArray(parsed)) return [];
      const list = parsed
        .filter((p: any) => p && typeof p.componentId === 'string' && typeof p.paramName === 'string')
        .map((p: any) => ({
          componentId: String(p.componentId),
          componentName: String(p.componentName || ''),
          paramName: String(p.paramName),
          reason: String(p.reason || '需用户提供'),
        }));
      logger.info('认知层·需用户填写的参数', { count: list.length });
      return list;
    } catch (e) {
      logger.warn('认知层·需用户参数解析失败', { error: (e as Error).message });
      // 兜底：返回关键必填参数
      const fallback: Array<{ componentId: string; componentName: string; paramName: string; reason: string }> = [];
      [config.input, config.output].forEach((comp) => {
        if (!comp) return;
        (comp.parameters || []).forEach((param) => {
          if (param.required && ['filePath', 'host', 'databaseName', 'tableName', 'username', 'password'].includes(param.name)) {
            fallback.push({
              componentId: comp.id,
              componentName: comp.name,
              paramName: param.name,
              reason: param.description || '必填项',
            });
          }
        });
      });
      return fallback;
    }
  }

  /**
   * 格式化缺失参数提示
   */
  formatMissing(missing: Array<{ componentName: string; paramName: string; reason: string }>): string {
    if (missing.length === 0) return '';
    return missing.map((m) => `- **${m.componentName}** 的 **${m.paramName}**：${m.reason}`).join('\n');
  }

  /**
   * 从配置中学习用户偏好
   */
  learnFromConfig(
    config: ETLConfig,
    currentPreferences: UserPreferences
  ): { preferences: UserPreferences; hasNew: boolean } {
    let hasNew = false;
    const preferences = { ...currentPreferences };
    
    for (const comp of [config.input, config.output]) {
      if (!comp) continue;
      
      const params = config.params[comp.id] || {};
      const compType = comp.category.split('.')[0];
      const key = `${compType}_${comp.name}`;
      
      // 学习主机偏好
      if (params.host && params.host !== 'localhost') {
        if (preferences.commonHosts[key] !== params.host) {
          preferences.commonHosts = { ...preferences.commonHosts, [key]: params.host };
          hasNew = true;
        }
      }
      
      // 学习端口偏好
      if (params.port) {
        if (preferences.commonPorts[key] !== params.port) {
          preferences.commonPorts = { ...preferences.commonPorts, [key]: params.port };
          hasNew = true;
        }
      }
      
      // 学习数据库名
      if (params.databaseName) {
        if (!preferences.recentDatabases.includes(params.databaseName)) {
          preferences.recentDatabases = [params.databaseName, ...preferences.recentDatabases].slice(0, 5);
          hasNew = true;
        }
      }
      
      // 学习文件路径
      if (params.filePath) {
        const dir = params.filePath.substring(0, params.filePath.lastIndexOf('/')) || 
                    params.filePath.substring(0, params.filePath.lastIndexOf('\\'));
        if (dir && !preferences.recentFilePaths.includes(dir)) {
          preferences.recentFilePaths = [dir, ...preferences.recentFilePaths].slice(0, 5);
          hasNew = true;
        }
      }
      
      // 更新参数使用频次
      for (const paramName of Object.keys(params)) {
        const freqKey = `${comp.name}.${paramName}`;
        preferences.parameterFrequency = {
          ...preferences.parameterFrequency,
          [freqKey]: (preferences.parameterFrequency[freqKey] || 0) + 1
        };
      }
    }
    
    return { preferences, hasNew };
  }
}

export default ParameterService;
