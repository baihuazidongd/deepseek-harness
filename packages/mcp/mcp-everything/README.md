# @deepseek-ai/dsh-mcp-everything

English | [中文](README.zh.md)

Config-only bundle that mounts the [`mcp-client`](../mcp-client/README.md) bridge pointed at a bundled, self-contained stdio MCP server. The server exposes three tools — `echo`, `add`, `now` — under the `everything` namespace (`mcp__everything__echo`, `mcp__everything__add`, `mcp__everything__now`), so an MCP bridge can be verified offline without downloading a reference server.

The bundle carries no source: its `cordis.patch.yml` inserts one `mcp-client` row whose config spawns `node server/echo-server.mjs`. Installing it (`dsh plugin --profile <name> add`) makes the package a profile layer, and the plugin manager can then enable or disable the `mcp-everything` row.

## Model Experience

The registered MCP tools are model-visible as native tools under their server-qualified names. Each tool call crosses the stdio bridge to the bundled server and returns its text result.

#### KV Cache effect

One provider prefix per registered tool; the tools' names and schemas enter the request when the composition mounts this bundle.

## Known Limitations and Deferred Work

- The bundled server is a fixed demo surface (`echo`/`add`/`now`); real deployments point `mcp-client` at their own server instead.
- The server script path is resolved from the harness process cwd (`process.cwd()`), so the bundle assumes the dsh surface is launched from the repository root.
