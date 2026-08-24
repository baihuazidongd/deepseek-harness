/**
 * Remote projection of the MCP servers this composition bridges: each
 * `mcp-client` Loader entry is one server, and its live tools are read from
 * the tool registry under the `mcp__<serverName>__` prefix the bridge owns.
 * Enablement toggles delegate to the plugin inventory, so a server flip
 * persists and hot-applies exactly like any other plugin entry.
 * @module @deepseek-ai/dsh-host-mcp-inventory
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
// Type-only: pulls the `ctx.tools` Context merge (the tool registry).
import type {} from '@deepseek-ai/dsh-tools'
// Type-only: pulls the `ctx.pluginInventory` Context merge (the enablement write).
import type {} from '@deepseek-ai/dsh-host-plugin-inventory'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type { PluginEntryId } from '@deepseek-ai/dsh-host-plugin-inventory/types'
import type {
  McpInventorySetEnabledRequest,
  McpInventorySnapshot,
  McpServerEntry,
  McpToolView,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    mcpInventory: McpInventoryGateway
  }
}

/** The Loader module specifier every MCP bridge instance imports. */
const MCP_CLIENT_NAME = '@deepseek-ai/dsh-mcp-client'

/** Prefix of every tool a server registers, per the mcp-client naming contract. */
function toolPrefix(serverName: string): string {
  return `mcp__${serverName}__`
}

/** Remote-only service exposing the current MCP servers and their tools. */
export class McpInventoryGateway extends TypertRemoteService {
  static inject = ['loader', 'tools', 'pluginInventory']

  constructor(ctx: Context) {
    super(ctx, 'mcpInventory')
  }

  /**
   * Read every mcp-client entry and attach its live tools. Tools are grouped
   * by the authoritative `serverName` from the entry's config, never by
   * re-parsing the public tool name.
   * @returns the MCP servers in Loader order, each with its registered tools.
   */
  @Remote('list')
  list(): McpInventorySnapshot {
    const schemas = this.ctx.tools.schemas()
    const servers: McpServerEntry[] = []
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.name !== MCP_CLIENT_NAME) continue
      const serverName = entry.options.config?.serverName as string | undefined
      if (typeof serverName !== 'string' || serverName.length === 0) continue
      const prefix = toolPrefix(serverName)
      const tools: McpToolView[] = schemas
        .filter(schema => schema.name.startsWith(prefix))
        .map(schema => ({ name: schema.name, description: schema.description }))
      servers.push({
        name: serverName,
        entryId: entry.id,
        transport: String(entry.options.config?.transport ?? ''),
        enabled: !entry.disabled,
        status: !entry.disabled
          ? (tools.length > 0 ? 'active' : 'error')
          : 'disabled',
        tools,
      })
    }
    return { servers }
  }

  /**
   * Persist and hot-apply one server's enablement by delegating to the plugin
   * inventory's enablement write, then return the refreshed snapshot.
   * @param request - the server name and desired enablement.
   * @returns the refreshed MCP inventory snapshot.
   * @throws when the server name matches no mcp-client entry.
   */
  @Remote('setEnabled')
  async setEnabled(request: McpInventorySetEnabledRequest): Promise<McpInventorySnapshot> {
    const entry = [...this.ctx.loader.entries()].find(candidate =>
      candidate.options.name === MCP_CLIENT_NAME
      && candidate.options.config?.serverName === request.name)
    if (entry === undefined) {
      throw new Error(`mcpInventory.setEnabled: unknown MCP server ${JSON.stringify(request.name)}`)
    }
    await this.ctx.pluginInventory.setEnabled({ entryId: entry.id as PluginEntryId, enabled: request.enabled })
    return this.list()
  }
}

export default McpInventoryGateway
