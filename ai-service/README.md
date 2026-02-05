# Amphi AI Service

AI Assistant Backend Service for Amphi ETL Pipeline Generation.

基于 [LlamaIndex.TS](https://github.com/run-llama/LlamaIndexTS) 构建的多模型厂商支持。

## Features

- **多模型厂商支持**: OpenAI, Anthropic, Groq, Gemini, DeepSeek, Ollama
- **用户 API Key 管理**: 用户可配置自己的 API Key，通过 SQLite 安全存储
- **Prompt Optimization**: 优化提示词以获得更好的 Pipeline 生成效果
- **Pipeline Generation**: 从自然语言生成 .ampln Pipeline
- **Pipeline Rendering**: 保存并渲染 Pipeline 到工作空间

## Supported Providers

| 厂商 | 支持的模型 | 需要 API Key |
|------|-----------|-------------|
| OpenAI | GPT-4, GPT-4o, GPT-3.5-turbo | ✅ |
| Anthropic | Claude 3.5, Claude 3 | ✅ |
| Groq | Llama 3.3, Mixtral | ✅ |
| Google Gemini | Gemini 1.5 Pro/Flash | ✅ |
| DeepSeek | DeepSeek Chat/Coder | ✅ |
| Ollama | Llama3, Mistral, Qwen | ❌ (本地) |
| 自定义 | OpenAI 兼容接口 | ✅ |

## Installation

```bash
cd ai-service
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port（建议 3000，与前端约定一致） | 3001 |
| `NODE_ENV` | Environment | development |
| `CORS_ORIGIN` | 允许的前端来源，多个用逗号分隔，如 `http://localhost:8888,http://localhost:8889` | * |
| `DB_PATH` | SQLite database path | ./data/ai-service.sqlite |
| `WORKSPACE_DIR` | Pipeline save directory | ./ |
| `OPENAI_API_KEY` | Default OpenAI API key | - |
| `ANTHROPIC_API_KEY` | Default Anthropic API key | - |
| `GROQ_API_KEY` | Default Groq API key | - |
| `GEMINI_API_KEY` | Default Gemini API key | - |
| `DEEPSEEK_API_KEY` | Default DeepSeek API key | - |

## 接口与代理

- 助手页面运行在 Jupyter/Amphi 端口（如 **8888**、**8889**），AI 服务单独起在 **3000** 端口。
- 前端会直接请求 `http://localhost:3000/ai/...`，因此需要：
  1. **AI 服务** 启动时使用端口 3000：在 `.env` 中设置 `PORT=3000`。
  2. **CORS** 放行前端来源：在 `.env` 中设置  
     `CORS_ORIGIN=http://localhost:8888,http://localhost:8889`（按实际前端端口修改）。
- 若希望浏览器只访问一个端口（走代理转发），可在 Nginx 等反向代理中将 `/ai` 转发到 `http://127.0.0.1:3000`，前端即可使用相对路径 `/ai`。

## Running

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

## API Endpoints

### POST /ai/optimizePrompt

Optimize a prompt for better pipeline generation.

**Request:**
```json
{
  "prompt": "Create a pipeline to read CSV and write to MySQL"
}
```

**Response:**
```json
{
  "optimizedPrompt": "## Task\nCreate a data pipeline...",
  "method": "service",
  "meta": {
    "originalLength": 50,
    "optimizedLength": 200
  }
}
```

### POST /ai/generatePipeline

Generate a pipeline from natural language.

**Request:**
```json
{
  "systemPrompt": "You are a pipeline builder...",
  "userPrompt": "Create a pipeline to read CSV and filter by age > 18",
  "model": {
    "provider": "gpt-4",
    "temperature": 0.4,
    "maxTokens": 2048
  }
}
```

**Response:**
```json
{
  "success": true,
  "pipeline": {
    "name": "CSV Filter Pipeline",
    "version": "1.0.0",
    "nodes": [...],
    "edges": [...]
  }
}
```

### POST /ai/renderPipeline

Save a pipeline to the workspace.

**Request:**
```json
{
  "pipeline": { ... },
  "filePath": "./pipelines/my-pipeline.ampln"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Pipeline saved successfully",
  "filePath": "/workspace/pipelines/my-pipeline.ampln"
}
```

## API Documentation

Swagger UI is available at: `http://localhost:3001/api-docs`

## Integration with Amphi

The AI service is designed to work with the Amphi ETL frontend. Configure the frontend to point to this service:

1. Set the API base URL in the frontend configuration
2. Ensure CORS is properly configured
3. API keys are stored in the browser's localStorage (not sent to this service unless configured)

## Security

- All API keys are stored locally in the browser
- Prompts are sanitized before processing
- File paths are validated to prevent directory traversal
- Rate limiting is enabled (30 requests/minute)

## License

Apache-2.0
