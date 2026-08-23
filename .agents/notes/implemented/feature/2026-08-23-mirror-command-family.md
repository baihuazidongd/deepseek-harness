# Agent Note: `dsh mirror` — the disposable mirror command family

Status: implemented

English | [中文](2026-08-23-mirror-command-family.zh.md)

## Problem

The `plugin_inventory` tool taught the model a mirror-first install procedure, but every step was shell handiwork: copying the profile directory (junction-laden `node_modules` on Windows), backgrounding a boot process, and finding/killing it later. The procedure was fragile to execute and left nothing inspectable — no recorded pid, port, or log path — so a crashed mirror loop could leak processes and directories.

## Decision

A launcher-level `dsh mirror` subcommand family (`apps/cli/src/mirror.ts`, dispatched from `bin.ts` beside `plugin`):

- **`create <name> --from <profile>`** — copies the composition files only (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `cordis.patch.yml`); `node_modules` is never copied (pnpm junctions point into the source tree). A manifest with dependencies gets one `pnpm install` in the mirror, relinking from the shared store. Writes `.dsh-mirror.json`, the state record that authorizes every later verb.
- **`launch <name>`** — picks a free port (bind-0 probe), spawns `node` with `[...process.execArgv, process.argv[1], '--profile', <mirror>, '--port', <port>]` detached with stdio appended to `.dsh-mirror.log` (re-exec keeps the tsx `--import` loader under the source launch), records pid/port/launchedAt, and polls HTTP until the instance answers (120 s budget).
- **`list` / `status <name>`** — scan `$DSH_HOME/profiles` for state records; status adds liveness (`process.kill(pid, 0)`) and the log tail.
- **`stop <name>`** — kills the recorded tree (`taskkill /PID /T /F` on Windows, `SIGKILL` elsewhere) and clears pid/port from the record; already-exited and never-launched mirrors are no-ops.
- **`discard <name>`** — stops a running mirror, then deletes the directory. The state record is the authorization: a directory without one is a real profile and is refused, so `discard` can never delete a user profile.

The `plugin_inventory` tool description now speaks in `dsh mirror` verbs (`create`/`launch`/`stop`/`discard`) instead of the manual shell procedure; the model-facing guide and the CLI are one procedure now, pinned by the tool's package test and regenerated into the tool catalog.

Spawns and streams run through an `internals` seam (the `dsh-cmdline` pattern), so the unit suite drives create/list/status/stop/discard against a temp `$DSH_HOME` with fake children and fake `fetch` — no real process management in tests.

## Alternatives considered

**Copy the whole profile directory (the original tool wording).** Rejected: pnpm `node_modules` junctions point into the source tree, so a verbatim copy is both huge and wrong; manifest-copy plus store relink is smaller and correct.

**An isolated `DSH_HOME` per mirror.** Rejected for this family (kept as the earlier phase's deferred hardening): credentials and settings must carry over for the driving agent to use the mirror, and isolation already comes from the profile copy and the offset port.

**Host-plane process management through `ctx.subprocess`.** Rejected: the mirror verbs run before any tree exists — they are launcher concerns, like `dsh plugin`.

## Consequences

- A mirror is a normal profile plus one state file: every existing verb (`dsh plugin --profile <mirror> add ...`, patch edits, `dsh --profile <mirror>`) works on it unchanged.
- The state record is best-effort: a host reboot orphans a recorded pid (liveness reads it as dead) and `list` shows stopped; a stale directory is cleaned by `discard`.
- The free-port probe races other binders between close and use; local single-user use accepts the window.
- POSIX `stop` signals the recorded pid only — descendants of a web instance are its own children and die with the process tree the runtime owns; Windows gets the full-tree `taskkill`.

## Testing

`apps/cli/tests/mirror.spec.ts` covers create (copy set, relink dispatch and failure, self/missing/existing refusals), list/status (empty home, stopped row, log tail, non-mirror refusal), launch (re-exec argument shape with the loader flags, state recording, HTTP wait, early exit, double-launch refusal), stop (tree kill, exited/unlaunched no-ops, record clearing), and discard (refuses real profiles, stops-then-deletes). `apps/cli/tests/args.spec.ts` pins the subcommand routing. The full lifecycle was also driven by hand against the real web profile (create → launch on a free port with HTTP 200 → list/status → stop → discard leaves no directory).
