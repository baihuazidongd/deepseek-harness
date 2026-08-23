# Agent Note: A standalone thinking-strength composer chip beside the send button

Status: implemented

English | [中文](2026-08-24-standalone-thinking-strength-composer-chip.zh.md)

## Problem

The composer's [model seat](../feature/2026-07-24-web-session-model-selector.md) carries a [dedicated effort trigger](../feature/2026-08-13-web-third-party-reasoning-effort-editor.md), but it is a secondary affordance tucked inside the `ui-model-selection` package beside the model name. A user who wants thinking-strength selection at their fingertips must open the model seat's menu, and there is no surface that can be turned off independently of model selection: disabling model selection takes the only effort control down with it.

## Decision

A new client plugin, `@deepseek-ai/dsh-client-ui-thinking-strength`, registers one chip into `conversation.input.right` — the composer tool row immediately before the primary send button. It resolves the session's shared `ModelDirectory` through `ctx.modelDirectories` (the `ui-model-selection` service) and submits through `session.selectModel`, so the chip and the model seat echo the one Host-reported `ModelSelection`: a strength picked in either surface is what the other shows next. It is a separate bundle row, so the plugin manager can disable the chip without disabling model selection.

The chip renders only while the current model carries [adapter-owned reasoning metadata](../architecture/2026-07-24-adapter-owned-reasoning-effort-capabilities.md); a model without levels has no strength to select. The menu lists the model's adapter-owned level names, descriptions, and default, with a provider-default row only when the adapter configures no model default. The shared directory store reaches the component as the bound `useDirectory` framework hook (the reserved inject `hooks` compartment), never as subscription machinery inside the component; `load`/`select`/`error` are plain inject verbs over the same directory. A rejected selection announces through the shared transient Toast anchored to the composer card. Addressed subagent sessions expose no chip, matching the model seat's Agent-bound RPC constraint.

## Consequences

- One selection fact, three surfaces: the model seat's model and effort triggers and this chip all read and write the same per-session directory.
- Two menus offer the same levels; the cost is a second dropdown, the benefit is quick access beside send and independent disable-ability.
- The chip depends on `ui-model-selection` for `ctx.modelDirectories`; compositions without that package get no chip.
- No new model-visible or wire behavior: every selection flows through the existing `session.selectModel`, so the model experience and KV-cache consequences are inherited from [the model selector](../feature/2026-07-24-web-session-model-selector.md).

## Alternatives considered

- **Fold the chip into `ui-model-selection`.** Rejected: the point is an independently toggleable surface; a separate package keeps it disable-able in the plugin manager and leaves the model-selection package's scope (model routing plus its own effort pane) intact.
- **Reuse only the model seat's existing effort trigger.** Rejected: the request is a dedicated button beside the send button, not another entry inside the model menu.
- **A second per-session directory.** Rejected: it would fork the shared selection state; reading `ctx.modelDirectories` keeps one fact.
