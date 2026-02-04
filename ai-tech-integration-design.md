# AI技术集成功能设计文档

## 1. AI增强功能清单
### 1.1 数据智能清洗
- 功能：缺失值填充、异常值修正、格式标准化、值域校验、重复记录合并
- 输入/输出：输入为关系型表或半结构化数据；输出为清洗后的数据帧
- 算法：规则引擎 + 统计检测（Z-Score、IQR）+ 模型辅助（LightGBM 填充）
- 集成点：ETL 输入后、转换链首端；支持配置化启用
- 指标：清洗覆盖率、误改率、耗时、规则命中率

### 1.2 异常检测
- 功能：单变量与多变量异常、季节性异常、离群点标注
- 算法：Isolation Forest、Robust Random Cut Forest、STL 分解 + 残差检测
- 集成点：转换阶段，支持对指定列/窗口执行
- 指标：Precision/Recall、F1、延迟、每批次检测耗时

### 1.3 Schema 自动推断
- 功能：字段类型推断、分区键识别、主键/候选键建议
- 算法：统计分布 + 规则模板（正则、字典）+ 轻量文本模型（实体/类型识别）
- 集成点：输入加载后、元数据面板；可生成 YAML/SQL DDL 草案
- 指标：类型匹配准确率、建议覆盖率

### 1.4 数据质量评分
- 功能：基于全面维度（完整性、唯一性、一致性、时效性、有效性）生成质量分
- 算法：规则权重汇总 + 经验贝叶斯平滑；支持行业模板（金融、零售）
- 集成点：转换结束与输出前；质量分入库或监控平台
- 指标：维度得分、总分、历史趋势、影响因子

### 1.5 智能数据映射推荐
- 功能：源→目标字段自动映射、值域映射字典建议、变换函数提示
- 算法：字符串相似度（Jaro-Winkler）、语义匹配（句向量）、历史映射学习
- 集成点：映射配置表单与转换组件；可一键应用/半自动审核
- 指标：Top-1/Top-3 命中率、人工确认比率

### 1.6 自然语言到SQL转换（NL2SQL）
- 功能：将中文/英文需求转为可执行 SQL；兼容 MySQL/PostgreSQL 等
- 算法：大语言模型 + Schema 感知提示（表/列/示例行）
- 集成点：SQL 编辑器与查询组件；支持审计与安全过滤（白名单函数）
- 指标：可执行率、结果一致性、平均生成时间

### 1.7 数据血缘智能分析
- 功能：从节点与SQL推断字段级血缘、影响分析（上游变更影响下游）
- 算法：规则解析（AST）+ 图推理 + 大模型辅助注释
- 集成点：管道编辑器元数据面板；导出血缘图（Graph）
- 指标：血缘覆盖率、字段级精度、计算耗时

---

## 2. 第三方AI平台集成方案
### 2.1 统一适配层架构
- 设计：定义 Provider 接口（鉴权、调用、限流、重试、缓存）；具体平台实现适配器
- 协议：REST（默认）、GraphQL（Schema 驱动查询）、gRPC（高性能流式）
- 调用路径：ETL 组件在转换阶段通过中间件调用 Provider；结果写入缓存与日志

### 2.2 平台对接技术路径
- OpenAI
  - 接口：REST；认证：API Key（Header Bearer）
  - 限流：令牌桶 + 并发阈值；退避策略指数退避
  - 故障转移：多模型候选（gpt-4o-mini→gpt-3.5-turbo）；短路器 + 重试
  - 缓存：请求签名（prompt+schema+params）→ 本地/Redis 缓存，TTL 与命中率监控
- Google Cloud AI（Vertex AI）
  - 接口：REST/gRPC；认证：OAuth2/Service Account（JWT）
  - 限流：配额监控 + 本地节流；区域多活（us-central1 等）
  - 故障转移：区域级切换；冷备模型；状态探针
  - 缓存：特征级缓存（嵌入向量）、模型响应缓存
- AWS SageMaker
  - 接口：REST；认证：SigV4 签名（IAM）
  - 限流：API Gateway 配额 + 客户端节流；重试（幂等键）
  - 故障转移：多 Endpoint；权重路由；健康检查
  - 缓存：批量预测结果落地 S3；索引加速
- 阿里云 PAI
  - 接口：REST；认证：RAM/AK/SK；STS 临时凭证
  - 限流：服务配额 + 客户端令牌桶；失败快速回退
  - 故障转移：跨地域备份；超时切换；熔断
  - 缓存：PAI-DSW/OSS 结合；请求去重与TTL策略

### 2.3 认证机制与密钥管理
- 原则：密钥不入库、不写日志；使用环境变量/密钥管理服务（KMS/Secrets Manager）
- 轮转：自动轮转与失效策略；细粒度权限（最小权限原则）

### 2.4 限流与重试
- 客户端：令牌桶限流、并发控制；指数退避（Jitter）
- 服务端：配额监控与告警；熔断器保护下游

### 2.5 故障转移
- 模型多活与优先级序列；健康检查失败自动切换
- 同步/异步回退（返回降级结果或提示人工介入）

