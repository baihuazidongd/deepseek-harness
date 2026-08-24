# @deepseek-ai/dsh-mcp-everything

[English](README.md) | 中文

纯配置 bundle，挂载指向一个随包自带、自包含 stdio MCP 服务器的 [`mcp-client`](../mcp-client/README.md) 桥接。该服务器在 `everything` 命名空间下暴露三个工具——`echo`、`add`、`now`（`mcp__everything__echo`、`mcp__everything__add`、`mcp__everything__now`），因此无需下载参考服务器即可离线验证 MCP 桥接。

该 bundle 无源码：其 `cordis.patch.yml` 插入一行 `mcp-client`，配置为 spawn `node server/echo-server.mjs`。安装它（`dsh plugin --profile <name> add`）使该包成为 profile 层，之后插件管理器即可启用或禁用 `mcp-everything` 行。

## Model Experience

注册的 MCP 工具以带服务器命名空间的原生工具名对模型可见。每次工具调用经 stdio 桥接发往随包服务器并返回其文本结果。

#### KV Cache effect

每个注册工具一个 provider 前缀；当组合挂载此 bundle 时，工具名与 schema 进入请求。

## Known Limitations and Deferred Work

- 随包服务器是固定的演示面（`echo`/`add`/`now`）；真实部署应让 `mcp-client` 指向自己的服务器。
- 服务器脚本路径按 harness 进程 cwd（`process.cwd()`）解析，因此该 bundle 假设 dsh 表面从仓库根目录启动。
