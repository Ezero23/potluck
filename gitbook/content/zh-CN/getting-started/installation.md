# 安装

百家饭 的详细安装指南,附故障排除技巧。

---

## 要求

### 系统要求

- **Node.js**:版本 20.0.0 或更高
- **npm**:版本 10.0.0 或更高(随 Node.js 安装)
- **OS**:macOS、Linux、Windows(推荐 WSL)
- **磁盘空间**:安装约需 200MB

### 查看版本

```bash
node --version
# 应显示 v20.x.x 或更高

npm --version
# 应显示 10.x.x 或更高
```

**没有 Node.js?** 从 [nodejs.org](https://nodejs.org/) 安装

---

## 安装方式

### 方式 1:源码安装(推荐)

从 GitHub 克隆并运行:

```bash
git clone https://github.com/Ezero23/potluck.git
cd potluck
cp .env.example .env
npm install
PORT=20129 NEXT_PUBLIC_BASE_URL=http://localhost:20129 npm run dev
```

**优势:**
- ✅ 最新开发特性
- ✅ 可参与开发
- ✅ 可自定义修改

### 方式 2:Docker 部署

直接运行预构建多架构镜像（`amd64` + `arm64`，每个 release 自动更新）：

```bash
docker run -d --name potluck -p 20129:20129 \
  -v "$HOME/.potluck:/app/data" -e DATA_DIR=/app/data \
  ghcr.io/ezero23/potluck:latest
```

或从源码构建：

```bash
git clone https://github.com/Ezero23/potluck.git
cd potluck
docker build -t potluck .
docker run -d --name potluck -p 20129:20129 \
  -v "$HOME/.potluck:/app/data" -e DATA_DIR=/app/data potluck
```

**优势:**
- ✅ 环境隔离
- ✅ 一键部署
- ✅ 适合生产环境

---

## 首次运行

### 启动服务器

```bash
cd potluck
PORT=20129 NEXT_PUBLIC_BASE_URL=http://localhost:20129 npm run dev
```

**发生了什么:**
1. 服务器启动在 `http://localhost:20129`
2. 仪表盘在浏览器中自动打开
3. 数据目录创建在 `~/.potluck`
4. API key 自动生成

### 仪表盘登录

**默认凭据:**
- 密码:`123456`

**⚠️ 立即修改密码:**
1. 登录仪表盘
2. 设置 → 修改密码
3. 使用强密码

### 获取 API Key

```
仪表盘 → 设置 → API Keys
→ 复制你的 API key
→ 在 CLI 工具中使用
```

**API key 格式示例:**
```
9r_1234567890abcdef1234567890abcdef
```

---

## 验证安装

### 检查服务器状态

```bash
curl http://localhost:20129/health
```

**预期响应:**
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

### 列出可用模型

```bash
curl http://localhost:20129/v1/models \
  -H "Authorization: Bearer your-api-key"
```

**预期响应:**
```json
{
  "object": "list",
  "data": [
    {
      "id": "cc/claude-opus-4-5-20251101",
      "object": "model",
      "created": 1234567890,
      "owned_by": "claude-code"
    }
  ]
}
```

### 测试 Chat Completion

```bash
curl http://localhost:20129/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "cc/claude-opus-4-5-20251101",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

---

## 配置

### 环境变量

创建 `.env` 文件或设置环境变量:

```bash
# Security (REQUIRED in production)
export JWT_SECRET="your-secure-secret-change-this"
export INITIAL_PASSWORD="your-password"

# Storage
export DATA_DIR="~/.potluck"

# Server
export PORT="20129"
export NODE_ENV="production"

# Logging
export ENABLE_REQUEST_LOGS="false"
```

### 数据目录

**默认位置:** `~/.potluck`

**内容:**
```
~/.potluck/
  ├── db.json           # 数据库(提供商、组合、使用)
  ├── api-keys.json     # API keys
  └── logs/             # 请求日志(若启用)
```

**修改位置:**

```bash
export DATA_DIR="/custom/path"
npm run dev
```

### 端口配置

**默认端口:** `20129`

**修改端口:**

```bash
export PORT="3000"
npm run dev
```

---

## 故障排除

### 端口已被占用

**错误:**
```
Error: listen EADDRINUSE: address already in use :::20129
```

**方案 1:杀掉占用进程**

```bash
# 找到使用 20129 端口的进程
lsof -i :20129

# 杀掉进程
kill -9 <PID>
```

**方案 2:使用其他端口**

```bash
PORT=3000 npm run dev
```

### 权限被拒绝

**错误:**
```
Error: EACCES: permission denied, mkdir '/usr/local/lib/node_modules'
```

**方案:修复 npm 权限**

```bash
# 修复 npm 权限(推荐)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# 然后重新安装依赖
npm install
```

### Node.js 版本过低

**错误:**
```
Error: The engine "node" is incompatible with this module
```

**方案:更新 Node.js**

```bash
# 使用 nvm(推荐)
nvm install 20
nvm use 20

# 或从 nodejs.org 下载
```

### 仪表盘无法打开

**问题:** 仪表盘没有自动打开

**方案 1:手动打开**

```
http://localhost:20129
```

**方案 2:检查防火墙**

```bash
# macOS: 在 System Preferences → Security 中允许 Node.js
# Linux: 检查 iptables
# Windows: 检查 Windows Firewall
```

### 无法连接提供商

**问题:** OAuth 登录失败或 API key 无效

**方案 1:检查网络连接**

```bash
ping google.com
```

**方案 2:检查提供商状态**

- Claude Code: [status.anthropic.com](https://status.anthropic.com)
- OpenAI: [status.openai.com](https://status.openai.com)
- Gemini: [status.cloud.google.com](https://status.cloud.google.com)

**方案 3:重新生成 API key**

```
仪表盘 → 提供商 → 断开 → 重新连接
```

### 内存占用过高

**问题:** 百家饭 占用过多 RAM

**方案:重启服务器**

```bash
# 停止
pkill -f "next"

# 启动
npm run dev
```

**或用 PM2 自动重启:**

```bash
npm install -g pm2
pm2 start npm --name potluck -- start
pm2 save
```

---

## 部署选项

### 本地开发

```bash
git clone https://github.com/Ezero23/potluck.git
cd potluck
cp .env.example .env
npm install
npm run dev
```

**适用场景:** 个人编码、测试

### VPS/云服务器

```bash
# 安装
git clone https://github.com/Ezero23/potluck.git
cd potluck
npm install
npm run build

# 配置
export JWT_SECRET="your-secure-secret"
export INITIAL_PASSWORD="your-password"
export NODE_ENV="production"

# 用 PM2 启动
npm install -g pm2
pm2 start npm --name potluck -- start
pm2 save
pm2 startup
```

**适用场景:** 团队访问、远程编码

### Docker

```bash
git clone https://github.com/Ezero23/potluck.git
cd potluck
docker build -t potluck .

docker run -d \
  -p 20129:20129 \
  -e JWT_SECRET="your-secure-secret" \
  -e INITIAL_PASSWORD="your-password" \
  -v potluck-data:/app/data \
  --name potluck \
  potluck
```

**适用场景:** 容器化部署、Kubernetes

### 反向代理(Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:20129;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        
        # SSE support for streaming
        proxy_buffering off;
        proxy_read_timeout 86400;
    }
}
```

**适用场景:** HTTPS、自定义域名、负载均衡

---

## 卸载

### 移除源码安装

```bash
rm -rf potluck
```

### 移除数据目录

```bash
rm -rf ~/.potluck
```

### 移除配置

```bash
# 从 shell 配置中移除环境变量
nano ~/.bashrc  # 或 ~/.zshrc
# 删除 potluck 相关的 export
```

---

## 下一步

- [入门指南](../getting-started.md) - 连接提供商并开始编码
- [功能特性](../features/) - 探索配额跟踪、组合、部署
- [故障排除](../troubleshooting.md) - 解决常见问题

---

## 需要帮助?

- **网站**: [github.com/Ezero23/potluck](https://your-potluck-cloud.example.com)
- **GitHub**: [github.com/Ezero23/potluck](https://github.com/Ezero23/potluck)
- **Issues**: [github.com/Ezero23/potluck/issues](https://github.com/Ezero23/potluck/issues)
