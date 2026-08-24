# @deepseek-ai/dsh-host-mcp-inventory

[English](README.md) | 中文

桥接的 MCP 服务器及其工具的 Remote 投影。每个 `mcp-client` Loader 条目即一个服务器;网关读取其权威 `serverName`,并挂上该服务器注册的工具(按桥接拥有的 `mcp__<serverName>__` 前缀匹配)。它暴露 `list` 与 `setEnabled`,其中服务器开关委托给插件清单,因此像其他插件条目一样持久化并热生效。

## Model Experience

间接生效:注册的 MCP 工具以带服务器命名空间的原生工具名对模型可见。停用某服务器会把它暴露的工具从模型可调用面移除。

#### KV Cache effect

本身无直接影响;开关某服务器会增删其工具的 provider 前缀。

## Known Limitations and Deferred Work

- 工具按 `mcp__<serverName>__` 前缀对权威服务器名匹配,因此含 `__` 的服务器名能正确分组,但占用该前缀的外部注册会被误归属。
