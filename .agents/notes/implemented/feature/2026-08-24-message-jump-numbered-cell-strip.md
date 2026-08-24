# Agent Note: A numbered five-cell jump strip for the session header

Status: implemented

English | [中文](2026-08-24-message-jump-numbered-cell-strip.zh.md)

## Problem

The message-jump header control shipped as a prev/next chevron pair with a "current / total" readout. Stepping through a long conversation one message at a time is slow, the readout carries no information about which message is which, and there is no way to reach an arbitrary earlier message directly — every visit to the fifth-previous message costs four clicks.

## Decision

`@deepseek-ai/dsh-client-ui-message-jump` renders its `conversation.session.header.actions` seat as a strip of numbered cells, one per user-sent message, showing at most five at once (`MAX_CELLS`). The mouse wheel over the strip pages the visible window by one cell per step; hovering or keyboard-focusing a cell previews that message's text through the shared `ui-primitives` `Tooltip`; clicking a cell scrolls the chat scrollport straight to that row with the existing flow-row math. The cell for the message currently at the scrollport top stays highlighted, and the window shifts on its own when the active message leaves the visible cells while a manual wheel offset survives inside containment.

Message refs and previews derive from the live chat snapshot the framework `useSession` hook exposes (`user` and `steering` kinds; injected `context` excluded). The payload type lives in `ui-conversation`'s `ChatNodeDataMap` merge, so the preview reads the message node structurally (text blocks joined, whitespace collapsed, capped at 120 characters) instead of importing another plugin's symbols. The wheel handler binds natively with `{ passive: false }` because React's synthetic wheel listener is passive and could not `preventDefault()` the conversation scroll behind the control. Window arithmetic (`clampWindowStart`, `shiftWindowStart`, `followWindowStart`) and preview extraction are pure functions in `jump.ts`, unit-tested without a browser.

## Consequences

- Direct access replaces stepping: reaching any of the last five messages is one click, and older ones are at most a few wheel steps away.
- The control stays within the header chrome budget: five 24px cells fit the action row; longer conversations page rather than grow.
- Wheeling over the strip never scrolls the conversation beneath it — the non-passive native listener owns that contract and tests assert `preventDefault`.
- Preview text for image-only or otherwise non-text messages falls back to locale placeholder copy (`preview.empty`) instead of rendering nothing.
- The shared `Tooltip` is still marked as needing a visual pass upstream (no arrow); the bubble inherits its fixed positioning, which is what lets it escape the header's neighbors unclipped.

## Alternatives considered

- **Keep the chevron pair and add a numeric entry field.** Rejected: typing ordinals into a header control is slower than clicking a visible cell and hides the conversation-length affordance the strip makes glanceable.
- **Render one cell per message always.** Rejected: long sessions would push the header into its own scrollbar or overflow the title cluster; five cells bound the footprint while paging covers the rest.
- **A portal popover listing all messages.** Rejected: it adds a second interaction step (open, then pick), loses the always-visible position indicator, and duplicates what the trajectory view already offers for scanning history.
- **Import `UserMessageNode` types and cast the payload.** Rejected: the kind-to-payload guarantee belongs to another package's merge; the structural read keeps this plugin honest about what it can assume and survives replay fallback rows.
