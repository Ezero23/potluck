# 安装

Potluck 可以从源码运行，也可以使用项目发布的容器镜像。开发模式、生产模式、Docker 和 CLI
的默认应用端口统一为 `21023`。

---

## 运行要求

- Node.js 22
- npm
- macOS、Linux 或 Windows
- 至少一个你有权使用的模型提供商账户

检查本机版本：

```bash
node --version
npm --version
```

---

## 从源码运行

```bash
git clone https://github.com/Ezero23/potluck.git
cd potluck
cp .env.example .env
npm ci
npm run dev
```

`npm run dev` 使用默认端口 `21023`。打开：

```text
http://localhost:21023/dashboard
```

开发模式的兼容 API Base URL 为：

```text
http://localhost:21023/v1
```

仓库中的开发脚本会显式使用项目默认端口。

---

## 使用 Docker

项目镜像默认监听 `21023`：

```bash
docker run -d \
  --name potluck \
  -p 21023:21023 \
  -e DATA_DIR=/app/data \
  -e JWT_SECRET="replace-with-a-long-random-value" \
  -e INITIAL_PASSWORD="replace-this-password" \
  -v "$HOME/.potluck:/app/data" \
  ghcr.io/ezero23/potluck:latest
```

然后打开：

```text
http://localhost:21023/dashboard
```

兼容 API Base URL 为：

```text
http://localhost:21023/v1
```

也可以从当前源码构建镜像：

```bash
docker build -t potluck .
docker run -d \
  --name potluck \
  -p 21023:21023 \
  -e DATA_DIR=/app/data \
  -e JWT_SECRET="replace-with-a-long-random-value" \
  -e INITIAL_PASSWORD="replace-this-password" \
  -v "$HOME/.potluck:/app/data" \
  potluck
```

---

## 生产构建

```bash
npm ci
npm run build
PORT=21023 HOSTNAME=0.0.0.0 NODE_ENV=production npm start
```

生产端口由 `PORT` 控制。反向代理、客户端 Base URL 和健康检查必须使用同一个实际端口。

---

## 首次登录

当数据库里还没有密码哈希、并且未设置 `INITIAL_PASSWORD` 时，初始仪表盘密码为：

```text
123456
```

登录后可以在应用设置中修改。将实例开放给其他机器或公网前，必须换成独立的强密码；也可以在首次启动前设置 `INITIAL_PASSWORD`。

---

## 连接提供商

1. 打开 **仪表盘 → 提供商**。
2. 选择与你的账户和地区相符的提供商。
3. 完成受支持的 OAuth 流程，或添加提供商 API Key。
4. 运行连接测试。
5. 刷新并确认账户实际可用的模型。

Potluck 不提供第三方账户、订阅、额度或 API Key。

---

## 端点 API Key

在 **仪表盘 → Endpoint** 中可以创建 Potluck 端点 Key，并启用 API Key 验证。

如果启用了验证，客户端请求需要：

```http
Authorization: Bearer YOUR_POTLUCK_KEY
```

本地安装默认是否要求 Key 取决于当前设置。对外暴露实例前，应启用验证。

---

## 验证安装

使用默认配置时：

```bash
curl http://localhost:21023/api/health
```

预期响应：

```json
{"ok":true}
```

启用端点 Key 后，可以列出实例实际提供的模型：

```bash
curl http://localhost:21023/v1/models \
  -H "Authorization: Bearer YOUR_POTLUCK_KEY"
```

如果使用了自定义端口，所有 URL 都应使用同一个自定义值。

---

## 数据目录

未设置 `DATA_DIR` 时：

- macOS/Linux：`~/.potluck`
- Windows：`%APPDATA%\potluck`

当前主数据库为：

```text
${DATA_DIR}/db/data.sqlite
```

自动数据库备份位于：

```text
${DATA_DIR}/db/backups/
```

旧版本的 `db.json`、`usage.json`、`disabledModels.json` 和
`request-details.json` 只用于兼容迁移，不是当前主数据库。

Docker 部署必须挂载持久卷或主机目录，否则删除容器时会丢失应用数据。

---

## 关键环境变量

以 [.env.example](https://github.com/Ezero23/potluck/blob/main/.env.example)
为当前配置模板。常用变量包括：

```bash
JWT_SECRET=replace-with-a-long-random-value
INITIAL_PASSWORD=replace-this-password
DATA_DIR=/var/lib/potluck
PORT=21023
NODE_ENV=production
ENABLE_REQUEST_LOGS=false
```

不要把真实密码、JWT secret 或提供商凭据提交到 Git。端点 API Key
验证目前应在 **仪表盘 → Endpoint** 中启用。

---

## 反向代理

以下示例假设 Potluck 在本机默认端口 `21023` 运行：

```nginx
server {
    listen 443 ssl;
    server_name potluck.example.com;

    location / {
        proxy_pass http://127.0.0.1:21023;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_read_timeout 86400;
    }
}
```

请自行配置有效的 TLS 证书。不要在公网直接暴露未启用登录保护和端点 Key 验证的实例。

---

## 常见问题

### 端口被占用

检查默认应用端口 `21023`：

```bash
lsof -i :21023
```

生产模式可以选择其他端口：

```bash
PORT=20200 HOSTNAME=0.0.0.0 NODE_ENV=production npm start
```

### 仪表盘打不开

- 确认进程仍在运行。
- 使用实例实际配置的应用端口。
- 先请求 `/api/health`，确认服务本身可访问。
- 远程部署时检查防火墙、容器端口映射和反向代理。

### 提供商连接失败

- 确认凭据所属地区与所选提供商一致。
- 确认账户已开通相应 API 或订阅权限。
- 检查代理配置和提供商服务状态。
- 重新运行连接测试，并以返回的原始错误为准排查。

### 升级或迁移前

备份整个 `DATA_DIR`，尤其是：

```text
${DATA_DIR}/db/data.sqlite
${DATA_DIR}/db/backups/
```

---

## 卸载

删除源码目录不会自动删除数据目录。确认备份无误后，再按需要分别移除项目目录、容器和 `DATA_DIR`。

---

## 下一步

- [快速开始](./quick-start.md)
- [组合](../features/combos.md)
- [故障排除](../troubleshooting.md)
- [GitHub Issues](https://github.com/Ezero23/potluck/issues)
