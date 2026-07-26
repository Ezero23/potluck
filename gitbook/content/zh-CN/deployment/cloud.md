# 服务器部署

本文说明如何在 Linux 服务器上部署一个自托管 Potluck 实例。Potluck 不提供官方托管云服务；域名、服务器、TLS 证书、提供商账户和运行费用均由部署者负责。

对于新安装，推荐使用 Docker 并挂载持久数据目录。

---

## 开始前准备

你需要：

- 一台安装了 Docker 的 Linux 服务器；
- 如果通过公网使用，需要一个域名；
- 修改 DNS 和防火墙规则的权限；
- 至少一个你有权使用的模型提供商账户。

生成随机值：

```bash
openssl rand -hex 32
```

把生成值用作 `JWT_SECRET`，并另外设置一个独立的强仪表盘密码。

---

## Docker 部署

### 1. 创建私有数据目录

```bash
sudo install -d -m 700 /var/lib/potluck
sudo chown "$(id -u):$(id -g)" /var/lib/potluck
```

### 2. 启动容器

如果 Nginx 与 Potluck 位于同一台服务器，把 Potluck 只绑定到回环地址：

```bash
docker run -d \
  --name potluck \
  --restart unless-stopped \
  -p 127.0.0.1:21023:21023 \
  -e DATA_DIR=/app/data \
  -e JWT_SECRET="REPLACE_WITH_RANDOM_SECRET" \
  -e INITIAL_PASSWORD="REPLACE_WITH_STRONG_PASSWORD" \
  -v /var/lib/potluck:/app/data \
  ghcr.io/ezero23/potluck:latest
```

容器监听 `21023`。仪表盘和兼容 API 路由使用同一个端口。

在服务器本机检查：

```bash
curl http://127.0.0.1:21023/api/health
```

预期响应：

```json
{"ok":true}
```

查看日志：

```bash
docker logs --tail 100 -f potluck
```

如果某个版本没有可用的发布镜像，可以从源码构建：

```bash
git clone https://github.com/Ezero23/potluck.git
cd potluck
docker build -t potluck .
```

然后把运行命令中的镜像名称换成 `potluck`。

---

## Docker Compose

仓库包含 `docker-compose.yml`。它会从当前源码构建 Potluck，并启动可选的 Headroom 服务：

```bash
git clone https://github.com/Ezero23/potluck.git
cd potluck
cp .env.example .env
```

启动前编辑 `.env`：

```dotenv
JWT_SECRET=REPLACE_WITH_RANDOM_SECRET
INITIAL_PASSWORD=REPLACE_WITH_STRONG_PASSWORD
PORT=21023
NODE_ENV=production
```

然后运行：

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:21023/api/health
```

仓库当前的 Compose 文件会把 Potluck 发布在 `21023`，并把可选 Headroom 服务发布在
`8787`。公网服务器应通过主机防火墙限制这两个端口，只让反向代理直接面向互联网。

启用公网反向代理前，先通过 SSH 隧道连接：

```bash
ssh -L 21023:127.0.0.1:21023 user@your-server
```

打开 `http://localhost:21023/dashboard`，修改仪表盘密码，然后在
**仪表盘 → Endpoint** 创建 Potluck 端点 Key 并启用 API Key 验证。

---

## Nginx 与 HTTPS

使用 Linux 发行版支持的软件包安装 Nginx 和 Certbot。申请证书前，先把域名 DNS 记录指向服务器。

仪表盘和 API 使用同一个上游：

```nginx
server {
    listen 80;
    server_name potluck.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name potluck.example.com;

    ssl_certificate /etc/letsencrypt/live/potluck.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/potluck.example.com/privkey.pem;

    client_max_body_size 128m;

    location / {
        proxy_pass http://127.0.0.1:21023;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 86400;
    }
}
```

替换 `potluck.example.com`，测试并重新加载 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

公网地址为：

```text
仪表盘：https://potluck.example.com/dashboard
API Base URL：https://potluck.example.com/v1
健康检查：https://potluck.example.com/api/health
```

Potluck 没有单独的仪表盘端口。

---

## 安全检查清单

允许外部访问前：

- 修改默认仪表盘密码；
- 设置持久且随机的 `JWT_SECRET`；
- 保持仪表盘登录验证启用；
- 启用 Potluck 端点 API Key 验证；
- 使用 HTTPS；
- 公网只开放 `80` 和 `443`；
- 不公开 `21023` 和可选的 Headroom 端口；
- 保护 `.env`、`DATA_DIR`、日志和备份；
- 不要把提供商凭据复用为 Potluck 端点 Key；
- 升级前阅读发布说明。

Potluck 保存的凭据可以访问第三方服务。应把完整数据目录视为敏感数据。

---

## 备份与更新

活动数据库位于：

```text
/var/lib/potluck/db/data.sqlite
```

进行文件系统级备份前，先停止容器：

```bash
sudo install -d -m 700 /var/backups
docker stop potluck
sudo tar -C /var/lib -czf "/var/backups/potluck-$(date +%Y%m%d-%H%M%S).tar.gz" potluck
docker start potluck
```

确认备份存在且可以读取目录：

```bash
sudo tar -tzf /var/backups/potluck-YYYYMMDD-HHMMSS.tar.gz | head
```

更新基于镜像的安装时：

1. 阅读发布说明。
2. 备份 `/var/lib/potluck`。
3. 拉取计划使用的镜像标签。
4. 使用相同环境变量和数据挂载重新创建容器。
5. 检查 `/api/health`、登录仪表盘，并测试一个提供商后再恢复正常流量。

对于保存凭据并转发可能产生费用的请求的服务，不建议无人值守自动升级。

---

## 故障排除

### Nginx 返回 502

```bash
docker ps --filter name=potluck
docker logs --tail 100 potluck
curl http://127.0.0.1:21023/api/health
sudo nginx -t
```

### 流式输出延迟

确认生效的 Nginx `location` 中包含 `proxy_buffering off`，并配置了足够长的 `proxy_read_timeout`。

### 容器无法写入数据

```bash
ls -ld /var/lib/potluck
docker logs --tail 100 potluck
```

不要通过把数据目录设置为所有用户可读来解决权限问题。

### 客户端收到 401

确认客户端发送的是有效的 Potluck 端点 Key，而不是提供商 API Key：

```http
Authorization: Bearer YOUR_POTLUCK_KEY
```

---

## 下一步

- [连接订阅提供商](../providers/subscription.md)
- [创建组合](../features/combos.md)
- [连接兼容客户端](../integration/other-tools.md)
