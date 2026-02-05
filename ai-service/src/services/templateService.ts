/**
 * Template Service - 模板管理服务
 * 
 * 负责管理和渲染 Pipeline 生成的系统提示词模板：
 * - 模板库管理
 * - 占位符解析与校验
 * - 模板渲染
 */

// 模板变量定义
export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'array';
  required: boolean;
  default?: any;
  pattern?: string;  // 正则校验
  enum?: string[];   // 枚举值
  description?: string;
}

// 模板定义
export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  category: 'data_sync' | 'file_transform' | 'api_integration' | 'realtime_stream' | 'general';
  version: string;
  author: string;
  systemPrompt: string;
  variables: TemplateVariable[];
  examples?: string[];
  tags?: string[];
}

// 模板渲染结果
export interface TemplateRenderResult {
  success: boolean;
  renderedPrompt?: string;
  missingVariables?: string[];
  invalidVariables?: { name: string; reason: string }[];
}

// 内置模板库
const BUILTIN_TEMPLATES: PipelineTemplate[] = [
  {
    id: 'general',
    name: '通用 Pipeline 模板',
    description: '适用于一般的 Pipeline 构建场景',
    category: 'general',
    version: '1.0.0',
    author: 'System',
    systemPrompt: `# Pipeline 构建助手

## 角色定义
你是一个专业的数据 Pipeline 构建助手，能够根据用户需求自动生成符合 .ampln 格式的 Pipeline 配置。

## 输出格式要求
生成的 Pipeline 必须是有效的 JSON，符合以下结构：
\`\`\`json
{
  "name": "{{project_name}}",
  "version": "1.0.0",
  "nodes": [
    {
      "id": "唯一标识",
      "type": "组件类型",
      "position": { "x": 数字, "y": 数字 },
      "data": { ... }
    }
  ],
  "edges": [
    {
      "id": "边ID",
      "source": "源节点ID",
      "target": "目标节点ID"
    }
  ],
  "variables": {}
}
\`\`\`

## 可用组件类型
### 输入组件
- csvFileInput: CSV 文件输入
- jsonFileInput: JSON 文件输入
- mySQLInput: MySQL 数据库输入
- postgresInput: PostgreSQL 数据库输入
- apiInput: API 数据源输入

### 转换组件
- filter: 数据过滤
- aggregate: 数据聚合
- join: 数据连接
- sort: 数据排序
- rename: 字段重命名
- typeConverter: 类型转换

### 输出组件
- csvFileOutput: CSV 文件输出
- jsonFileOutput: JSON 文件输出
- mySQLOutput: MySQL 数据库输出
- postgresOutput: PostgreSQL 数据库输出

## 约束条件
1. 每个节点必须有唯一的 id
2. edges 的 source 和 target 必须对应存在的节点 id
3. Pipeline 必须是有效的 DAG（无环图）
4. 节点位置应合理布局，从左到右、从上到下

## 输出要求
- 仅输出 JSON 格式的 Pipeline 配置
- 不要包含解释性文字
- 确保 JSON 语法正确`,
    variables: [
      { name: 'project_name', type: 'string', required: false, default: 'generated_pipeline', description: '项目名称' }
    ],
    tags: ['通用', '基础']
  },
  {
    id: 'db_sync',
    name: '数据库同步模板',
    description: '数据库到数据库的数据同步场景',
    category: 'data_sync',
    version: '1.0.0',
    author: 'System',
    systemPrompt: `# 数据库同步 Pipeline 构建助手

## 角色定义
你是一个专业的数据库同步 Pipeline 构建助手，专注于数据库之间的数据迁移和同步任务。

## 场景说明
用户需要将数据从一个数据库（源）同步到另一个数据库（目标），可能涉及：
- 表结构映射
- 字段转换
- 数据过滤
- 增量/全量同步

## 输出格式要求
生成的 Pipeline 必须包含：
1. 数据库输入节点（mySQLInput/postgresInput）
2. 可选的转换节点（filter/typeConverter/rename）
3. 数据库输出节点（mySQLOutput/postgresOutput）

## 源数据库配置
- 类型: {{source_type}}
- 表名: {{source_table}}

## 目标数据库配置
- 类型: {{target_type}}
- 表名: {{target_table}}

## JSON 输出结构
\`\`\`json
{
  "name": "{{project_name}}",
  "version": "1.0.0",
  "nodes": [...],
  "edges": [...],
  "variables": {
    "source_host": "{{source_host}}",
    "target_host": "{{target_host}}"
  }
}
\`\`\`

## 约束
- 确保输入输出类型匹配
- 自动添加必要的类型转换节点
- 生成合理的节点布局位置`,
    variables: [
      { name: 'project_name', type: 'string', required: false, default: 'db_sync_pipeline', description: '项目名称' },
      { name: 'source_type', type: 'enum', required: true, enum: ['mysql', 'postgres'], description: '源数据库类型' },
      { name: 'source_table', type: 'string', required: true, description: '源表名' },
      { name: 'target_type', type: 'enum', required: true, enum: ['mysql', 'postgres'], description: '目标数据库类型' },
      { name: 'target_table', type: 'string', required: true, description: '目标表名' },
      { name: 'source_host', type: 'string', required: false, default: 'localhost', description: '源数据库主机' },
      { name: 'target_host', type: 'string', required: false, default: 'localhost', description: '目标数据库主机' }
    ],
    tags: ['数据库', '同步', '迁移']
  },
  {
    id: 'db_to_file',
    name: '数据库导出文件模板',
    description: '从数据库导出数据到文件',
    category: 'data_sync',
    version: '1.0.0',
    author: 'System',
    systemPrompt: `# 数据库导出 Pipeline 构建助手

## 角色定义
你是一个数据导出 Pipeline 构建助手，负责将数据库中的数据导出为文件格式。

## 场景说明
用户需要将数据库表的数据导出为 CSV、JSON 或其他文件格式。

## 数据库配置
- 类型: {{db_type}}
- 表名: {{table_name}}

## 输出文件配置
- 格式: {{output_format}}
- 路径: {{output_path}}

## Pipeline 结构
1. 数据库输入节点
2. 可选的转换节点（过滤、字段选择）
3. 文件输出节点

## 输出要求
仅输出有效的 JSON 格式 Pipeline 配置`,
    variables: [
      { name: 'project_name', type: 'string', required: false, default: 'db_export_pipeline', description: '项目名称' },
      { name: 'db_type', type: 'enum', required: true, enum: ['mysql', 'postgres'], description: '数据库类型' },
      { name: 'table_name', type: 'string', required: true, description: '表名' },
      { name: 'output_format', type: 'enum', required: false, default: 'csv', enum: ['csv', 'json'], description: '输出格式' },
      { name: 'output_path', type: 'string', required: false, default: './output/', description: '输出路径' }
    ],
    tags: ['数据库', '导出', '文件']
  },
  {
    id: 'file_to_db',
    name: '文件导入数据库模板',
    description: '从文件导入数据到数据库',
    category: 'data_sync',
    version: '1.0.0',
    author: 'System',
    systemPrompt: `# 文件导入 Pipeline 构建助手

## 角色定义
你是一个数据导入 Pipeline 构建助手，负责将文件数据导入到数据库。

## 场景说明
用户需要将 CSV、JSON 或其他文件格式的数据导入到数据库表中。

## 输入文件配置
- 格式: {{input_format}}
- 路径: {{input_path}}

## 数据库配置
- 类型: {{db_type}}
- 表名: {{table_name}}

## Pipeline 结构
1. 文件输入节点
2. 可选的转换节点（类型转换、字段映射）
3. 数据库输出节点

## 输出要求
仅输出有效的 JSON 格式 Pipeline 配置`,
    variables: [
      { name: 'project_name', type: 'string', required: false, default: 'file_import_pipeline', description: '项目名称' },
      { name: 'input_format', type: 'enum', required: false, default: 'csv', enum: ['csv', 'json'], description: '输入格式' },
      { name: 'input_path', type: 'string', required: true, description: '输入文件路径' },
      { name: 'db_type', type: 'enum', required: true, enum: ['mysql', 'postgres'], description: '数据库类型' },
      { name: 'table_name', type: 'string', required: true, description: '目标表名' }
    ],
    tags: ['文件', '导入', '数据库']
  },
  {
    id: 'file_transform',
    name: '文件转换模板',
    description: '文件格式转换和数据处理',
    category: 'file_transform',
    version: '1.0.0',
    author: 'System',
    systemPrompt: `# 文件转换 Pipeline 构建助手

## 角色定义
你是一个文件转换 Pipeline 构建助手，负责处理文件格式转换和数据转换。

## 场景说明
用户需要将一种格式的文件转换为另一种格式，或对文件数据进行处理。

## 输入配置
- 格式: {{input_format}}
- 路径: {{input_path}}

## 输出配置
- 格式: {{output_format}}
- 路径: {{output_path}}

## 转换操作
{{transformations}}

## Pipeline 结构
1. 文件输入节点
2. 转换节点（根据需求添加）
3. 文件输出节点

## 输出要求
仅输出有效的 JSON 格式 Pipeline 配置`,
    variables: [
      { name: 'project_name', type: 'string', required: false, default: 'file_transform_pipeline', description: '项目名称' },
      { name: 'input_format', type: 'enum', required: false, default: 'csv', enum: ['csv', 'json', 'excel'], description: '输入格式' },
      { name: 'input_path', type: 'string', required: true, description: '输入文件路径' },
      { name: 'output_format', type: 'enum', required: false, default: 'csv', enum: ['csv', 'json'], description: '输出格式' },
      { name: 'output_path', type: 'string', required: false, default: './output/', description: '输出路径' },
      { name: 'transformations', type: 'string', required: false, default: '无特定转换要求', description: '转换操作说明' }
    ],
    tags: ['文件', '转换']
  },
  {
    id: 'api_integration',
    name: 'API 集成模板',
    description: '从 API 获取数据并处理',
    category: 'api_integration',
    version: '1.0.0',
    author: 'System',
    systemPrompt: `# API 集成 Pipeline 构建助手

## 角色定义
你是一个 API 集成 Pipeline 构建助手，负责从外部 API 获取数据并进行处理。

## 场景说明
用户需要从 REST API 获取数据，进行转换后存储或输出。

## API 配置
- URL: {{api_url}}
- 方法: {{api_method}}
- 认证方式: {{auth_type}}

## 输出配置
- 类型: {{output_type}}
- 路径/表名: {{output_target}}

## Pipeline 结构
1. API 输入节点
2. JSON 解析/转换节点
3. 输出节点（文件或数据库）

## 输出要求
仅输出有效的 JSON 格式 Pipeline 配置`,
    variables: [
      { name: 'project_name', type: 'string', required: false, default: 'api_pipeline', description: '项目名称' },
      { name: 'api_url', type: 'string', required: true, pattern: '^https?://', description: 'API URL' },
      { name: 'api_method', type: 'enum', required: false, default: 'GET', enum: ['GET', 'POST'], description: 'HTTP 方法' },
      { name: 'auth_type', type: 'enum', required: false, default: 'none', enum: ['none', 'api_key', 'bearer', 'basic'], description: '认证方式' },
      { name: 'output_type', type: 'enum', required: false, default: 'csv', enum: ['csv', 'json', 'mysql', 'postgres'], description: '输出类型' },
      { name: 'output_target', type: 'string', required: false, default: './output/', description: '输出目标' }
    ],
    tags: ['API', '集成', 'REST']
  }
];

