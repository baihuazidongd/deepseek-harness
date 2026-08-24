# Agent Note: Plugin inventory persists enablement under the composition id

Status: implemented

English | [中文](2026-08-23-plugin-inventory-persists-composition-id.zh.md)

## Problem

`pluginInventory/setEnabled` persisted a disable toggle as `{ id: request.entryId, disabled }` into the profile's `cordis.patch.yml`. The `entryId` came straight from `loader.entries()`'s `entry.id`, which is the Loader's *qualified* runtime id — inside the root include subtree a top-level entry `demo-plugin` is exposed as `include:demo-plugin`. The boot-time patch application (`applyEntryPatches`) indexes the composition by the *unqualified* id the config file declares (`demo-plugin`), so a persisted `{ id: 'include:demo-plugin' }` row matched nothing and was skipped with a warning. The live toggle still worked (the same qualified id is what `loader.update` resolves), so disabling a plugin appeared to succeed but silently reverted on the next boot — the "disabled it, refreshed, still enabled" symptom.

## Decision

`setEnabled` resolves the targeted entry by its qualified id and persists the row under `entry.options.id` — the unqualified composition id the boot-time patch application indexes — while the live `loader.update` keeps using the qualified `request.entryId`. `list()` still reports the qualified `entry.id`, which stays the stable, unique runtime identity the client sends back.

## Alternatives considered

**Expose the unqualified id from `list()` and have the client send it.** Rejected: the unqualified id is not unique across subtrees (two includes can each declare a `demo-plugin`), so it cannot safely identify an entry for `loader.update`, and the persisted row's correctness still requires the unqualified id — splitting one identity across two fields would push the ambiguity onto the caller.

**Strip the `include:` prefix from the runtime id before persisting.** Rejected: the prefix is the include entry's own id and can nest (`include:group:child`), so string-munging is fragile; `entry.options.id` already carries the exact unqualified value with no parsing.

## Consequences

Disabling a plugin now survives a reload and a restart. The persisted row uses the composition id, matching what `dsh --dump-config` and the boot-time reader index, so a manual edit of `cordis.patch.yml` and a UI toggle converge on the same row. A regression test mounts a config file through the root include and pins that the persisted row targets `demo-plugin`, not `include:demo-plugin`.