### 2.6 缓存方案
- 层次：内存/LRU、分布式缓存（Redis）、对象存储（S3/OSS）
- 粒度：请求级（Prompt+Schema）、特征级（Embedding）、结果级（JSON）
- 失效：TTL/滑动过期/版本标签；数据一致性策略

### 2.7 配置示例（YAML）
```yaml
ai:
  enabled: true
  provider: openai
  endpoints:
    nl2sql: /v1/chat/completions
    cleansing: /v1/chat/completions
  auth:
    method: api_key
    env_key: OPENAI_API_KEY
  rate_limit:
    qps: 5
    burst: 10
  retry:
    max_attempts: 3
    backoff: exponential
  cache:
    layer: redis
    ttl_seconds: 600
  failover:
    candidates: [openai, vertex_ai]
    strategy: priority
```

---

## 3. 技术选型矩阵与推荐
| 场景 | OpenAI | Google Vertex AI | AWS SageMaker | 阿里云 PAI |
|---|---|---|---|---|
| 数据脱敏（泛化/替换） | 准确率：高；延迟：中；成本：中 | 准确率：中高；延迟：中；成本：中 | 准确率：中；延迟：中；成本：中 | 准确率：中；延迟：低中；成本：低中 |
| 实体识别（中文/英文） | 高/中；中；中 | 中高/中；中；中 | 中；中；中 | 中文强/英文中；低中；低 |
| 文本分类 | 高；中；中 | 中高；中；中 | 中；中；中 | 中；低中；低 |
| 时序预测 | 中（需微调）；中；中 | 中高（AutoML）；中；中高 | 高（定制模型）；中；中高 | 中；中；中 |

- 推荐：  
  - 中文实体识别/脱敏优先 PAI；英文/跨语种优先 OpenAI/Vertex  
  - 业务强约束分类优先 SageMaker（可训练定制模型）  
  - 时序预测偏向 SageMaker/Vertex（AutoML 或自建）

---

## 4. 零侵入式集成设计
- 方式：配置化插件 + 中间件 + 可选微服务
- 原则：不修改现有 ETL 引擎核心代码；通过事件钩子与组件扩展接入
- 配置：YAML 动态启用/禁用功能；每个功能模块独立开关与参数
- 扩展点：  
  - 输入后（Schema 推断、清洗建议）  
  - 转换阶段（异常检测、映射推荐、NL2SQL）  
  - 输出前（质量评分、血缘生成）
- 兼容：与 JupyterLab 前端扩展组件（表单、代码编辑器、元数据面板）对接，UI 通过配置渲染而非硬编码

---

## 5. 机器学习算法部署规范
### 5.1 可本地部署算法类型
- 数据质量规则引擎（DSL + 规则编排）
- 异常检测（Isolation Forest/Prophet/ARIMA）
- 数据标准化（编码规范、字典映射）

### 5.2 训练流水线
- 数据集管理（分层样本、时间切分）
- 特征工程与基线训练；自动超参搜索（Optuna）
- 评估（Holdout/K-Fold）；指标产出与阈值建议

### 5.3 版本与发布
- 模型注册（MLflow/自研 Registry）；语义化版本号
- A/B 测试与灰度（按任务/表/租户）；回滚策略
- 部署形态：本地进程/容器（Docker）/远程服务

### 5.4 运维与安全
- 资源：CPU/GPU 配额、队列长度、并发
- 日志：结构化日志、调用链路ID、脱敏输出
- 合规：隐私保护、最小权限、密钥管理（KMS/Secrets）

---

## 6. 交付物清单与质量保障
- 架构图：适配层、插件、中间件、缓存与熔断、调用路径
- 接口文档：Provider 统一接口、平台编解码、错误码与重试
- 配置模板：YAML 样例与参数说明
- 单元测试：组件级与适配器级，覆盖≥85%
- 性能基准：对比基线 ETL 性能，波动控制在 ±5%
- 运维监控：调用次数、成功率、延迟分布、缓存命中率、限流触发次数、熔断状态
- CI/CD：自动化测试与质量门禁；安全扫描；配置审计

---

## 7. 实施里程碑（建议）
- M1：适配层与配置机制、缓存与限流、基础单元测试
- M2：数据清洗、异常检测、Schema 推断与质量评分
- M3：智能映射推荐与 NL2SQL、血缘分析
- M4：性能基准与灰度发布、运维监控完善

---

## 8. 风险与缓解
- 外部 API 不可用：多提供商备选 + 熔断与降级
- 成本不可控：缓存与批量化、限流、监控成本 KPI
- 隐私与合规：脱敏与最小化原则、数据主权区域选择

---

## 9. 非结构化数据处理转换组件设计
### 9.1 多源异构数据接入
- 支持格式：文本、PDF、图片、音频、视频、日志、邮件、HTML、XML、JSON碎片
- 传输来源：本地文件、FTP、S3/OSS、HDFS、HTTP(S) API、MQ（Kafka、RabbitMQ）
- Source 插件接口：
  - 统一方法：init(config)、discover()、read(batchSize, offset)、ack(offset)
  - 可扩展：通过注册表按类型加载（mime、协议、容器格式）
