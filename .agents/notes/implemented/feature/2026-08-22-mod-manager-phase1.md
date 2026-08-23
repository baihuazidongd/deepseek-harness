# Agent Note: Mod manager phase 1 — sidebar 模组 page with durable enablement writes

Status: implemented

English | [中文](2026-08-22-mod-manager-phase1.zh.md)

## Problem

Loader entries could only be toggled by hand-editing `cordis.patch.yml`: the browser's plugin list tab was read-only by design, and no shipped code wrote a user patch layer programmatically. A user designing a mod-manager workflow (mirror-instance testing, promote gate, harness-update flow) needed the management foundation first: a top-level surface where enablement toggles are durable, hot-applied, and consistent with the composition's patch-layer semantics.

## Decision

Three pieces, each on an existing seam:

**`@deepseek-ai/dsh-user-patches` (new, `packages/boot/user-patches`)** — the launcher fact `ctx.userPatchPaths` (both user-layer paths, frozen; provided by `dsh profile-boot`'s prepare step beside `provideCmdline`, because only the launcher knows which files the composition treated as user layers) and `upsertUserPatchRow`, the first programmatic writer of a user patch layer. The writer parses with the include's `entryListSchema` so `!!js` expression scalars round-trip, replaces only the targeted row's `disabled` field, appends a fresh row when absent, treats a missing file as an empty layer, rejects a present-but-invalid file as loudly as the boot reader, and writes atomically (temp + rename with the include's Windows-transient retry limits). Explicit write semantics: both `disabled: true` and `disabled: false` are written (mirroring `loader.update`), never row removal — a later bundle default therefore never silently reclaims a toggled entry. The alternative (remove-on-enable, re-inheriting the composition default, the settings-file reset pattern) was rejected: it makes a toggle's meaning depend on the bundle layer below and cannot express "force-enable against a bundle default".

**`pluginInventory/setEnabled` (new Remote on `dsh-host-plugin-inventory`)** — validates the entry id against the live tree, persists the explicit row into the profile's own layer through the writer, applies the same state via `loader.update`, and returns the refreshed `list()` snapshot. Double application (file write plus direct update plus the boot watcher's re-read) is idempotent: the watcher re-composes from the file, so file and tree converge. A surface that provided no `ctx.userPatchPaths` fails loud. The gateway description in the package README changed from "read-only projection" to "projection with enablement writes".

**`@deepseek-ai/dsh-client-ui-mods` (new, `packages/client/ui-mods`)** — one `sidebar.footer.action` list-slot registration (id `mods`): the trigger row beside Settings (wide row / rail circle, settings-shell rhythm) opening a full-viewport mask-and-dialog panel with status filter chips, search, and one switch row per non-group entry. The returned `setEnabled` snapshot is authoritative (no optimistic residue; a refused write raises a panel-level error line). Disabled entries omit the redundant Fiber-phase announcement (template tab's convention). This package is deliberately the management foundation only: the roadmap's mirror-instance test ladder, promote gate, and harness-update flow are later phases recorded in its README's deferred work.

Supporting wiring: `dsh profile-boot` provides the paths; the web bundle's browser roster gains the `ui-mods` row; the fixture transport (`dsh-client-connection` fixture world) serves `pluginInventory/list`/`setEnabled` with a deterministic five-entry inventory and in-memory toggle state, so the assembled snapshot lane exercises the page keylessly. The same PR renames the surface 模组 → 插件 and grows the projection: `list` now classifies each entry as `native` (an installation-owned bundle row) or `library` (a name among the profile manifest's dependencies; corrected to dependency-membership alone by the [classification fix](../bug-fix/2026-08-23-plugin-inventory-source-classification.md) after its first rule also subtracted bundle names and misfiled user-installed bundles as native), and resolves the package's own `package.json` from the profile directory for its declared `description` and `version` (null when the package does not resolve, matching `cordis:` builtins and non-package specifiers). Without the launcher's user-layer fact the classification is `null` (the page reads it as unknown) and metadata stays null; a present-but-invalid profile manifest fails loud. The page gained a second filter group (source: all/native/libraries) and an expandable detail block per row (description, version, module, loader entry id, category); the internal package and slot ids stay `mods`/`ui-mods` — the rename is copy-level, since the id is not user-facing.

## Consequences

- A browser toggle now changes the Host composition durably: the profile's own `cordis.patch.yml` carries an explicit `{ id, disabled }` row, the live tree applies it immediately, and the state survives restart. Hand edits of that file still outrank later toggles only through the normal layer order — the written row is always the newest edit of that row.
- The plugin-inventory Remote is no longer read-only; its gateway description, the api-remotes assembly wording, and the fixture transport (which now answers both endpoints) all changed with it.
- The sidebar foot gains a second trigger beside Settings; the Settings "Plugin list" tab stays read-only, so enablement display now has two surfaces (the tab's loader-tree inspection view and the mods page's management view) — the mods page is the management authority, the tab remains an inspection view.
- No model-visible input or session event is added: enablement is Host-plane state, and a toggle's effect on any model surface is owned by the plugins it enables or disables.
- The inventory Remote's payload grew three fields (`source`, `description`, `version`); every consumer fixture updated with it, and the assembled golden now pins both filter groups plus one expanded detail block.

## Testing


- Package suites: `packages/boot/user-patches` (11), `packages/host/plugin-inventory` (5), `packages/client/ui-mods` (12), `packages/client/connection` fixture (extended), all at per-file 100% coverage (the writer's rename-retry path carries a justified `v8 ignore`).
- Assembled keyless snapshot `apps/web/tests/mods-page.snapshot.ts` boots the built bundles through AppWebEntry against the fixture transport, opens the page from the sidebar trigger, pins the panel shape (`snapshots/mods-page/ui.expected.md`), and flips one switch through the fixture Remote.

## Alternatives considered

**Write through the Loader's own tree write-back (`entry.options.disabled = true; tree.write()`)** — that persists into the throwaway profile root `cordis.yml` which `prepareProfile` rewrites on every boot; durable state must live in the patch layers.

**Expose the write as a Host service with a Config-declared path** — the profile patch path is a launcher fact, not deployment config; guessing it from a plugin would violate the fail-loud misconfiguration rule.

**Grow the existing Settings "Plugin list" tab instead of a sidebar-level page** — the confirmed product design wants mod management as a first-class surface (mirror status, promote gate, updates later); the tab remains a read-only inventory view.

## Follow-ups

- Phase 2: `dsh mirror` command family (disposable profile + isolated `DSH_HOME`, port offset; note `scrubbedParentEnv` strips `DSH_HOME`, so a mirror spawn must pass it explicitly).
- Phase 3: instance-control capability seam, test ladder (static → keyless snapshot → real session → human), `promote` command, conversation approval card with diff render.
- Phase 4: harness-update flow gated by the same mirror ladder.
