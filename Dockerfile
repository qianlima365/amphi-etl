# syntax=docker/dockerfile:1.4
# 开启BuildKit语法（必须放在第一行）
# 国内源替换：swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/docker/dockerfile:1.4

# Stage 1: Build Frontend Assets
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:20.20.0 AS builder

# 优化1：提前启用Corepack+配置源（无变动，优先缓存）
RUN if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources; \
    else \
        sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list; \
    fi \
    && apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m pip install --no-cache-dir --break-system-packages "jupyterlab==4.5.3" \
    && jlpm --version

ENV npm_config_registry=https://registry.npmmirror.com/

WORKDIR /app

# 优化2：直接复制全部源码，确保 preinstall 脚本能找到 src 目录
COPY jupyterlab-amphi/ jupyterlab-amphi/
COPY amphi-etl/ amphi-etl/
COPY amphi-scheduler/ amphi-scheduler/

# === jupyterlab-amphi 构建 ===
WORKDIR /app/jupyterlab-amphi
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    jlpm install && \
    jlpm run build:prod

# === amphi-etl 构建 ===
WORKDIR /app/amphi-etl
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    jlpm install && \
    jlpm run build:prod

# === amphi-scheduler 构建 ===
WORKDIR /app/amphi-scheduler
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    jlpm install && \
    jlpm run build:prod

# Stage 2: Final Image
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/python:3.11-slim

# 优化4：合并源修改+系统依赖安装（减少层数）
RUN if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources; \
    else \
        sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list; \
    fi && \
    apt-get update && \
    (apt-get install -y --no-install-recommends git build-essential nodejs npm || \
     (apt-get update && \
      apt-get install -y --no-install-recommends --fix-missing git build-essential nodejs npm)) && \
    rm -rf /var/lib/apt/lists/* && \
    true

WORKDIR /app


# Copy built assets and source code from builder
COPY --from=builder /app /app

# 优化7：提前配置pip源（无变动，优先缓存）
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple \
    && pip config set global.trusted-host mirrors.aliyun.com

# 优化8：挂载pip缓存，避免重复下载
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir --quiet hatch "jupyterlab==4.5.3"

# 安装Python包（按依赖顺序）
WORKDIR /app/amphi-scheduler
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir --quiet .

WORKDIR /app/jupyterlab-amphi
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir --quiet .

WORKDIR /app/amphi-etl
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir --quiet .

# 保持原有目录和启动指令
RUN mkdir -p /workspace
EXPOSE 8888
CMD ["python", "-m", "amphi.main", "start", "-w", "/workspace", "-p", "8888", "--allow-lan", "--allow-embed", "--no-auth", "--allow-root"]