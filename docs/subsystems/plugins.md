# Plugin inventory

English | [中文](plugins.zh.md)

The plugin inventory projects the live Cordis Loader tree to trusted surfaces and persists enablement edits: [dsh-host-plugin-inventory](../../packages/host/plugin-inventory) (`ctx.pluginInventory`) returns every non-group Loader entry with its package classification and declared facts, and writes one entry's enablement into the booted profile's user patch layer so a flip survives relaunches. Browser surfaces ([dsh-client-ui-mods](../../packages/client/ui-mods), [dsh-client-ui-settings-plugin-inventory](../../packages/client/ui-settings-plugin-inventory)) and the model-facing [`plugin_inventory` tool](../../packages/host/tool-plugin-inventory) share one instance — the former through the [api-remotes](../../packages/api/remotes) assembly, the latter through the same-process Context merge.

Source: [`packages/host/plugin-inventory/src/types.ts`](../../packages/host/plugin-inventory/src/types.ts)

## Usage

Open the 插件 (plugins) page from the sidebar foot to manage entry enablement: the panel lists every non-group Loader entry with a root-Fiber status dot and a switch, filterable by status (all/enabled/disabled) and source (all/native plugins/libraries) and searchable by module name or entry id. Flipping a switch hot-applies immediately — no restart — and persists an explicit row in the booted profile's user patch layer, so the state survives relaunches. To add a plugin, install it in a disposable mirror first: `dsh mirror create <profile>-mirror --from <profile>`, `dsh plugin --profile <profile>-mirror add <package>`, then `dsh mirror launch <profile>-mirror` boots it on a free port and prints its URL once it answers. Verify the plugin on the mirror, and only then repeat the install on the live profile; tear the mirror down with `dsh mirror stop` and `dsh mirror discard`. The model-facing [`plugin_inventory` tool](../../packages/host/tool-plugin-inventory) exposes the same `list` and `set_enabled` operations to the agent.

## The entry projection

```ts type-equiv
/** Stable Loader-tree identity of one configured plugin entry. */
type PluginEntryId = Branded<'PluginEntryId'>
```

```ts type-equiv
/** Lifecycle state of an entry's root Fiber, or null when it has no live root Fiber. */
type PluginFiberPhase =
  | 'pending'
  | 'loading'
  | 'active'
  | 'failed'
  | 'unloading'
  | null
```

```ts type-equiv
/**
 * Where an entry's package comes from: an installation-owned bundle
 * (`native`) or a package the user installed into the profile (`library`).
 * `null` when the surface provided no user-layer context, so the caller
 * cannot classify.
 */
type PluginEntrySource = 'native' | 'library' | null
```

```ts type-equiv
/** One non-group Loader entry exposed to trusted clients. */
interface PluginInventoryEntry {
  readonly entryId: PluginEntryId
  /** Exact module specifier imported by the Loader entry. */
  readonly moduleName: string
  /** Effective Loader enablement, including disabled ancestor groups. */
  readonly enabled: boolean
  readonly fiberPhase: PluginFiberPhase
  /**
   * Package origin classification; requires the launcher's user-layer fact,
   * otherwise null.
   */
  readonly source: PluginEntrySource
  /** Declared package description, or null when the package resolves but declares none. */
  readonly description: string | null
  /** Declared package version, or null when the package resolves but declares none. */
  readonly version: string | null
}
```

`fiberPhase` maps the entry's root Fiber state through Cordis's own plugin/status events — the Loader stays the sole lifecycle authority, and the inventory owns no cache or history. `source` classifies the entry's package by the profile manifest's `dependencies` record (`library`) versus installation-owned rows (`native`); `description` and `version` probe the package's physical manifest along the require lookup paths anchored at the profile. The snapshot is point-in-time: a missing root Fiber reports `null` regardless of why, and no failure detail is projected.

## The snapshot and the enablement write

```ts type-equiv
/** Point-in-time inventory returned by the plugin inventory Remote. */
interface PluginInventorySnapshot {
  readonly entries: readonly PluginInventoryEntry[]
}
```

```ts type-equiv
/** One enablement write against the current Loader tree. */
interface PluginInventorySetEnabledRequest {
  /** The Loader-tree entry id whose enablement changes. */
  readonly entryId: PluginEntryId
  /** The desired effective enablement. */
  readonly enabled: boolean
}
```

`setEnabled` persists an explicit `{ id, disabled }` row into the booted profile's user patch layer and applies the same state to the live tree, returning the refreshed snapshot. The row's layer precedence and the write's preconditions live in the [Service Definition README](../../packages/host/plugin-inventory/README.md); the probing cost decision is pinned in its [Agent Note](../../.agents/notes/implemented/bug-fix/2026-08-22-plugin-inventory-manifest-probing.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxplugininventory--plugininventorygateway"></a>

### `ctx.pluginInventory` — `PluginInventoryGateway`

Remote-only service exposing the Loader's current non-group entry state.

```ts cordis-catalog
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
@Remote('list') list(): PluginInventorySnapshot

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
@Remote('setEnabled') async setEnabled(request: PluginInventorySetEnabledRequest): Promise<PluginInventorySnapshot>
```

Source: [`packages/host/plugin-inventory/src/index.ts:120`](../../packages/host/plugin-inventory/src/index.ts)
<!-- END GENERATED cordis-surface -->
