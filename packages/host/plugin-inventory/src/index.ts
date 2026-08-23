/** Remote projection and enablement writes for the current Cordis Loader plugin entries. */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { Context, FiberState } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { upsertUserPatchRow } from '@deepseek-ai/dsh-user-patches'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import type {
  PluginEntryId,
  PluginEntrySource,
  PluginFiberPhase,
  PluginInventoryEntry,
  PluginInventorySetEnabledRequest,
  PluginInventorySnapshot,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    pluginInventory: PluginInventoryGateway
  }
}

/** Brand an existing Loader-tree entry id at the owning boundary. */
function pluginEntryId(value: string): PluginEntryId {
  return value as PluginEntryId
}

/**
 * The user-added package names of one profile: the `dependencies` of the
 * profile manifest. That record is written only by `dsh plugin` installs, so
 * it holds every package the user put into the profile — plain libraries and
 * user-installed bundles alike — while installation-owned template bundles
 * never appear in it.
 * @param profileDir - the booted profile's directory.
 * @returns the library names, or undefined when the profile has no manifest.
 * @throws when a present manifest is unreadable or not a JSON object.
 */
function readProfileLibraryNames(profileDir: string): Set<string> | undefined {
  let manifest: unknown
  try {
    manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return undefined
    throw new Error(`pluginInventory: failed to read the profile manifest ${join(profileDir, 'package.json')}: ${String(error)}`)
  }
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    throw new Error(`pluginInventory: the profile manifest ${join(profileDir, 'package.json')} must be a JSON object`)
  }
  const dependencies = (manifest as { dependencies?: unknown }).dependencies
  if (typeof dependencies !== 'object' || dependencies === null) return new Set()
  return new Set(Object.keys(dependencies))
}

/** Declared package facts resolved from the package's own package.json. */
interface PackageMetadata {
  readonly description: string | null
  readonly version: string | null
}

/**
 * Resolve one entry's package manifest by probing the require lookup paths
 * anchored at the profile manifest — the parent walk that reaches both the
 * profile's own `node_modules` and the loader's flat `profiles/node_modules`
 * fallback, so installation-owned and user-installed packages both resolve.
 * Probing the lookup paths instead of calling `require.resolve` costs a few
 * `existsSync` checks per entry: the full resolver walks TypeScript extension
 * candidates per directory, which under the tsx source launch costs hundreds
 * of milliseconds per entry and froze `list()` for tens of seconds over the
 * whole Loader tree. Probing reads the physical manifest, so it also does not
 * require the package to export `./package.json`. A name no search path
 * holds (`cordis:` builtins, subpath specifiers, missing packages) yields
 * null; a manifest that exists but cannot be read or parsed still throws.
 * @param moduleName - the Loader entry's module specifier.
 * @param profileDir - the booted profile's directory.
 * @returns the declared description and version (either may be null), or null when no search path holds a manifest.
 */
