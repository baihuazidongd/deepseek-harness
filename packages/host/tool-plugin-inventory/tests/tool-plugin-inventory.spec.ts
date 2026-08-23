import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { provideUserPatchPaths } from '@deepseek-ai/dsh-user-patches'
import PluginInventoryGateway from '@deepseek-ai/dsh-host-plugin-inventory'
import * as toolPluginInventory from '../src/index.ts'

const contexts: Context[] = []
const dirs: string[] = []
const signal = new AbortController().signal

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function harness(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(Loader)
  ctx.loader.builtins.active = () => {}
  await ctx.plugin(PluginInventoryGateway)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(toolPluginInventory, {})
  return ctx
}

/** Execute the registered plugin_inventory tool once. */
async function execute(ctx: Context, args: unknown): Promise<ToolExecutionResult> {
  return await ctx.tools.execute({
    signal,
    callId: CallId(`call-${Math.random()}`),
    name: 'plugin_inventory',
    arguments: args,
  })
}

describe('plugin_inventory tool', () => {
  it('registers with the model-facing usage facts in its description', async () => {
    const ctx = await harness()
    const description: unknown = ctx.tools.get('plugin_inventory')?.description
    expect(description).toContain('mirror first')
    expect(description).toContain('dsh mirror create <profile>-mirror --from <profile>')
    expect(description).toContain('- insert:')
    expect(description).toContain('dsh plugin --profile <profile>-mirror add <package>')
    expect(description).toContain('dsh mirror launch <profile>-mirror')
    expect(description).toContain('dsh mirror discard')
    expect(description).toContain('wait for approval')
  })

  it('lists current Loader entries', async () => {
    const ctx = await harness()
    const dir = await mkdtemp(join(tmpdir(), 'tool-plugin-inventory-'))
    dirs.push(dir)
    provideUserPatchPaths(ctx, {
      profilePatchPath: join(dir, 'cordis.patch.yml'),
      homePatchPath: join(dir, 'home.yml'),
    })
    const activeId = await ctx.loader.create({ name: 'cordis:active' })
    const disabledId = await ctx.loader.create({ name: 'cordis:not-installed', disabled: true })

    const result = await execute(ctx, { operation: 'list' })
    expect(result.isError).toBe(false)
    if (result.isError) return
    const entries = (result.value as { entries: { entryId: string }[] }).entries
    expect(entries).toHaveLength(2)
    expect(entries.find(entry => entry.entryId === activeId)).toMatchObject({
      moduleName: 'cordis:active',
      enabled: true,
      fiberPhase: 'active',
    })
    expect(entries.find(entry => entry.entryId === disabledId)).toMatchObject({
      enabled: false,
      fiberPhase: null,
    })
  })

  it('flips one entry through set_enabled and returns the refreshed inventory', async () => {
    const ctx = await harness()
    const dir = await mkdtemp(join(tmpdir(), 'tool-plugin-inventory-'))
    dirs.push(dir)
    provideUserPatchPaths(ctx, {
      profilePatchPath: join(dir, 'cordis.patch.yml'),
      homePatchPath: join(dir, 'home.yml'),
    })
    const activeId = await ctx.loader.create({ name: 'cordis:active' })

    const result = await execute(ctx, { operation: 'set_enabled', entryId: activeId, enabled: false })
    expect(result.isError).toBe(false)
    if (result.isError) return
    const entries = (result.value as { entries: { entryId: string; enabled: boolean }[] }).entries
    expect(entries.find(entry => entry.entryId === activeId)?.enabled).toBe(false)
  })

  it('rejects set_enabled without entryId or enabled', async () => {
    const ctx = await harness()
    const missingBoth = await execute(ctx, { operation: 'set_enabled' })
    expect(missingBoth.isError).toBe(true)
    const missingEnabled = await execute(ctx, { operation: 'set_enabled', entryId: 'whatever' })
    expect(missingEnabled.isError).toBe(true)
  })

  it('rejects an unknown operation', async () => {
    const ctx = await harness()
    const result = await execute(ctx, { operation: 'nuke' })
    expect(result.isError).toBe(true)
  })

  it('presents the call view for both operations', async () => {
    const ctx = await harness()
    const tool = ctx.tools.get('plugin_inventory')
    if (tool?.presentCall === undefined) throw new Error('plugin_inventory must present its calls')
    expect(tool.presentCall({ operation: 'list' })).toMatchObject({
      card: 'generic',
      title: 'List plugins',
      kind: 'other',
    })
    expect(tool.presentCall({ operation: 'set_enabled', entryId: 'abc', enabled: false })).toMatchObject({
      card: 'generic',
      title: 'Disable plugin abc',
    })
    expect(tool.presentCall({ operation: 'set_enabled', entryId: 'abc', enabled: true })).toMatchObject({
      title: 'Enable plugin abc',
    })
    expect(tool.presentCall({ operation: 'set_enabled', enabled: true })).toMatchObject({
      title: 'Enable plugin',
    })
  })
})
