/** 插件 page registered into the sidebar foot beside Settings. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.footer.action'
// entry) into this program so PropsRuntime resolves.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import {
  ModsFooterAction,
  type ModsInjected,
} from './ModsFooterAction.tsx'
import { en, zh, type ModsLocaleKey } from './locales.ts'

export type { ModsFooterActionProps, ModsInjected } from './ModsFooterAction.tsx'
export type { ModsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 插件 management page copy. */
    'mods': ModsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'mods'

/** Services required by the footer-action registration and generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.pluginInventory']

/** Contribute the 插件 trigger (and its management panel) to the sidebar foot. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-mods: dictionaries')

  const t = ctx.locale.bind(NS)
  const injected = (): ModsInjected => ({
    list: async () => {
      const result = await ctx.remote.pluginInventory.list()
      if (!result.ok) {
        throw new Error(`pluginInventory.list failed: ${result.error.code}: ${result.error.message}`)
      }
      return result.value
    },
    setEnabled: async (request) => {
      const result = await ctx.remote.pluginInventory.setEnabled(request)
      if (!result.ok) {
        throw new Error(`pluginInventory.setEnabled failed: ${result.error.code}: ${result.error.message}`)
      }
      return result.value
    },
  })

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'mods',
    order: 0,
    label: () => t('trigger'),
    locale: NS,
    inject: injected,
  }, ModsFooterAction))
}
