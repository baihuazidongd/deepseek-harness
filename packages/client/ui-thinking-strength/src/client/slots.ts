/**
 * ThinkingStrengthButton's injected face. The target 'conversation.input.right'
 * slot is declared (children table) and typed by ui-conversation's composer-bar
 * entry; this package only contributes the single entry, so no SlotMap merge
 * lives here. The shared model directory store is the reserved `hooks`
 * compartment source (bound to `useDirectory` by the render machinery), not a
 * plain member — components read it through the framework hook.
 */
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'

/** Injected business face of the composer thinking-strength button. */
export interface ThinkingStrengthInjected {
  /** Whether this session supports Agent-bound model inspection and selection. */
  available: boolean
  /** Refresh the session's shared directory (fire-and-forget; errors land on the store). */
  load: () => void
  /**
   * Select a reasoning effort for the current provider/model route.
   * @param selection - complete selection (provider/model plus optional effort).
   * @returns whether the host accepted the selection.
   */
  select: (selection: ModelSelection) => Promise<boolean>
  /** The directory's latest error text, read at call time for rejected-selection copy. */
  error: () => string | null
  /** Reserved hooks compartment: the shared directory store, bound to `useDirectory`. */
  hooks: {
    directory: SnapshotStore<ModelDirectoryState>
  }
}
