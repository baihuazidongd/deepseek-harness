# Agent Note: Room-native plan chip, context ring, and slash menu

Status: implemented

English | [中文](2026-08-23-slg-room-native-controls.zh.md)

## Problem

The live-stream room shadows the resident composer, and with it the composer's auxiliary controls: the plan-mode exit chip, the context-occupancy meter, and slash-command discovery. The [room note](2026-08-16-slg-game-view.md) already re-surfaces the composer's blocking interactions (permission, approvals, questions, queue); three always-available affordances were still missing, so a room-only user could not leave plan mode, could not see how full the context is, and could not discover what commands the session's agent accepts.

## Decision

Extend `SlgGameViewInjected` with three verbs — `exitPlanMode`, `listCommands`, `runCommand` — and render three input-line extras in `InputExtras.tsx`, each fed by a standard projection seat so it renders nothing while its data source is absent:

- **Plan chip**: reads `useProjection('plan')`; the effective target is the host fold `pending ? !active : active` (no client optimism). Clicking exits through the bound session's command verb `/plan off`; admission folds to `null` or an English failure line (error-surface policy), and the button disables while leaving.
- **Context ring**: a 14px ring beside the send button fed by `contextPressure`/`contextBreakdown`. The occupancy math replicates ui-conversation's `contextOccupancy` (`projectedTokens ?? pressureTokens` over `contextWindow`, integer rounding, 100% clamp) because cross-package imports of another plugin's symbols are forbidden; the click-open panel shows the token figures plus the composition rows, proportioned against the provider-exact percent like the native meter.
- **Slash menu**: a `/` trigger pulls `remote.commands.list(sessionId)` once per open (a failed pull resolves empty). A descriptor advertising an input hint inserts `/name ` into the draft; a bare one executes through the session command verb. Rows filter by name locally.

The plugin's `inject` declaration gains `remote` and `remote.commands`; `listCommands` degrades to an empty list without a session or for an addressed subagent, mirroring the runtime directory's own subagent guard.

## Alternatives considered

**Reuse ui-conversation's `ContextMeter` / `StatsLine` helpers.** Export discipline forbids importing another plugin's internals; the shared math is a few lines, replicated with a comment pointing at the original.

**Reuse `CommandUiRuntime`'s popup machinery.** Its popups are welded to the input machine's slash pipeline (consume-token events, contributions/decorations, anchored overlay). The room's plain input only needs catalog discovery plus execute-or-insert, and the runtime service's extra surface would pull in ui-input-trigger for no behavioral gain.

**Track plan mode in client state.** The projection is folded from logged host state including the pending transition; optimistic client state would disagree with the chain mid-toggle.

## Consequences

- All three extras disappear on deployments without token-meter, plan-mode, or an empty command catalog; partial compositions keep the room unchanged.
- The package now declares type-level dependencies on `@deepseek-ai/dsh-token-meter`, `@deepseek-ai/dsh-plan-mode`, and `@deepseek-ai/dsh-commands` (peer + dev, tsconfig references, informational `dsh.client.inject` rows).
- No model-visible change: `/plan off` and slash lines ride the existing command lifecycle logging; projections are read-only.

## Testing

`browser-plugin.client.spec.ts` asserts the extended inject declaration, provides `remote`/`remote.commands` in its benches, and covers the positive path (exit folds to null, run forwards the line, unmatched lines resolve false, list forwards the directory) plus degradation to empty without a session. `slg-game-view.client.spec.tsx` renders props-direct (80 tests): the plan chip (absent without the projection, hidden while inactive, shown under the pending fold, exit click, failure surfacing with re-enable), the context ring (hidden until numerator and capacity exist, panel reading and figures, projectedTokens preference with the clamp, breakdown rows gated on the composition projection), and the slash menu (one pull per open, name filtering, bare-execute vs argued-insert picks, empty and failed pulls, disabled trigger without a session).
