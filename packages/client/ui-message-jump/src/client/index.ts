/**
 * Message-jump plugin, browser half — a single session-header control in
 * `conversation.session.header.actions` that jumps the conversation scroll
 * between the user's own sent messages. It ships as a user-installed library
 * plugin (installed into the profile with `dsh plugin add`, never a `web-app`
 * bundle row), so the plugin manager classifies it as `library`.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-conversation SlotMap merge (the header.actions entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { MessageJumpButton } from './MessageJumpButton.tsx'
import { en, zh, type MessageJumpKey } from './locales.ts'

export type { MessageJumpProps } from './MessageJumpButton.tsx'
export type { MessageJumpKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The message-jump header control's copy. */
    'message-jump': MessageJumpKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'message-jump'

/** Services required by the slot contribution and the dictionaries. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the dictionaries, then the session-header
 * control into ui-conversation's additive action slot.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-message-jump: dictionaries')

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'message-jump',
    order: 0,
    locale: NS,
  }, MessageJumpButton))
}
