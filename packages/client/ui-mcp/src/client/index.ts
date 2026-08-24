/** The MCP-page browser half: a sidebar-foot trigger and its full-viewport panel. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the frame's SlotMap merge (sidebar.footer.action).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { McpFooterAction, type McpInjected } from './McpFooterAction.tsx'
import { en, zh, type McpLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The MCP page's copy. */
    mcp: McpLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'mcp'

/** Required services: the slot registry, the locale, and the MCP inventory Remote. */
export const inject = ['slots', 'locale', 'remote', 'remote.mcpInventory']

/**
 * Register the `mcp` dictionaries and the sidebar-foot management panel.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-mcp: dictionaries')

  const t = ctx.locale.bind(NS)
  const injected = (): McpInjected => ({
    list: async () => {
      const result = await ctx.remote.mcpInventory.list()
      if (!result.ok) throw new Error(`mcpInventory.list failed: ${result.error.code}: ${result.error.message}`)
      return result.value
    },
    setEnabled: async (request) => {
      const result = await ctx.remote.mcpInventory.setEnabled(request)
      if (!result.ok) throw new Error(`mcpInventory.setEnabled failed: ${result.error.code}: ${result.error.message}`)
      return result.value
    },
  })

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'mcp',
    order: 2,
    label: () => t('trigger'),
    locale: NS,
    inject: injected,
  }, McpFooterAction))
}
