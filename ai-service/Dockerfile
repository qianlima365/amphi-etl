# FROM node:20-slim
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:20-slim

WORKDIR /app

COPY package.json yarn.lock* package-lock.json* ./
# 国内淘宝源；跳过 onnxruntime-node 的 CUDA 二进制下载（从 GitHub 拉取易超时），使用包内 CPU 二进制
ENV ONNXRUNTIME_NODE_INSTALL_CUDA=skip
RUN npm install --registry=https://registry.npmmirror.com/

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
