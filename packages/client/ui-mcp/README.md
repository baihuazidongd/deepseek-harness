# @deepseek-ai/dsh-client-ui-mcp

English | [中文](README.zh.md)

The MCP page: a sidebar-foot management surface for bridged MCP servers. The browser plugin registers one `sidebar.footer.action` entry (id `mcp`) and opens a full-viewport panel that lists every bridged server with its transport and an enablement switch, a search over server name, and an expandable detail block listing the tools that server registers. Reads and writes go through the generated [`mcpInventory`](../../host/mcp-inventory/README.md) Remote: `list` for snapshots and `setEnabled` for a switch flip (whose returned snapshot is authoritative). On the Host, the flip delegates to the plugin inventory, so a server disable persists and hot-applies like any other plugin entry.

## Model Experience

Indirectly: the listed servers' tools are the model-visible native tools. Disabling a server removes its tools from the model's callable surface.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- One snapshot per open or retry — the panel does not subscribe to bridge changes.
- The tool list is the registered public names; raw wire names stay inside the bridge.
