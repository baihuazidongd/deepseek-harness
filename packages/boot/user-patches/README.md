# @deepseek-ai/dsh-user-patches

English | [中文](README.zh.md)

The user patch-layer paths a dsh launcher hands to the app it boots, plus the atomic row writer that persists a loader-entry enablement change into the profile's own layer.

The paths are launcher facts, like the command line ([`dsh-cmdline`](../cmdline/README.md)): an app plugin cannot derive which files its composition treated as the user layers, so the launcher calls `provideUserPatchPaths` on the host context before any tree entry mounts, and any plugin reads the frozen `ctx.userPatchPaths` snapshot. A surface that composed no user layers simply does not provide it, and a write-dependent consumer fails loud instead of guessing a file.

`upsertUserPatchRow` keeps the file in the include's entry-list dialect: it parses with `entryListSchema` (so `!!js` expression scalars survive), replaces only the targeted row's `disabled` field while every other row and field round-trips unchanged, appends a fresh `{ id, disabled }` row when the target is absent, treats a missing file as an empty layer, and writes atomically (temp file plus rename with the include's own Windows-transient retry limits) so the boot-time patch watcher (`watchUserPatches` in [`dsh-app-boot`](../app-boot/README.md)) never reads a half-written layer. A present file that is not a top-level array of mappings is a misconfiguration and throws, matching the boot reader's strictness.

## Model Experience

None, as this package owns launcher-fact plumbing and a pure file writer; nothing here assembles model input or registers a model-visible surface.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **Enablement rows only** — the writer upserts one `{ id, disabled }` row; adding or removing entries, and writing other patch fields, stay manual edits.
- **Whole-file reformatting** — the atomic rewrite normalizes YAML formatting (indentation and quoting) even for untouched rows; comments inside the array cannot survive and are rejected by the dialect's round-trip guarantees only if they carry `!!js` semantics, so a hand-commented layer loses its comments on the first programmatic write.
