# Cline

Cline 可以通过 Potluck 的 OpenAI 兼容 API 使用 Potluck。手动配置时应选择
Cline 的 **OpenAI Compatible**；旧文档使用 Ollama 的做法已经不符合当前
Cline 界面。

## 开始前

1. 启动 Potluck，打开 `http://localhost:21023/dashboard`。
2. 添加并测试至少一个提供商连接。
3. 打开 **Endpoint（端点）**，创建并复制一个 API Key。
4. 从 [Cline 官方安装页面](https://docs.cline.bot/getting-started/installing-cline)
   安装 Cline。

模型 ID 必须来自你自己的 Potluck 实例。Potluck 不保证固定上游模型一定存在。

## 自动配置

当 Cline 和 Potluck 运行在同一个桌面用户下时：

1. 打开 `http://localhost:21023/dashboard/cli-tools`。
2. 展开 **Cline**。
3. 选择本地端点、API Key 和模型。
4. 点击 **Apply**。
5. 如果 VS Code 已经打开，请重新加载窗口。

Potluck 只更新自己的 Cline 提供商字段。需要撤销时，可在同一张卡片点击
**Reset**。

## 手动配置

当 Cline 位于另一台机器，或自动配置无法检测 Cline 时使用：

1. 在 VS Code 中打开 Cline，点击设置图标。
2. 将 **API Provider** 设为 **OpenAI Compatible**。
3. 填写：

```text
Base URL: http://localhost:21023/v1
API Key: YOUR_POTLUCK_API_KEY
Model ID: MODEL_ID_FROM_POTLUCK
```

Base URL 末尾必须保留 `/v1`。不要为了连接 Potluck 而选择 Ollama；Cline
已经提供专门的 OpenAI 兼容选项。

## 获取有效模型 ID

```bash
curl http://localhost:21023/v1/models \
  -H "Authorization: Bearer YOUR_POTLUCK_API_KEY"
```

从响应中复制一个完整的 `data[].id` 到 Cline 的 **Model ID** 字段。不要根据
提供商的宣传名称猜测模型 ID。

## 验证连接

先独立检查 Potluck：

```bash
curl http://localhost:21023/api/health
```

然后使用 Cline 的提供商验证功能，或新建一个 Cline 任务并发送简短消息。
可在 Potluck 的 **Usage（用量）** 页面确认请求是否到达。

## 远程部署

远程 Potluck 实例必须使用 HTTPS 地址：

```text
Base URL: https://potluck.example.com/v1
```

`localhost` 表示运行 VS Code 的机器，无法指向另一台电脑上的 Potluck。
暴露公网前，请在 **Dashboard → Endpoint** 开启端点 API Key 验证。

## 故障排查

- **连接被拒绝：**确认 Potluck 正在 `21023` 运行，并且 Cline 能访问该机器。
- **返回 401：**选择或重新创建 Potluck API Key；不要填写上游提供商密钥。
- **模型不存在：**查询 `/v1/models`，复制完整返回值。
- **返回 404：**确认手动填写的 Base URL 以 `/v1` 结尾。
- **设置未生效：**重新加载 VS Code 窗口并新建 Cline 任务。
- **工具调用异常：**换用明确支持工具调用的模型；能输出文本不等于适合
  Agent 任务。

Cline 当前字段及行为可参考
[OpenAI Compatible 官方文档](https://docs.cline.bot/provider-config/openai-compatible)。
