# ETL 本体管理前端

基于 React + Ant Design + React Flow 的管理端，用于维护组件、参数及关系，并可视化图数据。

## 前置条件

- 已启动 **ai-service**（含 Neo4j 配置与本体 API）
- Neo4j 已运行（如 Docker: `docker run -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/password neo4j`）

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:3002，通过 Vite 代理请求 ai-service /ontology）
npm run dev
```

## 构建

```bash
npm run build
```

## 环境变量

- `VITE_ONTOLOGY_API`：本体 API 根路径。开发时使用 Vite 代理则可不设（请求发往同源 `/ontology`，由 proxy 转发到 ai-service）。
