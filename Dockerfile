FROM node:18-alpine

# 使用阿里云镜像加速（国内构建更快）
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

WORKDIR /app

# 先复制 package.json，利用 Docker 层缓存
COPY package.json ./

# 安装依赖（纯 JS 依赖，不需要编译工具）
RUN npm install --production && npm cache clean --force

# 复制应用代码
COPY . .

# 确保 data 目录存在
RUN mkdir -p /app/data

# 限制 Node.js 内存以适应免费额度
ENV NODE_OPTIONS="--max-old-space-size=128"
ENV PORT=3000
ENV RSSHUB_BASE=https://rsshub.app
ENV SCRAPE_INTERVAL=10

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
