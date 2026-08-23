# Agent Note: The Models page edits a third-party model's reasoning effort levels

Status: implemented

English | [中文](2026-08-13-web-third-party-reasoning-effort-editor.zh.md)

## Problem

The composer's model picker offers a reasoning-effort pane, but a hand-declared third-party model could never get one: the seam that decides the offer is the profile's `reasoningEfforts` declaration ([per-model reasoning declarations](../../implemented/feature/2026-08-08-pi-ai-per-model-reasoning-declarations.md)), and the Models page — the only editing surface for such a route — deliberately exposed no reasoning control, reasoning that effort is a per-model capability with no provider-scoped answer. A web-only user configuring a private gateway's thinking model therefore had to hand-write `settings.yaml`, with no discoverable path from the UI to the capability the picker was built to show.

The field was already a "carried but not edited" slot: `ModelDraft` is structurally open, the row patch spreads stored rows, and adoption keeps an existing row over a rediscovered candidate, so a hand-written `reasoningEfforts` survived editing other fields. What was missing was the editor.

## Decision

Each pi-ai model row's disclosure (the same fold that holds the capacities) gains a **reasoning effort levels** text field. It reads the stored `reasoningEfforts` keys as a comma-separated list and writes a canonical `id → wire spelling` mapping: each typed id is accepted only if it is one of pi-ai's canonical levels (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`), `off` maps to `null` (supported, send nothing), and the rest map to themselves. An unknown id is refused without dropping the typed text, and the refusal names the offending level. When the typed level set matches the stored keys, the stored wire spellings are kept — a gateway that renames `max` to `ultra` in the declaration keeps that spelling through an edit that only reorders or restates the levels.

The level vocabulary is mirrored from `llm-pi-ai`'s `THINKING_LEVELS` because the source-plane split forbids a client package importing the adapter; a drift between the two fails loud at the adapter's own schema on save rather than silently narrowing the offer.

The saved declaration flows through the existing chain unchanged: `catalog.ts` materializes the model with `reasoning: true` and the spelling map, `reasoningInfo` reports the levels, and the picker's effort pane offers exactly them. The picker and the persistence seams needed no changes.

The composer's model seat gained a second trigger so the levels are not buried behind the model menu. When the current model carries reasoning metadata, a dedicated **effort trigger** renders to the left of the model trigger, showing the effective level and opening straight into the effort pane; without such metadata the trigger is absent, so a model that offers no levels never shows a dead control. Both triggers share the menu and the selection submission, and focus returns to whichever one opened it.

## Consequences

- A web-only user can configure a thinking model on a hand-declared route end to end: declare levels in the row, then pick model and effort in the composer.
- The level set is the whole offer, matching the declaration semantics: levels not typed are not offered, and there is no "inherit the catalog" spelling. A user who wants the catalog's levels restates them.
- `input`, `compat`, and the other settings-document fields stay unedited by the form; only `reasoningEfforts` joins `id`, `name`, and the two capacities as editable ([input-modalities note](../../implemented/architecture/2026-08-12-pi-ai-route-default-input-modalities.md)).
- The DeepSeek adapter family is untouched: its rows use the separate `DeepSeekModelsEditor`, whose models carry no `reasoningEfforts`.

## Alternatives considered

- **A dropdown over the canonical levels.** Unusable as a single control, because the field's meaning is a *set* — the model declares which of the levels it accepts, and the picker turns the set into individual choices.
- **Storing whatever text is typed.** The adapter's schema rejects unknown keys at save, so the refusal would name the write, not the field. The inline validation names the offending level while the user is still looking at it.
- **Editing the wire spelling per level.** The adapter keeps protocol spellings private by design; the canonical-id surface is the operator-facing shape the declaration itself uses.
