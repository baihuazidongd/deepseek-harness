# @deepseek-ai/dsh-client-ui-session-archive

English | [中文](README.zh.md)

**Archived sessions** recovery section for Web Settings. Archiving hides a conversation from every grouping surface while its session log stays intact on disk; until now the only way back was editing the registry medium by hand. This plugin lists the Host's registry-global archive set and restores rows onto all surfaces with one click.

The browser plugin registers one localized `settings.section` contribution (id `session-archive`, order `30`) through [`ui-settings`](../../client/ui-settings/README.md), reading the standard `ctx.sessions` / `ctx.workspaces` feeds. Each row shows the archived conversation's display title, workspace label, and last activity time, newest first. **打开** selects the archived conversation without changing the archive set; **恢复** writes through `workspaces.unarchiveSession` — the unary echo (or the `host/archived-sessions-changed` frame another client triggers) removes the row reactively, and a failed write keeps it with an inline error. Archive ids missing from the sessions store (for example cold cwd-less sessions) are not listed. The registration uses `ctx.slots.inject()`, so it follows late section declaration, redeclaration, locale changes, and teardown without importing the section owner.

## Model Experience

None, as this package only projects Host-owned registry facts in browser Settings and sends no model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **List completeness depends on the sessions store** — archive rows render from the live session-list projection; a persisted-but-unprojected session (a cold cwd-less artifact) is archivable yet invisible here until it appears in `session.list`.
- **No bulk restore or search** — recovery is one row at a time, ordered by recency; no multi-select, filtering, or log-content preview.
