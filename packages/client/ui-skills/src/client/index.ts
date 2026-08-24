/** The skills-page browser half: a sidebar-foot trigger and its full-viewport panel. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the frame's SlotMap merge (sidebar.footer.action).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { SkillsFooterAction, type SkillsInjected } from './SkillsFooterAction.tsx'
import { en, zh, type SkillsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The skills page's copy. */
    skills: SkillsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'skills'

/** Required services: the slot registry, the locale, and the skill inventory Remote. */
export const inject = ['slots', 'locale', 'remote', 'remote.skillInventory']

/**
 * Register the `skills` dictionaries and the sidebar-foot management panel.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-skills: dictionaries')

  const t = ctx.locale.bind(NS)
  const injected = (): SkillsInjected => ({
    list: async () => {
      const result = await ctx.remote.skillInventory.list()
      if (!result.ok) throw new Error(`skillInventory.list failed: ${result.error.code}: ${result.error.message}`)
      return result.value
    },
    setEnabled: async (request) => {
      const result = await ctx.remote.skillInventory.setEnabled(request)
      if (!result.ok) throw new Error(`skillInventory.setEnabled failed: ${result.error.code}: ${result.error.message}`)
      return result.value
    },
    get: async (request) => {
      const result = await ctx.remote.skillInventory.get(request)
      if (!result.ok) throw new Error(`skillInventory.get failed: ${result.error.code}: ${result.error.message}`)
      return result.value
    },
  })

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'skills',
    order: 1,
    label: () => t('trigger'),
    locale: NS,
    inject: injected,
  }, SkillsFooterAction))
}
