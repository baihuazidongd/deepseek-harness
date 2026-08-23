# Agent Note: Plugin inventory manifest probing replaces resolver calls

Status: implemented

English | [中文](2026-08-22-plugin-inventory-manifest-probing.zh.md)

## Problem

`pluginInventory/list` enriched every non-group Loader entry through `readPackageMetadata`, which called `require.resolve('<name>/package.json', { paths: [profileDir] })` synchronously once per entry — about 129 entries in the shipped web profile. Under the [tsx source launch](../architecture/2026-07-29-dsh-source-launch-tsx-esm.md), each `require.resolve` runs the patched TypeScript-aware resolver and costs hundreds of milliseconds (measured ~240 ms per entry; the whole loop ~31 s, versus ~230 ms for the whole loop under plain Node). One `list()` call therefore blocked the event loop for half a minute: the Web plugin manager sat on "Reading plugins…" and every other `/api` request queued behind it.

## Decision

`readPackageMetadata` in `dsh-host-plugin-inventory` no longer calls the resolver. It takes the require lookup paths from `createRequire(<profileDir>/package.json).resolve.paths(moduleName)` — pure path arithmetic producing the parent walk from the profile directory — and reads the first `<searchPath>/<moduleName>/package.json` that `existsSync` finds. That walk reaches both the profile's own `node_modules` (user-installed libraries) and the loader's flat `profiles/node_modules` fallback (installation-owned packages), so resolution outcomes are unchanged: measured on the web profile, the same 127 of 129 entries resolve, in tens of milliseconds under plain Node and under tsx alike.

Probing reads the physical manifest, so metadata no longer requires the package to export `./package.json` — the same property `packageDirFromAnchor` in `dsh-app-boot` already relies on for bundle resolution.

## Alternatives considered

**Cache resolved metadata per module name.** Rejected as the fix: the first `list()` after every server start would still block for tens of seconds; only repeat opens of the plugin manager would benefit.

**Await between entries to yield the event loop.** Rejected: total wall time is unchanged, and the snapshot would need partial states. The cost is the resolver call itself, not batching.

**Launch the server from built `lib/` instead of tsx.** Rejected as a fix for this path: the source launch is a supported contract, and any other synchronous resolver caller would hit the same stall.

**Reuse `packageDirFromAnchor` from `dsh-app-boot`.** Rejected: it would add a cross-package dependency for a six-line loop whose anchor contract differs — bundle resolution tries the installation anchor first, while inventory metadata resolves from the profile anchor only.

## Consequences

The plugin manager opens without a multi-second stall under the tsx source launch, and plain-Node installs keep the same resolution outcomes. Packages whose `exports` map omits `./package.json` now show their declared description and version instead of null; an `exports` redirect of `./package.json` is ignored in favor of the physical file. Entries whose names are not plain package specifiers — subpath tools like `pkg/sub`, `cordis:` builtins — still carry no metadata. Unit coverage pins profile-local resolution, the no-`./package.json`-export case, and subpath nulls.
