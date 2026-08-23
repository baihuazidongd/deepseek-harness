# @deepseek-ai/dsh-host-plugin-inventory

English | [中文](README.zh.md)

Host projection of the current Cordis Loader tree with browser-driven enablement writes. `PluginInventoryGateway` registers the `pluginInventory` service and publishes two generated direct Remotes. `pluginInventory/list` reads `ctx.loader.entries()` directly on every call, skips structural group rows, and returns the remaining entries in Loader order with only their Loader entry id, module specifier, effective enablement, and current root Fiber phase. `pluginInventory/setEnabled` persists one entry's enablement as an explicit `{ id, disabled }` row in the booted profile's user patch layer (through [`dsh-user-patches`](../../boot/user-patches/README.md), the first programmatic writer of that layer) and applies the same state to the live tree through `loader.update`, returning the refreshed snapshot.

The phase is `pending`, `loading`, `active`, `failed`, or `unloading`; it is `null` when the entry has no live root Fiber. Each entry also carries a package classification and declared package facts: `source` is `library` (a name among the profile manifest's `dependencies` — the record `dsh plugin` writes for everything installed into the profile, bundle or not) or `native` (everything else, i.e. installation-owned rows such as template bundles), `null` when the surface provided no user-layer context; `description` and `version` come from the package's own `package.json`, found by probing the require lookup paths anchored at the profile manifest — the parent walk that reaches both the profile's own `node_modules` and the loader's flat `profiles/node_modules` fallback, without requiring a `./package.json` export — and are `null` when the package does not resolve or declares nothing. The snapshot is intentionally point-in-time: Loader remains the sole lifecycle authority, while this package owns no cache, history, or per-layer provenance model. A write requires the launcher fact `ctx.userPatchPaths` (provided by `dsh profile-boot`); a surface that composed no user patch layers fails loud rather than guessing a file. The written row is explicit on both sides — `disabled: true` and `disabled: false` — matching `loader.update` semantics, so a later bundle default never silently reclaims the entry; the home-level layer and `--patch` overlays still outrank the written row, matching the composition order the surface booted with. The boot-time patch watcher (`watchUserPatches` in `dsh-app-boot`) re-applies the written layer to the same state, so file write and live tree converge idempotently. Public payload types live under `./types`, and Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`.

The service declares its `Context` merge (`ctx.pluginInventory`) so same-process consumers such as [`dsh-tool-plugin-inventory`](../tool-plugin-inventory/README.md) can inject it directly; browser clients consume the same instance through the explicit [`api-remotes`](../../api/remotes/README.md) assembly rather than importing the Host implementation.

## Model Experience

None, as this Host-only inventory projection registers no prompt, tool, message, or provider request. A `setEnabled` write can change which plugins a live session's composition carries, so its effect on any model surface is owned by the plugins it enables or disables, not by this package.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **Point-in-time state only** — the result contains no durable failure history or subscription; a missing root Fiber is reported as `null`, regardless of why no live root exists.
- **No provenance** — the service does not identify which bundle, profile, or override introduced an entry.
- **Enablement writes target the profile layer only** — `setEnabled` always writes the profile's own `cordis.patch.yml`; choosing the home-level layer per deployment would need a validated Config field, and add/remove of entries stays out of scope.