function readPackageMetadata(moduleName: string, profileDir: string): PackageMetadata | null {
  const require = createRequire(join(profileDir, 'package.json'))
  // resolve.paths returns null only for core-module specifiers, which no
  // filesystem probe could match anyway.
  for (const searchPath of require.resolve.paths(moduleName) ?? []) {
    const manifestPath = join(searchPath, moduleName, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { description?: unknown; version?: unknown }
    return {
      description: typeof manifest.description === 'string' ? manifest.description : null,
      version: typeof manifest.version === 'string' ? manifest.version : null,
    }
  }
  return null
}

/** Runtime mirror: FiberState is a cross-package const enum. */
const FIBER_STATE = {
  PENDING: 0 as FiberState.PENDING,
  LOADING: 1 as FiberState.LOADING,
  ACTIVE: 2 as FiberState.ACTIVE,
  FAILED: 3 as FiberState.FAILED,
  DISPOSED: 4 as FiberState.DISPOSED,
  UNLOADING: 5 as FiberState.UNLOADING,
} as const

/** Complete public projection of Cordis Fiber states. */
const FIBER_PHASE = {
  [FIBER_STATE.PENDING]: 'pending',
  [FIBER_STATE.LOADING]: 'loading',
  [FIBER_STATE.ACTIVE]: 'active',
  [FIBER_STATE.FAILED]: 'failed',
  [FIBER_STATE.DISPOSED]: null,
  [FIBER_STATE.UNLOADING]: 'unloading',
} as const satisfies Record<FiberState, PluginFiberPhase>

/** Remote-only service exposing the Loader's current non-group entry state. */
export class PluginInventoryGateway extends TypertRemoteService {
  static inject = ['loader']

  constructor(ctx: Context) {
    super(ctx, 'pluginInventory')
  }

  /**
   * Read the Loader directly on every call. Cordis's internal plugin/status
   * events already maintain Entry.fiber and Fiber.state, so a second cache
   * would only add another lifecycle truth to keep synchronized. Each entry
   * is enriched with its package classification and, when the package
   * resolves, its declared description and version; without the launcher's
   * user-layer fact the classification is null and metadata stays null.
   * @returns Current non-group Loader entries in Loader order.
   * @throws when the profile manifest or a resolved package manifest is present but unreadable.
   */
  @Remote('list')
  list(): PluginInventorySnapshot {
    const paths = this.ctx.userPatchPaths
    const profileDir = paths === undefined ? undefined : dirname(paths.profilePatchPath)
    const libraryNames = profileDir === undefined ? undefined : readProfileLibraryNames(profileDir)
    const entries: PluginInventoryEntry[] = []
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.group) continue
      const moduleName = entry.options.name
      const source: PluginEntrySource = libraryNames === undefined
        ? null
        : libraryNames.has(moduleName) ? 'library' : 'native'
      const metadata = profileDir === undefined ? null : readPackageMetadata(moduleName, profileDir)
      entries.push({
        entryId: pluginEntryId(entry.id),
        moduleName,
        enabled: !entry.disabled,
        fiberPhase: entry.fiber === undefined ? null : FIBER_PHASE[entry.fiber.state],
        source,
        description: metadata?.description ?? null,
        version: metadata?.version ?? null,
      })
    }
    return { entries }
  }

  /**
   * Persist one entry's enablement into the booted profile's user patch layer
   * and apply it to the live Loader tree. The persisted row is explicit —
   * `{ id, disabled }`, the same semantics as `loader.update` — so a later
   * bundle default never silently reclaims the entry; the boot-time patch
   * watcher re-applies the written layer to the same state. The home-level
   * layer and `--patch` overlays still outrank the written row, matching the
   * composition order the surface booted with.
   * @param request - the entry id and the desired enablement.
   * @returns the refreshed inventory snapshot.
   * @throws when the surface provided no user patch paths, the entry id is
   * unknown to the Loader tree, or the patch layer rejects the write.
   */
  @Remote('setEnabled')
  async setEnabled(request: PluginInventorySetEnabledRequest): Promise<PluginInventorySnapshot> {
    const paths = this.ctx.userPatchPaths
    if (paths === undefined) {
      throw new Error('pluginInventory.setEnabled: this surface provided no user patch paths; enablement writes are unavailable')
    }
    const entry = [...this.ctx.loader.entries()].find(candidate => candidate.id === request.entryId)
    if (entry === undefined) {
      throw new Error(`pluginInventory.setEnabled: unknown loader entry id ${JSON.stringify(request.entryId)}`)
    }
    const disabled = !request.enabled
    // Persist by the entry's composition id (`entry.options.id`), not its
    // qualified runtime id (`entry.id`). Inside an include subtree the Loader
    // exposes `include:<id>` as the runtime id, but the boot-time patch
    // application indexes rows by the unqualified id the config file declares —
    // a `{ id: 'include:<id>' }` row would match nothing and be skipped, so
    // the disable would vanish on the next boot. The live update still uses
    // the qualified id, which is what `loader.update` resolves.
    await upsertUserPatchRow('dsh', paths.profilePatchPath, { id: entry.options.id, disabled })
    await this.ctx.loader.update(request.entryId, { disabled })
    return this.list()
  }
}

export default PluginInventoryGateway
