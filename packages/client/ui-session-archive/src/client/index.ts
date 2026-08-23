/** Archived-sessions recovery page registered into Web Settings. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { ArchiveSection, type ArchiveSectionInjected } from './ArchiveSection.tsx'
import { en, zh, type SessionArchiveLocaleKey } from './locales.ts'

export type { ArchiveSectionInjected, ArchiveSectionProps } from './ArchiveSection.tsx'
export type { SessionArchiveLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Archived-sessions recovery copy. */
    'settings.sessionArchive': SessionArchiveLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.sessionArchive'

/** Services required by the Settings registration: the two list feeds and their write/open actions. */
export const inject = ['slots', 'locale', 'sessions', 'workspaces']

/** Contribute the archived-sessions recovery section to Web Settings. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-session-archive: dictionaries')

  const t = ctx.locale.bind(NS)
  // Hook bindings are cached per source: bind once at registration, never per render.
  const useSessions: SnapshotSelectorHook<SessionListState> = bindSnapshotSelector(ctx.sessions.list)
  const useWorkspaces = bindSnapshotSelector(ctx.workspaces.list)
  const injected = (): ArchiveSectionInjected => ({
    useSessions,
    useWorkspaces,
    unarchive: async (sessionId: SessionId): Promise<void> => {
      await ctx.workspaces.unarchiveSession(sessionId)
    },
    open: (sessionId: SessionId): void => { ctx.sessions.open(sessionId) },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'session-archive',
    order: 30,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, ArchiveSection))
}
