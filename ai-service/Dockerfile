# syntax=docker/dockerfile:1.4
# 开启BuildKit语法（必须放在第一行）
# 国内源替换：swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/docker/dockerfile:1.4

FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:20-slim AS builder

WORKDIR /app

# 国内淘宝源；跳过 onnxruntime-node 的 CUDA 二进制下载（从 GitHub 拉取易超时），使用包内 CPU 二进制
ENV npm_config_registry=https://registry.npmmirror.com/ \
    ONNXRUNTIME_NODE_INSTALL_CUDA=skip

COPY package.json yarn.lock* package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .
RUN npm run build && npm prune --production && rm -rf node_modules/.cache /tmp/*

FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:20-slim

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]