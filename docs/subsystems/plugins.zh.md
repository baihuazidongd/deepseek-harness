# 插件清单

[English](plugins.md) | 中文

插件清单把活的 Cordis Loader 树投影给受信表面，并持久化启用状态编辑：[dsh-host-plugin-inventory](../../packages/host/plugin-inventory)（`ctx.pluginInventory`）返回全部非 group 的 Loader 条目（含包分类与声明事实），并把一个条目的启用状态写入本次启动 profile 的用户 patch 层，让翻转在重启后仍然有效。浏览器表面（[dsh-client-ui-mods](../../packages/client/ui-mods)、[dsh-client-ui-settings-plugin-inventory](../../packages/client/ui-settings-plugin-inventory)）与模型可见的 [`plugin_inventory` 工具](../../packages/host/tool-plugin-inventory) 共享同一实例 —— 前者经 [api-remotes](../../packages/api/remotes) 组合，后者经同进程 Context merge。

Source: [`packages/host/plugin-inventory/src/types.ts`](../../packages/host/plugin-inventory/src/types.ts)

## 用法

从侧边栏底部打开「插件」页管理条目启用状态：面板列出每个非 group 的 Loader 条目，带根 Fiber 状态点与开关，可按状态（全部/已启用/已禁用）与来源（全部/原生插件/库）筛选，并按模块名或条目 id 搜索。翻转开关立即热生效 —— 无需重启 —— 并把一条显式行持久化到本次启动 profile 的用户 patch 层，重启后仍然有效。要新增插件，先装进一次性镜像：`dsh mirror create <profile>-mirror --from <profile>`、`dsh plugin --profile <profile>-mirror add <package>`，再 `dsh mirror launch <profile>-mirror` 在空闲端口启动它并在就绪后打印 URL。在镜像上验证插件，确认后才在正式 profile 上重复安装；用 `dsh mirror stop` 与 `dsh mirror discard` 拆除镜像。模型可见的 [`plugin_inventory` 工具](../../packages/host/tool-plugin-inventory) 向 agent 暴露同样的 `list` 与 `set_enabled` 操作。

## 条目投影

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

`fiberPhase` 通过 Cordis 自己的 plugin/status 事件映射条目根 Fiber 的状态 —— Loader 仍是唯一的生命周期权威，清单不拥有缓存或历史。`source` 按 profile 清单的 `dependencies` 记录（`library`）与安装自带的行（`native`）给条目包分类；`description` 与 `version` 沿以 profile 为锚点的 require 查找路径探测包的物理 manifest。快照只表示调用当下：根 Fiber 缺失时一律报告 `null`，不区分原因，也不投影失败详情。

## 快照与启用写入

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

`setEnabled` 把一条显式 `{ id, disabled }` 行持久化到本次启动 profile 的用户 patch 层，并把同一状态应用到运行中的树，返回刷新后的快照。写入行的层优先级与前置条件见 [Service Definition README](../../packages/host/plugin-inventory/README.md)；探测成本的决策钉在其 [Agent Note](../../.agents/notes/implemented/bug-fix/2026-08-22-plugin-inventory-manifest-probing.md)。

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
