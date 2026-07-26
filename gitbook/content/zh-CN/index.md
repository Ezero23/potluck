# 百家饭文档

百家饭是一个自托管路由器，用来把请求分配到多个能够提供同一模型族的已配置来源。

百家饭自己的路由工作重点包括：

- 在健康来源之间轮转；
- 自动聚合匹配的模型来源；
- 根据并发情况选择来源；
- 在单次请求内尝试另一个符合条件的来源；
- 查看解析后的路由池和来源健康状态。

回退可以提高可用性，但不保证服务永不中断。当所有候选来源都不可用，或客户端、凭据、网络、
提供商发生无法恢复的问题时，请求仍然可能失败。

## 快速开始

```bash
git clone https://github.com/Ezero23/potluck.git
cd potluck
cp .env.example .env
npm ci
npm run dev
```

打开 `http://localhost:21023/dashboard`，连接提供商并创建 API Key，然后把 OpenAI 兼容客户端
指向：

```text
Base URL: http://localhost:21023/v1
API Key:  [在仪表盘 → Endpoint 中创建的 Key]
Model:    [GET /v1/models 返回的模型标识]
```

当没有保存的密码时，控制面板初始密码是 `123456`。把服务开放给其他设备之前应先修改密码。

## 第三方服务说明

模型目录、价格、配额、认证方式和免费额度都由第三方提供商决定，可能随时变化。百家饭不保证
任何提供商或模型永久免费、无限量或永久可用。

其余提供商和功能文档正在按照当前代码重新审核。在价格或配额信息带有来源和复核日期之前，请
仅把它们视为示例。

## 项目来源

百家饭以 [9router](https://github.com/decolua/9router) 为直接代码基础，并保留了其 MIT 许可证
和上游版权声明。

[OmniRoute](https://github.com/diegosouzapw/OmniRoute) 也是一个源自 9router 的相关项目，
不是百家饭的分支。

已验证的功能、部署说明和详细致谢请查看仓库
[README](https://github.com/Ezero23/potluck/blob/main/README.zh-CN.md) 与
[NOTICE](https://github.com/Ezero23/potluck/blob/main/NOTICE.md)。
