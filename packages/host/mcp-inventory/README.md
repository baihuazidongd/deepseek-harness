# @deepseek-ai/dsh-host-mcp-inventory

English | [中文](README.zh.md)

Remote projection of the bridged MCP servers and their tools. Each `mcp-client` Loader entry is one server; the gateway reads its authoritative `serverName` and attaches the tools that server registers (matched by the `mcp__<serverName>__` prefix the bridge owns). It exposes `list` and `setEnabled`, where a server flip delegates to the plugin inventory so it persists and hot-applies like any other plugin entry.

## Model Experience

Indirectly: the registered MCP tools are model-visible as native tools under their server-qualified names. Disabling a server removes its tools from the model's callable surface.

#### KV Cache effect

None directly; toggling a server adds or removes its tools' provider prefixes from the request.

## Known Limitations and Deferred Work

- Tools are matched by the `mcp__<serverName>__` prefix against the authoritative server name, so a server name containing `__` is grouped correctly but a foreign registration squatting on the prefix would be misattributed.
