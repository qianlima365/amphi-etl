# syntax=docker/dockerfile:1.4   
# 开启BuildKit语法（必须放在第一行）
# 国内源替换：swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/docker/dockerfile:1.4

# 阶段1：构建阶段（使用完整Node镜像，包含构建工具）
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:20-slim AS builder

# 2. 配置国内源（提前设置，复用缓存）
ENV npm_config_registry=https://registry.npmmirror.com/
# 3. 设置生产环境，避免安装devDependencies（减小依赖体积）
ENV NODE_ENV=production

WORKDIR /app

# 4. 先复制依赖清单（核心！最大化利用Docker层缓存）
# 只复制package.json/yarn.lock/package-lock.json，代码变更不触发依赖重装
COPY package.json yarn.lock* package-lock.json* ./

# 5. 挂载npm缓存目录，避免重复下载依赖（BuildKit特性）
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev || npm install --include=dev

# 6. 复制业务代码（代码变更仅影响此层，不触发依赖重装）
COPY . .

# 7. 执行构建，校验产物并清理构建缓存
RUN npm run build && (ls -lah dist || (echo "dist missing" && ls -lah . && exit 1)) && \
    rm -rf node_modules/.cache /tmp/*

# 阶段2：运行阶段（使用更轻量的Alpine镜像，剥离构建依赖）
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:20-alpine

# 8. 配置运行时环境
ENV NODE_ENV=production \
    # 禁止npm产生缓存
    npm_config_cache=/dev/null

WORKDIR /app

# 9. 创建非root用户，避免root运行（提升安全性）
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001 -G nodejs && \
    # 给非root用户授权工作目录
    chown -R appuser:nodejs /app

# 10. 仅复制构建产物和必要依赖（最小化镜像体积）
# 从builder阶段复制node_modules（生产依赖）和构建产物
COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist
COPY --from=builder --chown=appuser:nodejs /app/package.json ./package.json

# 11. 切换到非root用户
USER appuser

# 12. 声明暴露端口（仅为文档说明，不实际映射）
EXPOSE 3000

# 13. 添加健康检查（监控容器运行状态）
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# 14. 使用exec形式启动，避免shell层（便于信号传递）
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3000"]
