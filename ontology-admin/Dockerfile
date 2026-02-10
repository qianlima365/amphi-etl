# FROM node:20-slim
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:20-slim

WORKDIR /app

COPY package.json yarn.lock* package-lock.json* ./
# 国内淘宝源
RUN npm install --registry=https://registry.npmmirror.com/

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
