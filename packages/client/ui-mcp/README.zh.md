# @deepseek-ai/dsh-client-ui-mcp

[English](README.md) | 中文

「MCP」页:侧边栏底部管理桥接 MCP 服务器的界面。浏览器插件注册一个 `sidebar.footer.action` 条目(id `mcp`),打开全屏面板,列出每个桥接服务器及其传输和启用开关,提供按服务器名的搜索,以及可展开的明细块(该服务器注册的工具清单)。读写走生成的 [`mcpInventory`](../../host/mcp-inventory/README.md) Remote:`list` 取快照、`setEnabled` 翻转开关(返回的快照为准)。宿主侧该翻转委托给插件清单,因此服务器停用像其他插件条目一样持久化并热生效。

## Model Experience

间接生效:所列服务器的工具就是模型可见的原生工具。停用某服务器会把它暴露的工具从模型可调用面移除。

#### KV Cache effect

无;本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- 每次打开或重试取一次快照——面板不订阅桥接变化。
- 工具清单是注册的公共名;原始线名保留在桥接内部。
