# Continue

Continue 可以把 Potluck 作为 OpenAI 兼容模型提供商。当前 Continue 推荐
`config.yaml`，旧的 `config.json` 已被标记为废弃。

## 开始前

1. 启动 Potluck，打开 `http://localhost:21023/dashboard`。
2. 添加并测试至少一个提供商连接。
3. 打开 **Endpoint（端点）**，创建并复制一个 API Key。
4. 按照 [Continue 官方安装文档](https://docs.continue.dev/getting-started/install)
   安装 Continue 扩展。

## 获取有效模型 ID

```bash
curl http://localhost:21023/v1/models \
  -H "Authorization: Bearer YOUR_POTLUCK_API_KEY"
```

选择一个完整的 `data[].id`。下面使用 `MODEL_ID` 作为占位符，因为每个
Potluck 实例的模型目录都不同。

## 保存 API Key

创建或编辑 `~/.continue/.env`：

```dotenv
POTLUCK_API_KEY=YOUR_POTLUCK_API_KEY
```

不要提交该文件。Continue 的 IDE 扩展不会可靠继承只在终端中 `export`
的变量，因此 `.env` 才是受支持的本地密钥来源。

## 配置 Continue

打开 Continue 的配置选择器，点击齿轮图标编辑本地 `config.yaml`。默认全局
路径是 `~/.continue/config.yaml`。

加入一个 Potluck 模型：

```yaml
name: Potluck
version: 1.0.0
schema: v1

models:
  - name: Potluck
    provider: openai
    model: MODEL_ID
    apiBase: http://localhost:21023/v1
    apiKey: ${{ secrets.POTLUCK_API_KEY }}
    roles:
      - chat
      - edit
      - apply
```

如果已有配置，请把模型条目合并到现有 `models` 列表，不要覆盖整个文件。
修改 `~/.continue/.env` 后需要重启或重新加载 IDE。

## 添加多个模型

在 `models` 下增加条目，并使用不同的 `name`：

```yaml
  - name: Potluck secondary
    provider: openai
    model: ANOTHER_MODEL_ID
    apiBase: http://localhost:21023/v1
    apiKey: ${{ secrets.POTLUCK_API_KEY }}
    roles:
      - chat
```

只使用当前 Potluck 实例返回的模型 ID，不要复制旧教程中的固定模型清单。

## 验证连接

先检查 Potluck：

```bash
curl http://localhost:21023/api/health
```

打开 Continue Chat，选择刚配置的 Potluck 模型并发送简短消息。如果 Agent
模式需要工具调用，应选择真正支持工具调用的模型。

## 远程部署

将 `apiBase` 换成 HTTPS 地址：

```yaml
apiBase: https://potluck.example.com/v1
```

暴露公网前，请在 **Dashboard → Endpoint** 开启端点 API Key 验证。
`localhost` 始终表示运行 Continue 扩展的机器。

## 故障排查

- **配置未加载：**使用 `config.yaml`，不要使用已废弃的 `config.json`；
  同时确认存在 `name`、`version`、`schema`。
- **找不到密钥：**将 `POTLUCK_API_KEY=...` 写入
  `~/.continue/.env`，然后重新加载 IDE。
- **返回 401：**确认使用的是 Potluck API Key，而不是上游提供商密钥。
- **返回 404：**确认 `apiBase` 以 `/v1` 结尾。
- **模型不存在：**复制 `/v1/models` 返回的完整 ID。
- **Agent 工具不可用：**选择支持工具调用的模型；只有确认模型支持时，才
  手动加入 `capabilities: [tool_use]`。

当前格式请参考 Continue 的
[`config.yaml` 官方参考](https://docs.continue.dev/reference)和
[OpenAI 兼容提供商文档](https://docs.continue.dev/customize/model-providers/top-level/openai)。