/**
 * Template Service 类
 */
export class TemplateService {
  // 自定义模板存储（运行时添加的模板）
  private static customTemplates: PipelineTemplate[] = [];

  /**
   * 获取所有可用模板
   */
  static getAllTemplates(): PipelineTemplate[] {
    return [...BUILTIN_TEMPLATES, ...this.customTemplates];
  }

  /**
   * 根据 ID 获取模板
   */
  static getTemplate(id: string): PipelineTemplate | undefined {
    return this.getAllTemplates().find(t => t.id === id);
  }

  /**
   * 根据分类获取模板
   */
  static getTemplatesByCategory(category: PipelineTemplate['category']): PipelineTemplate[] {
    return this.getAllTemplates().filter(t => t.category === category);
  }

  /**
   * 根据标签搜索模板
   */
  static searchTemplates(query: string): PipelineTemplate[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllTemplates().filter(t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * 添加自定义模板
   */
  static addTemplate(template: PipelineTemplate): void {
    const existingIndex = this.customTemplates.findIndex(t => t.id === template.id);
    if (existingIndex >= 0) {
      this.customTemplates[existingIndex] = template;
    } else {
      this.customTemplates.push(template);
    }
  }

  /**
   * 渲染模板
   */
  static renderTemplate(
    templateId: string,
    variables: Record<string, any>
  ): TemplateRenderResult {
    const template = this.getTemplate(templateId);
    if (!template) {
      return {
        success: false,
        missingVariables: [],
        invalidVariables: [{ name: 'template', reason: `模板 ${templateId} 不存在` }]
      };
    }

    return this.renderTemplateContent(template, variables);
  }

  /**
   * 渲染模板内容
   */
  static renderTemplateContent(
    template: PipelineTemplate,
    variables: Record<string, any>
  ): TemplateRenderResult {
    const missingVariables: string[] = [];
    const invalidVariables: { name: string; reason: string }[] = [];

    // 合并默认值
    const mergedVariables: Record<string, any> = {};
    for (const varDef of template.variables) {
      if (variables[varDef.name] !== undefined) {
        mergedVariables[varDef.name] = variables[varDef.name];
      } else if (varDef.default !== undefined) {
        mergedVariables[varDef.name] = varDef.default;
      } else if (varDef.required) {
        missingVariables.push(varDef.name);
      }
    }

    // 校验变量
    for (const varDef of template.variables) {
      const value = mergedVariables[varDef.name];
      if (value === undefined) continue;

      // 类型校验
      if (varDef.type === 'enum' && varDef.enum) {
        if (!varDef.enum.includes(value)) {
          invalidVariables.push({
            name: varDef.name,
            reason: `值 "${value}" 不在允许的选项中: ${varDef.enum.join(', ')}`
          });
        }
      }

      // 正则校验
      if (varDef.pattern) {
        const regex = new RegExp(varDef.pattern);
        if (!regex.test(String(value))) {
          invalidVariables.push({
            name: varDef.name,
            reason: `值 "${value}" 不符合格式要求: ${varDef.pattern}`
          });
        }
      }
    }

    // 如果有缺失或无效变量，返回错误
    if (missingVariables.length > 0 || invalidVariables.length > 0) {
      return {
        success: false,
        missingVariables,
        invalidVariables
      };
    }

    // 渲染模板
    let renderedPrompt = template.systemPrompt;
    for (const [key, value] of Object.entries(mergedVariables)) {
      const placeholder = `{{${key}}}`;
      renderedPrompt = renderedPrompt.split(placeholder).join(String(value));
    }

    return {
      success: true,
      renderedPrompt
    };
  }

  /**
   * 获取模板的变量定义
   */
  static getTemplateVariables(templateId: string): TemplateVariable[] {
    const template = this.getTemplate(templateId);
    return template?.variables || [];
  }

  /**
   * 根据用户需求推荐模板
   */
  static recommendTemplate(userRequirement: string): PipelineTemplate | undefined {
    const lowerReq = userRequirement.toLowerCase();

    // 检测数据库相关
    const hasDbKeywords = ['mysql', 'postgres', 'database', '数据库', 'sql', '表'].some(k => lowerReq.includes(k));
    const hasFileKeywords = ['csv', 'json', 'excel', '文件', 'file'].some(k => lowerReq.includes(k));
    const hasApiKeywords = ['api', 'http', '接口', 'rest'].some(k => lowerReq.includes(k));

    if (hasDbKeywords && hasFileKeywords) {
      // 判断方向
      if (lowerReq.includes('导出') || lowerReq.includes('export') || lowerReq.includes('到文件')) {
        return this.getTemplate('db_to_file');
      }
      if (lowerReq.includes('导入') || lowerReq.includes('import') || lowerReq.includes('到数据库')) {
        return this.getTemplate('file_to_db');
      }
    }

    if (hasDbKeywords && !hasFileKeywords && !hasApiKeywords) {
      return this.getTemplate('db_sync');
    }

    if (hasFileKeywords && !hasDbKeywords) {
      return this.getTemplate('file_transform');
    }

    if (hasApiKeywords) {
      return this.getTemplate('api_integration');
    }

    return this.getTemplate('general');
  }
}

export default TemplateService;
