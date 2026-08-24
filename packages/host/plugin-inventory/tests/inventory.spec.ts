import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { provideUserPatchPaths } from '@deepseek-ai/dsh-user-patches'
import PluginInventoryGateway from '../src/index.ts'
import type { PluginEntryId } from '../src/index.ts'

const contexts: Context[] = []
const dirs: string[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

const activePlugin: Plugin.Function = () => {}
const pendingPlugin: Plugin.Object = {
  inject: ['neverReady'],
  apply() {},
}

async function harness(): Promise<{
  ctx: Context
  inventory: PluginInventoryGateway
}> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Loader)
  ctx.loader.builtins.active = activePlugin
  ctx.loader.builtins.pending = pendingPlugin
  ctx.loader.builtins.include = Include
  await ctx.plugin(PluginInventoryGateway)
  const inventory = ctx.get('pluginInventory') as PluginInventoryGateway
  return { ctx, inventory }
}

/** A fresh profile-shaped temp directory: manifest plus resolvable fixture packages. */
async function profileDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'plugin-inventory-'))
  dirs.push(dir)
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    dependencies: {
      '@fixture/user-lib': 'workspace:^',
      '@fixture/user-bundle': 'workspace:^',
    },
    // A user-installed bundle (dependency + layer) beside a template bundle
    // (layer only, never a dependency).
    'dsh.profile.bundles': ['@fixture/user-bundle', '@deepseek-ai/dsh-template'],
  }))
  await mkdir(join(dir, 'node_modules', '@fixture', 'user-lib'), { recursive: true })
  await writeFile(join(dir, 'node_modules', '@fixture', 'user-lib', 'package.json'), JSON.stringify({
    name: '@fixture/user-lib',
    version: '0.4.2',
    description: 'A user-installed library.',
  }))
  await mkdir(join(dir, 'node_modules', '@fixture', 'user-bundle'), { recursive: true })
  await writeFile(join(dir, 'node_modules', '@fixture', 'user-bundle', 'package.json'), JSON.stringify({
    name: '@fixture/user-bundle',
    version: '1.1.0',
    description: 'A user-installed bundle.',
  }))
  await mkdir(join(dir, 'node_modules', '@fixture', 'odd-lib'), { recursive: true })
  await writeFile(join(dir, 'node_modules', '@fixture', 'odd-lib', 'package.json'), JSON.stringify({
    name: '@fixture/odd-lib',
    description: 5,
  }))
  await mkdir(join(dir, 'node_modules', '@fixture', 'no-export-lib'), { recursive: true })
  await writeFile(join(dir, 'node_modules', '@fixture', 'no-export-lib', 'package.json'), JSON.stringify({
    name: '@fixture/no-export-lib',
    version: '7.0.1',
    description: 'No ./package.json export.',
    exports: { '.': './lib/index.js' },
  }))
  return dir
}

