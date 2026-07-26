# 本地部署

这套方式适合在一台电脑上开发、评估和个人使用。本页介绍源码安装；需要打包命令行版本时，
可以按照项目 README 安装 `potluck-cli`。

---

## 安装

要求：

- Node.js 22
- npm
- Git

```bash
git clone https://github.com/Ezero23/potluck.git
cd potluck
cp .env.example .env
npm ci
```

---

## 启动开发模式

```bash
npm run dev
```

手动打开仪表盘：

```text
http://localhost:21023/dashboard
```

客户端 Base URL：

```text
http://localhost:21023/v1
```

健康检查：

```bash
curl http://localhost:21023/api/health
```

预期响应：

```json
{"ok":true}
```

开发脚本显式使用项目默认端口 `21023`。

---

## 配置提供商和客户端

1. 如果首次启动前没有设置 `INITIAL_PASSWORD`，使用初始密码 `123456` 登录。
2. 在应用设置中修改密码。
3. 打开 **仪表盘 → 提供商**，添加连接并运行测试。
4. 如果启用了端点 API Key 验证，在 **仪表盘 → Endpoint** 创建 Potluck Key。
5. 在兼容客户端中配置本地 `/v1` Base URL，以及当前实例可用的模型或组合名称。

提供商访问权限、配额和费用仍由相应提供商负责。

---

## 停止和重启

在运行 `npm run dev` 的终端中按 `Ctrl+C`。再次执行同一命令即可重启。

应用数据保存在 `DATA_DIR` 中，停止服务器不会删除数据。

---

## 数据与备份

未设置 `DATA_DIR` 时：

- macOS/Linux：`~/.potluck`
- Windows：`%APPDATA%\potluck`

当前存储结构：

```text
${DATA_DIR}/
└── db/
    ├── data.sqlite
    └── backups/
```

升级后可能仍保留旧 JSON 文件，因为迁移过程会把它们作为兼容输入。它们不是当前活动数据库。

升级前先停止 Potluck，并备份完整的 `DATA_DIR`。

---

## 更新源码

先阅读发布说明并备份 `DATA_DIR`，然后执行：

```bash
git pull --ff-only
npm ci
npm run build
```

构建成功后重新运行 `npm run dev`。

---

## 故障排除

### `21023` 端口被占用

macOS 或 Linux：

```bash
lsof -i :21023
```

优先正常停止占用进程。只有常规终止失败后才考虑 `kill -9`。

### 数据目录不可写

检查 `DATA_DIR` 指向的目录。macOS 或 Linux：

```bash
ls -ld "$HOME/.potluck"
```

不要把包含凭据的数据目录设置为所有用户可读。

### 客户端无法连接

- 确认 `curl http://localhost:21023/api/health` 成功。
- 确认客户端要求的 Base URL 以 `/v1` 结尾。
- 确认当前 Potluck 实例返回了所用模型 ID。
- 如果启用了端点 Key 验证，提供一个有效的 Potluck 端点 Key。

---

## 下一步

- [连接订阅提供商](../providers/subscription.md)
- [创建组合](../features/combos.md)
- [连接兼容客户端](../integration/other-tools.md)
