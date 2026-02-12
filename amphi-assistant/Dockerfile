# ============================================
# Node.js AI Agent Framework Dockerfile
# 使用国内源加速构建
# ============================================

# 阶段1: 构建阶段
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 安装构建依赖
RUN apk add --no-cache python3 make g++

# 配置国内npm源（阿里云）
RUN npm config set registry https://registry.npmmirror.com

# 复制依赖文件
COPY package.json tsconfig.json ./

# 安装生产依赖和开发依赖
RUN npm ci --include=dev

# 复制源代码
COPY src ./src

# 构建TypeScript
RUN npm run build

# 阶段2: 生产阶段
FROM node:18-alpine AS production

# 设置工作目录
WORKDIR /app

# 安装生产环境需要的系统依赖
RUN apk add --no-cache curl ca-certificates

# 配置国内npm源（阿里云）
RUN npm config set registry https://registry.npmmirror.com

# 复制依赖文件
COPY package.json ./

# 仅安装生产依赖
RUN npm ci --omit=dev && npm cache clean --force

# 从构建阶段复制编译后的文件
COPY --from=builder /app/dist ./dist

# 创建非root用户运行应用
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 设置文件权限
RUN chown -R nodejs:nodejs /app
USER nodejs

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# 启动命令
CMD ["node", "dist/index.js"]
