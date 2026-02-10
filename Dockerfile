# Stage 1: Build Frontend Assets
# FROM node:20 AS builder
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:20.20.0 AS builder

# Enable Corepack so yarn is available; jlpm 随 JupyterLab 提供，builder 中无 Python，用 yarn 代替
RUN corepack enable && ln -sf "$(which yarn)" /usr/local/bin/jlpm

# yarn/npm 使用国内源（npmmirror）加速
ENV npm_config_registry=https://registry.npmmirror.com/

WORKDIR /app

# Copy necessary files for frontend build
COPY jupyterlab-amphi/ jupyterlab-amphi/
COPY amphi-etl/ amphi-etl/
COPY amphi-scheduler/ amphi-scheduler/

# Build jupyterlab-amphi
WORKDIR /app/jupyterlab-amphi
RUN yarn install && yarn run build:prod

# Build amphi-etl frontend assets (themes, ui-component)
WORKDIR /app/amphi-etl
RUN yarn install && yarn run build:prod

# Build amphi-scheduler frontend assets
WORKDIR /app/amphi-scheduler
RUN yarn install && yarn run build:prod

# Stage 2: Final Image
# FROM python:3.11-slim
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/python:3.11-slim

# 使用国产 apt 源（阿里云，国内通常更稳定）
RUN if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources; \
    else \
        sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list; \
    fi

# Install system dependencies（失败时重试一次，应对偶发网络问题）
RUN apt-get update -o Acquire::Retry=3 -o Acquire::http::Timeout=60 && (apt-get install -y --no-install-recommends \
    nodejs npm git build-essential || (apt-get update -o Acquire::Retry=3 -o Acquire::http::Timeout=60 && apt-get install -y --no-install-recommends --fix-missing \
    nodejs npm git build-essential)) \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built assets and source code from builder
COPY --from=builder /app /app

# pip 使用国内源（阿里云）加速
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple \
    && pip config set global.trusted-host mirrors.aliyun.com

# Install Python dependencies: hatch for building, JupyterLab before extensions
# (jupyterlab-amphi's build-system requires JupyterLab at build time; amphi-etl pins 4.5.2)
RUN pip install --no-cache-dir hatch "jupyterlab==4.5.3"

# Install amphi-scheduler
WORKDIR /app/amphi-scheduler
RUN pip install .

# Install jupyterlab-amphi (core extension; required by amphi-etl)
WORKDIR /app/jupyterlab-amphi
RUN pip install .

# Install amphi-etl (depends on jupyterlab-amphi and amphi-scheduler)
WORKDIR /app/amphi-etl
RUN pip install .

# Setup workspace directory
RUN mkdir -p /workspace

EXPOSE 8888

# Start JupyterLab
CMD ["jupyter", "lab", "--ip=0.0.0.0", "--port=8888", "-w /workspace", "--allow-lan", "--allow-embed", "--no-auth"]
