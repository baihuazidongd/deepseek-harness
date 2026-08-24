/**
 * Model-facing `plugin_inventory` tool over the host plugin-inventory
 * Remote: list the configured Loader entries, flip one entry's enablement,
 * and instruct how to install a new plugin into the booted profile.
 * @module @deepseek-ai/dsh-tool-plugin-inventory
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView } from '@deepseek-ai/dsh-tools'
// Type-only: brings the Context.pluginInventory merge and the entry types.
import type {} from '@deepseek-ai/dsh-host-plugin-inventory'
import type { PluginEntryId, PluginInventorySnapshot } from '@deepseek-ai/dsh-host-plugin-inventory/types'

export const name = 'tool-plugin-inventory'
export const inject = ['tools', 'pluginInventory']

/** Model-facing plugin-inventory tool configuration. */
export interface Config {}

/** Schemastery configuration for the plugin-inventory tool consumer. */
export const Config: z<Config> = z.object({})

const DESCRIPTION =
  'Inspect and manage the plugins of this DeepSeek Harness deployment. '
  + 'Operation `list` returns every configured plugin entry: its Loader entry id, module name, '
  + 'enabled flag, lifecycle phase (`pending` | `loading` | `active` | `failed` | `unloading` | '
  + '`null` when it has no live fiber), source (`native` = an official plugin the installation '
  + 'shipped, `library` = a plugin the user added later via `dsh plugin add`; the value is '
  + 'derived from the profile manifest, never chosen by the model), and the declared package '
  + 'description/version when available. Operation `set_enabled` flips one entry by entry id: '
  + 'the change hot-applies immediately (no restart) and persists into the booted profile\'s '
  + 'user patch layer (cordis.patch.yml), so it survives relaunches. '
  + 'Installing a NEW plugin goes through a mirror first: `dsh mirror create <profile>-mirror '
  + '--from <profile>` copies the live composition into a disposable profile, `dsh plugin '
  + '--profile <profile>-mirror add <package>` installs the plugin there, append an insert '
  + 'block to the MIRROR\'s cordis.patch.yml — `- insert:` with a two-space-indented '
  + '`- id: <pick-an-id>` and `name: <package>` pair (a bare top-level `{ id, name }` row '
  + 'targets an EXISTING entry and is skipped when the id is unknown) — and '
  + '`dsh mirror launch <profile>-mirror` boots it as a background web instance on a free port '
  + '(same DSH_HOME, so credentials carry over) and prints its URL once it answers. '
  + 'Verify on the mirror (its `plugin_inventory` list shows the entry `active`), share the '
  + 'mirror URL with the user, and wait for approval; only then repeat install+patch on the '
  + 'live profile (the booted profile\'s own name, e.g. `web`; ask the user when unsure) — the '
  + 'patch watcher applies it live, verify with `list` — then `dsh mirror stop` and '
  + '`dsh mirror discard` the mirror (`dsh mirror list` shows every mirror and its state). '
  + 'An entry whose phase is `failed` usually has a missing package or a plugin that threw '
  + 'during mount; disable it with `set_enabled` to restore the rest of the tree.'

/** Snapshot entry fields as the model sees them. */
type InventoryEntryView = {
  entryId: string
  moduleName: string
  enabled: boolean
  fiberPhase: PluginInventorySnapshot['entries'][number]['fiberPhase']
  source: PluginInventorySnapshot['entries'][number]['source']
  description: string | null
  version: string | null
}

/** Tool value: the refreshed inventory, whatever the operation. */
interface PluginInventoryValue {
  entries: InventoryEntryView[]
}

/** Project one snapshot into the tool's wire value. */
function toValue(snapshot: PluginInventorySnapshot): PluginInventoryValue {
  return {
    entries: snapshot.entries.map(entry => ({
      entryId: entry.entryId,
      moduleName: entry.moduleName,
      enabled: entry.enabled,
      fiberPhase: entry.fiberPhase,
      source: entry.source,
      description: entry.description,
      version: entry.version,
    })),
  }
}

/** Entry-property schema shared by list output and set_enabled output. */
const ENTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    entryId: { type: 'string', required: true, description: 'Stable Loader-tree entry id.' },
    moduleName: { type: 'string', required: true, description: 'Exact module specifier the Loader imports.' },
    enabled: { type: 'boolean', required: true, description: 'Effective enablement, including disabled ancestor groups.' },
    fiberPhase: {
      oneOf: [
        { type: 'string', enum: ['pending', 'loading', 'active', 'failed', 'unloading'] },
        { type: 'null' },
      ],
      required: true,
      description: 'Root fiber lifecycle phase; `null` when the entry has no live fiber.',
    },
    source: {
      oneOf: [
        { type: 'string', enum: ['native', 'library'] },
        { type: 'null' },
      ],
      required: true,
      description: 'Package origin: `native` = an official plugin the installation shipped, `library` = a plugin the user added later; `null` when unclassified. Derived from the profile manifest, never chosen by the model.',
    },
    description: {
      oneOf: [{ type: 'string' }, { type: 'null' }],
      required: true,
      description: 'Declared package description, or null.',
    },
    version: {
      oneOf: [{ type: 'string' }, { type: 'null' }],
      required: true,
      description: 'Declared package version, or null.',
    },
  },
} as const

/**
 * Register the `plugin_inventory` tool on `ctx.tools`, dispatching to the
 * host plugin-inventory service.
 * @param ctx - registrant context carrying the tool registry and the service.
 * @param _config - deployment config (none owned today).
 */
export function apply(ctx: Context, _config: Config): void {
  ctx.tools.register(defineTool({
    name: 'plugin_inventory',
    description: DESCRIPTION,
    parameters: {
      operation: {
        type: 'string',
        required: true,
        enum: ['list', 'set_enabled'],
        description: '`list` reads the inventory; `set_enabled` flips one entry\'s enablement.',
      },
      entryId: {
        type: 'string',
        description: 'Loader entry id from a previous `list`; required for `set_enabled`.',
      },
      enabled: {
        type: 'boolean',
        description: 'Desired enablement; required for `set_enabled`.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          entries: { type: 'array', required: true, items: ENTRY_SCHEMA },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Plugin inventory: ${value.entries.length} entries `
          + `(${value.entries.filter(entry => entry.enabled).length} enabled).`,
      }],
    },
    execute(args) {
      if (args.operation === 'list') {
        return Promise.resolve(toValue(ctx.pluginInventory.list()))
      }
      if (typeof args.entryId !== 'string' || typeof args.enabled !== 'boolean') {
        throw new Error('plugin_inventory: set_enabled requires `entryId` and `enabled`')
      }
      return ctx.pluginInventory
        .setEnabled({ entryId: args.entryId as PluginEntryId, enabled: args.enabled })
        .then(toValue)
    },
    presentCall: (args): GenericCallView => ({
      card: 'generic',
      title: args.operation === 'set_enabled'
        ? `${args.enabled ? 'Enable' : 'Disable'} plugin ${args.entryId ?? ''}`.trim()
        : 'List plugins',
      kind: 'other',
      rawInput: args,
    }),
  }))
}
