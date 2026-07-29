# Potluck · 百家饭

**一个把请求分配到多个同类模型来源的自托管路由器。**

[![GitHub](https://img.shields.io/badge/GitHub-Ezero23%2Fpotluck-blue?logo=github)](https://github.com/Ezero23/potluck)
[![License](https://img.shields.io/github/license/Ezero23/potluck)](https://github.com/Ezero23/potluck/blob/main/LICENSE)

[快速开始](#快速开始) · [模型路由池](#模型路由池) · [部署](#部署) · [English](./README.md)

## 百家饭做什么

百家饭为 OpenAI 兼容客户端提供一个本地入口，再把请求路由到你自己配置的提供商账户和 API
端点。它重点解决的是：当多个来源能够提供同一模型时，怎样把它们组成一个可观察、可回退的模型池。

- **轮转优先调度**：在健康来源之间分散请求，而不是先耗尽第一个来源。
- **同模型多源聚合**：自动发现匹配某个模型族的 `提供商/模型`，组成一个路由池。
- **并发感知选择**：避免多个同时到达的请求集中打到同一个来源。
- **单次请求内回退**：当前来源无法服务时，可以尝试另一个符合条件的来源。
- **协议转换**：连接 OpenAI、Anthropic、Gemini 等已支持的请求和流式响应格式。
- **本地可观察性**：记录用量、估算成本、来源健康状态和可选请求日志。

回退可以提高可用性，但不等于“永不掉线”。当所有候选来源都不可用、凭据失效、提供商修改
接口、客户端断开或发生不可恢复错误时，请求仍然可能失败。

## 项目状态

百家饭目前是一个仍在持续加固的早期分支。CI 会检查 lint、自动化测试和生产构建。升级前请备份
`DATA_DIR`；如果要暴露到公网，请先检查安全配置和当前版本说明。

提供商是否可用、模型名称、价格、配额和免费额度都由第三方决定，可能随时变化。百家饭不承诺
任何提供商或模型永久免费、无限量或永久可用。控制面板显示的成本是估算值，不是账单。

## 快速开始

环境要求：

- Node.js 22
- npm

安装 CLI 发布包：

```bash
npm install -g https://github.com/Ezero23/potluck/releases/download/v0.5.20/potluck-cli-0.5.20.tgz
potluck
```

如果需要从源码开发：

```bash
git clone https://github.com/Ezero23/potluck.git
cd potluck
cp .env.example .env
npm ci
npm run dev
```

打开 `http://localhost:21023/dashboard`，连接至少一个提供商，然后在控制面板中创建或复制 API Key。

当数据库中还没有密码哈希时，控制面板初始密码默认为 `123456`。后续可以在应用设置中修改，也
可以通过 `INITIAL_PASSWORD` 配置。

把支持 OpenAI 兼容接口的客户端指向：

```text
Base URL: http://localhost:21023/v1
API Key:  [百家饭控制面板中创建的 Key]
Model:    profile:claude
```

直接使用 `provider/model` 会绕过路由 profile。实际可用的模型标识取决于已连接的提供商，可以
通过 `GET /v1/models` 查询。

## 模型路由池

路由 profile 从项目根目录或 `DATA_DIR`（默认 `~/.potluck`）中的 `routing.json` 读取，并会
定期重新加载。

```json
{
  "profiles": {
    "claude": {
      "description": "在已配置的 Claude Sonnet 来源之间轮转",
      "strategy": "rotation",
      "aggregate": "claude-sonnet-4",
      "aggregateExclude": ["blackbox"],
      "fallbackOn": ["403", "429", "quota_exceeded", "timeout", "5xx"]
    }
  }
}
```

使用时填写 `profile:claude`；在支持裸 profile 名称的入口也可以填写 `claude`。

查看解析后的候选来源和当前健康状态：

```bash
curl http://localhost:21023/api/routing/pools
```

轮转状态只保存在当前进程内，重启后会重新开始。聚合只会使用本机配置和注册表中已有的来源，
不会替用户创建账户，也不会绕过第三方提供商的配额或限制。

## 支持的接口

百家饭提供兼容 OpenAI 风格的聊天、Responses、嵌入、图像、音频等接口，但具体能力取决于
提供商。项目也包含若干编程客户端的配置辅助功能。

客户端与提供商之间的兼容程度并不完全相同。依赖某个模型前，请先在控制面板中测试，尤其是
工具调用、图像、推理块和流式响应。

可选的 token 处理能力包括 RTK 风格的工具输出压缩、Headroom、Caveman 和 Ponytail 模式。
实际效果取决于内容和配置，项目不承诺固定的 token 节省比例。

## 部署

### 生产构建

```bash
npm run build
PORT=21023 HOSTNAME=0.0.0.0 NODE_ENV=production npm start
```

### Docker

```bash
docker build -t potluck .
docker run -d --name potluck \
  -p 21023:21023 \
  -v "$HOME/.potluck:/app/data" \
  -e DATA_DIR=/app/data \
  potluck
```

有可用发布版本时，镜像会发布到 `ghcr.io/ezero23/potluck`。如果需要在替换容器后保留提供商配置、
密钥、设置和用量历史，必须挂载持久化目录。

公网部署至少应当：

- 设置非默认的控制面板密码；
- 在 **仪表盘 → Endpoint** 中启用端点 API Key 验证；
- 使用可信反向代理终止 HTTPS；
- 设置 `AUTH_COOKIE_SECURE=true`；
- 保护并备份 `DATA_DIR`；
- 除非确实需要调试，否则不要开启请求正文日志。

## 数据与日志

- 应用数据库：`${DATA_DIR}/db/data.sqlite`
- 自动数据库备份：`${DATA_DIR}/db/backups/`
- 路由配置：`${DATA_DIR}/routing.json` 或 `./routing.json`
- 可选请求日志：设置 `ENABLE_REQUEST_LOGS=true` 后写入 `./logs/`

提供商凭据和日志都属于敏感数据。不要公开数据目录、`.env` 文件、数据库备份或调试日志。

## API 示例

```bash
curl http://localhost:21023/v1/chat/completions \
  -H "Authorization: Bearer YOUR_POTLUCK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "profile:claude",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": false
  }'
```

```bash
curl http://localhost:21023/v1/models \
  -H "Authorization: Bearer YOUR_POTLUCK_API_KEY"
```

## 项目来源与致谢

百家饭以 [9router](https://github.com/decolua/9router) 为直接代码基础，并保留了 9router 的
MIT 许可证和上游版权声明。在这个基础上，百家饭加入了轮转优先调度、同模型多源聚合、并发感知
选择、路由池状态接口，以及针对百家饭部署和安全边界的改进。

[OmniRoute](https://github.com/diegosouzapw/OmniRoute) 也是一个源自 9router 的项目。它不是
百家饭的分支；这里将它列为同源项目和工程实践参考。

继承的代码和百家饭的相关集成还受益于
[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)、
[RTK](https://github.com/rtk-ai/rtk)、
[Headroom](https://github.com/chopratejas/headroom)、
[Caveman](https://github.com/JuliusBrussee/caveman) 和
[Ponytail](https://github.com/DietrichGebert/ponytail)。
每个项目与百家饭的具体关系见 [NOTICE.md](./NOTICE.md)。

项目名和产品名归各自权利人所有。兼容性说明不代表相关项目或公司与百家饭存在隶属、合作或背书关系。

## 支持与许可证

- 问题反馈：[github.com/Ezero23/potluck/issues](https://github.com/Ezero23/potluck/issues)
- 许可证：[MIT](./LICENSE)

重新分发本软件的实质性部分时，必须保留 `LICENSE` 中的上游版权声明。
