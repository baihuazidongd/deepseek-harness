import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable Loader-tree identity of one configured plugin entry. */
export type PluginEntryId = Branded<'PluginEntryId'>

/** Lifecycle state of an entry's root Fiber, or null when it has no live root Fiber. */
export type PluginFiberPhase =
  | 'pending'
  | 'loading'
  | 'active'
  | 'failed'
  | 'unloading'
  | null

/**
 * Where an entry's package comes from: an installation-owned bundle
 * (`native`) or a package the user installed into the profile (`library`).
 * `null` when the surface provided no user-layer context, so the caller
 * cannot classify.
 */
export type PluginEntrySource = 'native' | 'library' | null

/** One non-group Loader entry exposed to trusted clients. */
export interface PluginInventoryEntry {
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

/** Point-in-time inventory returned by the plugin inventory Remote. */
export interface PluginInventorySnapshot {
  readonly entries: readonly PluginInventoryEntry[]
}

/** One enablement write against the current Loader tree. */
export interface PluginInventorySetEnabledRequest {
  /** The Loader-tree entry id whose enablement changes. */
  readonly entryId: PluginEntryId
  /** The desired effective enablement. */
  readonly enabled: boolean
}
