/**
 * Thinking-strength plugin, browser half — a single composer tool-row button in
 * `conversation.input.right` (immediately before the primary send button) that
 * opens the current model's selectable reasoning-effort levels and submits
 * through the SAME per-session ModelDirectory as ui-model-selection's composer
 * seat and /model popup (`ctx.modelDirectories`), so the host-reported current
 * selection is the single fact every surface echoes — a switch made here is
 * what the model seat shows next. Addressed subagent sessions expose no button
 * because those Agent-bound RPCs would activate persisted history outside the
 * direct-parent continuation path.
 */
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls ui-model-selection's cordis Context merge
// (`ctx.modelDirectories`) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
// Type-only: pulls the ui-conversation SlotMap merge (the input.right entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ThinkingStrengthButton } from './ThinkingStrengthButton.tsx'
import type { ThinkingStrengthInjected } from './slots.ts'
import { en, zh, type ThinkingStrengthKey } from './locales.ts'

export type { ThinkingStrengthInjected } from './slots.ts'
export type { ThinkingStrengthKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The thinking-strength composer button's copy. */
    'thinking-strength': ThinkingStrengthKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'thinking-strength'

/** Required services for the slot contribution and the dictionaries. */
export const inject = ['locale', 'sessions', 'slots']

/**
 * Client plugin body: register the dictionaries, then the composer tool-row
 * button over the shared model directory service.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-thinking-strength: dictionaries')

  ctx.inject(['slots', 'modelDirectories'], (scope: ClientContext) => {
    const models = scope.modelDirectories
    const sessions = scope.sessions
    scope.slots.inject('conversation.input.right', () => scope.slots.register({
      name: 'conversation.input.right',
      id: 'thinking-strength',
      order: 0,
      locale: NS,
      inject: (sessionId): ThinkingStrengthInjected => {
        const directory = models.directoryFor(sessionId)
        const available = sessions.subagentAddress(sessionId) === undefined
        return {
          available,
          load: () => {
            if (available) directory.load().catch(() => { /* surfaced on the store */ })
          },
          select: (selection: ModelSelection) => available
            ? directory.select(selection).then(() => true, () => false)
            : Promise.resolve(false),
          error: () => directory.store.getSnapshot().error,
          hooks: { directory: directory.store },
        }
      },
    }, ThinkingStrengthButton))
  })
}
