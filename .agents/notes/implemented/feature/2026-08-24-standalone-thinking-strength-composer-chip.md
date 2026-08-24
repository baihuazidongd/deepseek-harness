# Agent Note: A standalone thinking-strength composer chip beside the send button

Status: implemented

English | [中文](2026-08-24-standalone-thinking-strength-composer-chip.zh.md)

## Problem

The composer's [model seat](../feature/2026-07-24-web-session-model-selector.md) carries a [dedicated effort trigger](../feature/2026-08-13-web-third-party-reasoning-effort-editor.md), but it is a secondary affordance tucked inside the `ui-model-selection` package beside the model name. A user who wants thinking-strength selection at their fingertips must open the model seat's menu, and there is no surface that can be turned off independently of model selection: disabling model selection takes the only effort control down with it.

## Decision

A new client plugin, `@deepseek-ai/dsh-client-ui-thinking-strength`, registers one chip into `conversation.input.right` — the composer tool row immediately before the primary send button. It resolves the session's shared `ModelDirectory` through `ctx.modelDirectories` (the `ui-model-selection` service) and submits through `session.selectModel`, so the chip and the model seat echo the one Host-reported `ModelSelection`: a strength picked in either surface is what the other shows next. It ships as a user-installed library package — installed into the profile with `dsh plugin add`, never a row in the `web-app` product bundle — so the plugin manager classifies it as `library` and it can be disabled without disabling model selection.

The chip renders for every ordinary session with a current model. A model carrying [adapter-owned reasoning metadata](../architecture/2026-07-24-adapter-owned-reasoning-effort-capabilities.md) opens to its level list — names, descriptions, and default, with a provider-default row only when the adapter configures no model default. A model without such metadata still shows the chip, and opens to the empty "no levels" notice instead of hiding the control, so every model/provider presents the same surface. The shared directory store reaches the component as the bound `useDirectory` framework hook (the reserved inject `hooks` compartment), never as subscription machinery inside the component; `load`/`select`/`error` are plain inject verbs over the same directory. A rejected selection announces through the shared transient Toast anchored to the composer card. Addressed subagent sessions expose no chip, matching the model seat's Agent-bound RPC constraint.

## Consequences

- One selection fact, three surfaces: the model seat's model and effort triggers and this chip all read and write the same per-session directory.
- Every model shows the chip, so a reasoning model offers the same levels through two menus while a non-reasoning model still has the chip (opening to the no-levels notice); the cost is a second dropdown, the benefit is a uniform surface beside send and independent disable-ability.
- The chip depends on `ui-model-selection` for `ctx.modelDirectories`; a profile without that package has no chip, and the package must be installed (`dsh plugin add`) for the chip to mount at all.
- No new model-visible or wire behavior: every selection flows through the existing `session.selectModel`, so the model experience and KV-cache consequences are inherited from [the model selector](../feature/2026-07-24-web-session-model-selector.md).

## Alternatives considered

- **Ship the chip in the `web-app` product bundle.** Rejected: that classifies it as `native`; a user-added surface belongs in the profile layer as a `library` plugin, disable-able and removable without touching the product bundle.
- **Hide the chip for non-reasoning models.** Rejected: the surface would then vanish per model/provider (two buttons for reasoning models, none otherwise), the inconsistency this chip removes.
- **Fold the chip into `ui-model-selection`.** Rejected: the point is an independently toggleable surface; a separate package keeps it disable-able in the plugin manager and leaves the model-selection package's scope (model routing plus its own effort pane) intact.
- **Reuse only the model seat's existing effort trigger.** Rejected: the request is a dedicated button beside the send button, not another entry inside the model menu.
- **A second per-session directory.** Rejected: it would fork the shared selection state; reading `ctx.modelDirectories` keeps one fact.
