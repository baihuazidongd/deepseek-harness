import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { describe, expect, it, vi } from 'vitest'
import McpInventoryGateway from '../src/index.ts'

const MCP_CLIENT_NAME = '@deepseek-ai/dsh-mcp-client'

function schemas() {
  return [
    { name: 'mcp__everything__echo', description: 'Echoes text.', parameters: {} },
    { name: 'mcp__everything__add', description: 'Adds two numbers.', parameters: {} },
    { name: 'other__not__mcp', description: 'Unrelated tool.', parameters: {} },
  ]
}

async function mounted(): Promise<{ ctx: Context; setEnabled: ReturnType<typeof vi.fn> }> {
  const ctx = new Context()
  await ctx.plugin(Loader)
  const setEnabled = vi.fn(async () => ({ entries: [] }))
  ctx.provide('tools', { schemas })
  ctx.provide('pluginInventory', { setEnabled })
  const mcpEntry = {
    id: 'mcp-everything',
    name: MCP_CLIENT_NAME,
    disabled: true,
    config: { serverName: 'everything', transport: 'stdio' },
  }
  await ctx.loader.create(mcpEntry)
  await ctx.plugin(McpInventoryGateway)
  return { ctx, setEnabled }
}

describe('dsh-host-mcp-inventory', () => {
  it('groups each mcp-client entry with its prefix-matched tools', async () => {
    const { ctx } = await mounted()
    const snapshot = ctx.mcpInventory.list()
    expect(snapshot.servers).toHaveLength(1)
    expect(snapshot.servers[0]).toMatchObject({
      name: 'everything',
      transport: 'stdio',
      enabled: false,
      status: 'disabled',
      tools: [
        { name: 'mcp__everything__echo', description: 'Echoes text.' },
        { name: 'mcp__everything__add', description: 'Adds two numbers.' },
      ],
    })
  })

  it('marks an enabled server with no tools as error', async () => {
    const { ctx } = await mounted()
    const id = await ctx.loader.create({
      name: MCP_CLIENT_NAME,
      disabled: true,
      config: { serverName: 'empty', transport: 'stdio' },
    })
    // Flip the raw options without activating the entry, so `list()` sees an
    // enabled mcp-client row that registered no tools.
    const entry = [...ctx.loader.entries()].find(candidate => candidate.id === id)!
    entry.options.disabled = false
    const server = ctx.mcpInventory.list().servers.find(s => s.name === 'empty')
    expect(server?.status).toBe('error')
  })

  it('delegates a server toggle to the plugin inventory', async () => {
    const { ctx, setEnabled } = await mounted()
    await ctx.mcpInventory.setEnabled({ name: 'everything', enabled: true })
    expect(setEnabled).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    )
  })

  it('rejects a toggle for an unknown server name', async () => {
    const { ctx } = await mounted()
    await expect(ctx.mcpInventory.setEnabled({ name: 'no-such-server', enabled: false }))
      .rejects.toThrow('unknown MCP server')
  })
})