describe('PluginInventoryGateway', () => {
  it('publishes one direct list method under the pluginInventory namespace', async () => {
    const { inventory } = await harness()
    expect(inventory.typertRemote).toMatchObject({
      serviceKey: 'pluginInventory',
      namespace: 'pluginInventory',
    })
    expect(remoteMethods(inventory)).toEqual([
      { method: 'list', invocation: { kind: 'direct' } },
      { method: 'setEnabled', invocation: { kind: 'direct' } },
    ])
  })

  it('projects current non-group Loader entries without enrichment context', async () => {
    const { ctx, inventory } = await harness()
    const activeId = await ctx.loader.create({ name: 'cordis:active' })
    const pendingId = await ctx.loader.create({ name: 'cordis:pending' })
    const disabledId = await ctx.loader.create({
      name: 'cordis:not-installed',
      disabled: true,
    })
    await ctx.loader.create({ name: 'cordis:active', group: true })

    const snapshot = inventory.list()
    expect(snapshot.entries).toHaveLength(3)
    expect(snapshot.entries).toEqual(expect.arrayContaining([
      {
        entryId: activeId,
        moduleName: 'cordis:active',
        enabled: true,
        fiberPhase: 'active',
        source: null,
        description: null,
        version: null,
      },
      {
        entryId: pendingId,
        moduleName: 'cordis:pending',
        enabled: true,
        fiberPhase: 'pending',
        source: null,
        description: null,
        version: null,
      },
      {
        entryId: disabledId,
        moduleName: 'cordis:not-installed',
        enabled: false,
        fiberPhase: null,
        source: null,
        description: null,
        version: null,
      },
    ]))

    await ctx.loader.update(activeId, { disabled: true })
    expect(inventory.list().entries.find(entry => entry.entryId === activeId)).toEqual({
      entryId: activeId,
      moduleName: 'cordis:active',
      enabled: false,
      fiberPhase: null,
      source: null,
      description: null,
      version: null,
    })

    await ctx.loader.remove(pendingId)
    expect(inventory.list().entries.some(entry => entry.entryId === pendingId)).toBe(false)
  })

  it('classifies entries and resolves package metadata from the profile', async () => {
    const { ctx, inventory } = await harness()
    const dir = await profileDir()
    provideUserPatchPaths(ctx, { profilePatchPath: join(dir, 'cordis.patch.yml'), homePatchPath: join(dir, 'home.yml') })
    // Bare package names import on create, so classification rides disabled
    // entries (classification is per-name, independent of enablement).
    const libraryId = await ctx.loader.create({ name: '@fixture/user-lib', disabled: true })
    const userBundleId = await ctx.loader.create({ name: '@fixture/user-bundle', disabled: true })
    const templateBundleId = await ctx.loader.create({ name: '@deepseek-ai/dsh-template', disabled: true })
    const builtinId = await ctx.loader.create({ name: 'cordis:active' })

    const snapshot = inventory.list()
    expect(snapshot.entries.find(entry => entry.entryId === libraryId)).toEqual({
      entryId: libraryId,
      moduleName: '@fixture/user-lib',
      enabled: false,
      fiberPhase: null,
      source: 'library',
      description: 'A user-installed library.',
      version: '0.4.2',
    })
    // A user-installed bundle is a profile dependency, so it classifies as a
    // library — the dependency record is what `dsh plugin` writes for
    // everything the user installed, bundle or not.
    expect(snapshot.entries.find(entry => entry.entryId === userBundleId)).toEqual({
      entryId: userBundleId,
      moduleName: '@fixture/user-bundle',
      enabled: false,
      fiberPhase: null,
      source: 'library',
      description: 'A user-installed bundle.',
      version: '1.1.0',
    })
    // A template bundle named only in dsh.profile.bundles — never a
    // dependency — stays native; its package metadata depends on ambient
    // resolution (the profile fallback or the installing tree may expose it),
    // so only the classification is asserted here.
    expect(snapshot.entries.find(entry => entry.entryId === templateBundleId)).toMatchObject({
      source: 'native',
    })
    // A native package nothing can resolve carries no metadata.
    const ghostId = await ctx.loader.create({ name: '@fixture/not-a-real-package', disabled: true })
    expect(inventory.list().entries.find(entry => entry.entryId === ghostId)).toMatchObject({
      source: 'native',
      description: null,
      version: null,
    })
    // A core-module specifier yields no lookup paths at all (resolve.paths
    // returns null); probing must treat that as no metadata, not crash.
    const coreId = await ctx.loader.create({ name: 'fs', disabled: true })
    expect(inventory.list().entries.find(entry => entry.entryId === coreId)).toMatchObject({
      source: 'native',
      description: null,
      version: null,
    })
    // Manifest probing reads the physical package.json: an exports map
    // without ./package.json still yields the declared facts.
    const noExportId = await ctx.loader.create({ name: '@fixture/no-export-lib', disabled: true })
    expect(inventory.list().entries.find(entry => entry.entryId === noExportId)).toMatchObject({
      source: 'native',
      description: 'No ./package.json export.',
      version: '7.0.1',
    })
    // A subpath entry names no package root, so it carries no metadata.
    const subpathId = await ctx.loader.create({ name: '@fixture/user-lib/subtool', disabled: true })
    expect(inventory.list().entries.find(entry => entry.entryId === subpathId)).toMatchObject({
      source: 'native',
      description: null,
      version: null,
    })
    expect(snapshot.entries.find(entry => entry.entryId === builtinId)).toMatchObject({
      source: 'native',
      description: null,
      version: null,
    })

    // A manifest without dependencies classifies everything native.
    await writeFile(join(dir, 'package.json'), JSON.stringify({ 'dsh.profile.bundles': [] }))
    expect(inventory.list().entries.every(entry => entry.source === 'native')).toBe(true)

    // Non-string and non-array bundle fields are skipped, not fatal; a
    // resolvable package with non-string declared facts reports null for
    // both.
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { '@fixture/odd-lib': 'workspace:^' },
      'dsh.profile.bundles': [7],
    }))
    const oddId = await ctx.loader.create({ name: '@fixture/odd-lib', disabled: true })
    expect(inventory.list().entries.find(entry => entry.entryId === oddId)).toMatchObject({
      source: 'library',
      description: null,
      version: null,
    })
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { '@fixture/odd-lib': 'workspace:^' },
      'dsh.profile.bundles': 'not-an-array',
    }))
    expect(inventory.list().entries.find(entry => entry.entryId === oddId)?.source).toBe('library')
  })

  it('fails loud on an unparsable or non-object profile manifest', async () => {
    const { ctx, inventory } = await harness()
    const dir = await profileDir()
    provideUserPatchPaths(ctx, { profilePatchPath: join(dir, 'cordis.patch.yml'), homePatchPath: join(dir, 'home.yml') })
    await ctx.loader.create({ name: 'cordis:active' })

    await writeFile(join(dir, 'package.json'), '{ nope')
    expect(() => inventory.list()).toThrow('failed to read the profile manifest')
    await writeFile(join(dir, 'package.json'), '[1]')
    expect(() => inventory.list()).toThrow('must be a JSON object')
  })

  it('persists an enablement write into the profile user patch layer and applies it live', async () => {
    const { ctx, inventory } = await harness()
    const dir = await mkdtemp(join(tmpdir(), 'plugin-inventory-'))
    dirs.push(dir)
    const profilePatchPath = join(dir, 'cordis.patch.yml')
    provideUserPatchPaths(ctx, { profilePatchPath, homePatchPath: join(dir, 'home.yml') })
    const activeId = await ctx.loader.create({ name: 'cordis:active' })

    const snapshot = await inventory.setEnabled({ entryId: activeId as PluginEntryId, enabled: false })
    expect(snapshot.entries.find(entry => entry.entryId === activeId)?.enabled).toBe(false)
    expect(inventory.list().entries.find(entry => entry.entryId === activeId)?.enabled).toBe(false)
    const content = await readFile(profilePatchPath, 'utf8')
    // Loader ids are random hex; an all-digit id round-trips through YAML
    // quoted, so the row's id may carry single quotes.
    expect(content).toMatch(new RegExp(`id: '?${activeId}'?`))
    expect(content).toContain('disabled: true')

    const reEnabled = await inventory.setEnabled({ entryId: activeId as PluginEntryId, enabled: true })
    expect(reEnabled.entries.find(entry => entry.entryId === activeId)?.enabled).toBe(true)
    expect(await readFile(profilePatchPath, 'utf8')).toContain('disabled: false')
  })

  it('persists a disable under the composition id, not the qualified include id', async () => {
    const { ctx, inventory } = await harness()
    const dir = await mkdtemp(join(tmpdir(), 'plugin-inventory-'))
    dirs.push(dir)
    const profilePatchPath = join(dir, 'cordis.patch.yml')
    provideUserPatchPaths(ctx, { profilePatchPath, homePatchPath: join(dir, 'home.yml') })
    // Mount a config file through the root include: its entry carries the
    // qualified runtime id `include:demo-plugin` while the composition declares
    // the unqualified `demo-plugin` the boot-time patch application indexes.
    const configPath = join(dir, 'cordis.yml')
    await writeFile(configPath, '- id: demo-plugin\n  name: cordis:active\n')
    const includeEntry = { id: 'include', name: 'cordis:include', config: { path: pathToFileURL(configPath).href } }
    await ctx.loader.create(includeEntry)
    const entry = [...ctx.loader.entries()].find(candidate => candidate.options.id === 'demo-plugin')
    if (entry === undefined) throw new Error('mounted include produced no demo-plugin entry')
    expect(entry.id).toBe('include:demo-plugin')

    const snapshot = await inventory.setEnabled({ entryId: entry.id as PluginEntryId, enabled: false })
    expect(snapshot.entries.find(candidate => candidate.entryId === entry.id)?.enabled).toBe(false)
    // The row must target `demo-plugin`; a `include:demo-plugin` row would match nothing
    // at boot and the disable would silently vanish on the next start.
    const content = await readFile(profilePatchPath, 'utf8')
    expect(content).toContain('id: demo-plugin')
    expect(content).not.toContain('include:demo-plugin')
  })

  it('rejects an enablement write for an unknown entry id', async () => {
    const { ctx, inventory } = await harness()
    const dir = await mkdtemp(join(tmpdir(), 'plugin-inventory-'))
    dirs.push(dir)
    provideUserPatchPaths(ctx, {
      profilePatchPath: join(dir, 'cordis.patch.yml'),
      homePatchPath: join(dir, 'home.yml'),
    })
    await expect(inventory.setEnabled({ entryId: 'no-such-entry' as PluginEntryId, enabled: false }))
      .rejects.toThrow('unknown loader entry id')
  })

  it('rejects an enablement write when the surface provided no user patch paths', async () => {
    const { ctx, inventory } = await harness()
    const activeId = await ctx.loader.create({ name: 'cordis:active' })
    await expect(inventory.setEnabled({ entryId: activeId as PluginEntryId, enabled: false }))
      .rejects.toThrow('provided no user patch paths')
  })
})
