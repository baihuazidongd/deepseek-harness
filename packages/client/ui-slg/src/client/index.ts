/**
 * Live-stream room view plugin, browser half: registers the room into the
 * frame's `conversation` slot (single, session-maybe) at a shadowing
 * priority, so it replaces ui-conversation's ConversationRoot outright — the
 * whole center column renders as the room instead of the chat thread, with no
 * extra tab. The view reads live data through the framework hooks
 * (`useSession`/`useProjection`/`useSessions`) and forwards the conversation
 * verbs through the scope-addressed `conversation` service; session and
 * workspace management stays in the native left sidebar.
 */
import type { ClientContext, ISessions, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ModelDirectory, ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the frame's SlotMap merge (`conversation`, the seat we shadow).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { SlgGameView } from './SlgGameView.tsx'
import type { SlgGameViewInjected } from './SlgGameView.tsx'
import { createSlgSettingsStore } from './stores.ts'
import { en, zh, type SlgKey } from './locales.ts'

export type { SlgGameViewInjected } from './SlgGameView.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The live-stream room view's copy. */
    slg: SlgKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'slg'

/** Required services: the slot registry, the room copy, and the sessions domain for scope/binding reads. */
export const inject = ['slots', 'locale', 'sessions', 'modelDirectories']

/** Resolve the session-scoped conversation face, without failing loud on a not-yet-scoped session. */
function scopedConversation(sessions: ISessions, id: SessionId): IConversation | undefined {
  return sessions.scope(id)?.get('conversation')
}

/** Static no-model state for sessions that cannot switch models (no session / addressed subagent). */
const EMPTY_MODEL_STATE: ModelDirectoryState = {
  current: null, routable: null, groups: [], failures: [], status: 'idle', error: null,
}

/** Never-updating model directory fallback: the switcher renders nothing on it (modelAvailable false). */
const EMPTY_MODEL_DIRECTORY: SnapshotStore<ModelDirectoryState> = {
  getSnapshot: () => EMPTY_MODEL_STATE,
  subscribe: () => () => {},
  update: () => { throw new Error('model directory unavailable') },
  set: () => { throw new Error('model directory unavailable') },
}

/**
 * Client plugin body: register the `slg` dictionaries and the live-room view,
 * shadowing the default conversation surface.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const sessions = ctx.sessions
  const modelDirectories = ctx.modelDirectories
  // One handle per fiber: the room's settings survive remounts and reloads.
  const settingsStore = createSlgSettingsStore()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-slg: dictionaries')

  // `priority: -1` shadows ui-conversation's ConversationRoot (priority 0): a
  // single slot renders its lowest live entry, so the room replaces the whole
  // conversation surface — header, tabs, chat body, and composer.
  ctx.slots.inject('conversation', () => ctx.slots.register({
    name: 'conversation',
    priority: -1,
    locale: NS,
    store: settingsStore,
    inject: (sessionId: SessionId | undefined): SlgGameViewInjected => {
      const conversation = sessionId === undefined ? undefined : scopedConversation(sessions, sessionId)
      // Model switching rides the shared ui-model-selection directory; a
      // missing scope or an addressed subagent session degrades to the
      // no-switching face (the switcher button simply does not render).
      let directory: ModelDirectory | undefined
      if (sessionId !== undefined && sessions.subagentAddress(sessionId) === undefined) {
        try {
          directory = modelDirectories.directoryFor(sessionId)
        } catch {
          directory = undefined
        }
      }
      const modelAvailable = directory !== undefined
      return {
        send: (text) => {
          if (conversation === undefined) return Promise.reject(new Error('ui-slg: conversation service unavailable'))
          return conversation.send(text)
        },
        stop: () => {
          if (conversation === undefined) return Promise.reject(new Error('ui-slg: conversation service unavailable'))
          return conversation.cancel()
        },
        loadOlder: () => {
          if (conversation === undefined) return Promise.reject(new Error('ui-slg: conversation service unavailable'))
          return conversation.loadOlder()
        },
        modelAvailable,
        modelDirectory: directory?.store ?? EMPTY_MODEL_DIRECTORY,
        loadModels: () => { directory?.load().catch(() => { /* surfaced on the store */ }) },
        selectModel: selection => directory === undefined
          ? Promise.resolve(false)
          : directory.select(selection).then(() => true, () => false),
      }
    },
  }, SlgGameView))
}