- 配置示例：
```yaml
sources:
  - name: pdf_invoices
    type: s3
    bucket: finance-invoice
    prefix: 2025/
    format: pdf
    region: us-east-1
    authRef: AWS_CRED_KEY
  - name: mail_logs
    type: imap
    host: mail.example.com
    userRef: IMAP_USER
    passRef: IMAP_PASS
    format: eml
```

### 9.2 智能类型识别与模式推断
- 自动检测：文件编码、媒体类型、压缩格式、语言、字符集
- 模式推断：字段结构、嵌套层级、分隔符、时间格式、数值单位
- 策略：ML + 规则混合（MIME/魔数 + 语言检测 + 正则模板 + 统计分布）
- 输出：可编辑 Schema YAML
```yaml
schema:
  name: mail_logs_v1
  encoding: utf-8
  language: zh-cn
  fields:
    - name: sender
      type: string
    - name: received_at
      type: timestamp
      format: "YYYY-MM-DD HH:mm:ss"
    - name: attachments
      type: array
      items:
        type: struct
        fields:
          - name: filename
            type: string
          - name: size_bytes
            type: int
```

### 9.3 可编排的清洗与转换算子库
- 算子类别：正则、字典、UDF、脚本（Python/JavaScript）
- 内置操作：去重、缺失值填充、实体打码、敏感词过滤、HTML标签剔除、OCR纠错、语音转写、图片压缩、格式归一化（日期、货币、单位）、编码转换（UTF-8、GBK、ISO-8859-1）
- 画布编排：拖拽节点、连线表示流向；支持版本控制与回滚
- 示例流水线（DSL）：
```yaml
pipeline:
  - op: html_strip
    input: raw_html
    output: plain_text
  - op: regex_extract
    pattern: "(订单号)[:：]\\s*(\\w+)"
    input: plain_text
    output: order_id
  - op: nlp_mask_entity
    input: plain_text
    target: [person_name, phone, id_card]
    output: masked_text
  - op: date_normalize
    input: event_time
    format_in: "YYYY/MM/DD HH:mm"
    format_out: "YYYY-MM-DDTHH:mm:ssZ"
    output: event_time_std
```

### 9.4 语义级结构化抽取
- 组件集成：BERT（NER）、LayoutLM（版面结构/表格）、PaddleOCR（图像文本）、Whisper（音频转写）
- 目标输出：JSON、Parquet、Avro、CSV、Elasticsearch 索引；支持嵌套数组与动态字段
- 示例输出（JSON）：
```json
{
  "invoice_no": "INV-2025-00012",
  "vendor": "Acme Ltd.",
  "items": [
    {"sku": "SKU-001", "qty": 10, "amount": 130.50},
    {"sku": "SKU-002", "qty": 2, "amount": 40.00}
  ],
  "total": 170.50,
  "currency": "CNY",
  "_lineage": {"source": "pdf_invoices/2025/INV-2025-00012.pdf"}
}
```

### 9.5 质量评估与自动修复
- 评估维度：完整性、一致性、及时性、准确性、唯一性
- 触发修复：批次得分低于阈值 → 备用模型、人工审核工单、源系统重拉
- 报告生成：PDF + JSON；包含指标、问题列表、修复结果与建议
```yaml
quality:
  thresholds:
    overall: 0.85
    dimensions:
      completeness: 0.9
      accuracy: 0.85
  auto_repair:
    strategies: [fallback_model, manual_review, source_reload]
```

### 9.6 流批一体处理引擎
- 引擎：Apache Flink / Spark Structured Streaming
- 能力：事件时间窗口、乱序容忍、exactly-once；离线批处理同逻辑
- 切换策略：同一 DSL 在流/批两种执行器加载，运维通过配置切换

### 9.7 资源与任务调度
- 调度特性：优先级队列、弹性伸缩、内存/CPU阈值熔断
- 部署模式：Kubernetes / YARN / Standalone
- 故障处理：自动重试、断点续跑、灰度发布
- 外部集成：REST & gRPC 提供任务编排接口，供 Airflow、DolphinScheduler 调用

### 9.8 安全与合规
- 字段级加密：AES-256、SM4；脱敏：哈希、掩码、Tokenization
- 审计：Who/When/What/Where；细粒度 RBAC；行列级权限
- 合规：GDPR、CCPA、等保2.0、ISO27001；支持国密算法与跨境数据校验

### 9.9 监控与可观测
- 指标：吞吐量、延迟、错误率、背压、GC、队列深度
- 工具：Prometheus + Grafana；链路追踪（SkyWalking/Jaeger）
- 告警：Email、钉钉、Slack、Webhook；一键诊断报告

### 9.10 测试与交付
- 单元测试：覆盖率≥80%
- 集成测试：Docker-Compose 一键启动
- 性能基准：文本 1 GB/s、图片 5k 张/秒、8 小时稳定运行
- 交付制品：容器镜像（amd64 & arm64）、Helm Chart、Operator、SDK（Java/Python/Go）、中英文手册、API Swagger、二次开发示例
