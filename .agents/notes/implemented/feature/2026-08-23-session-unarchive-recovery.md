# Agent Note: Session unarchive — the recovery seam and the Settings page

Status: implemented

English | [中文](2026-08-23-session-unarchive-recovery.zh.md)

## Problem

Archiving was a one-way door in the Web GUI: `workspace.archiveSession` existed on the wire, but no registry method, RPC route, or UI surface could reverse it. One click in a session row's menu hid the conversation from every grouping surface, and the only documented way back was editing `workspace.json` by hand. Real conversations were being lost this way — hidden, not deleted.

## Decision

A minimal symmetric extension of the existing archive chain plus one new client plugin; zero modification to the workspace browser UI itself.

**Registry** (`dsh-workspace`): `WorkspaceRegistry.unarchiveSession(id)` filters one id out of `archivedSessionIds` through the same serialized state write as archiving. An id not currently archived — including an unknown one — resolves without writing, so recovery flows need no existence checks; accounting is never touched.

**Wire** (`dsh-host-apiproxy`): `workspace.unarchiveSession({ sessionId })` mirrors the archive route across the RpcMethodMap row, the request/value schemas, the unary dispatch table, and the gateway impl, answering the full updated set. The storage-domain watcher already broadcasts `host/archived-sessions-changed` after every durable set change, so every connected client re-baselines for free.

**Client runtime** (`dsh-client-runtime`): `IWorkspaces.unarchiveSession(id)` with manager/service implementations mirroring `archiveSession` — the service throws `session unarchive failed: code: message` on Host errors.

**Plugin** (`@deepseek-ai/dsh-client-ui-session-archive`, new): registers a `settings.section` contribution (id `session-archive`, order 30) listing the archive set joined against the sessions store — display title, workspace label, last activity, newest first. 打开 selects the archived conversation (archived rows stay in the list store; only grouping hides them); 恢复 writes through `ctx.workspaces.unarchiveSession` and lets the echo/frame remove the row reactively. Rows whose id is absent from the projection (cold cwd-less artifacts) cannot render and are a documented limitation. The package rides the repo's web-app bundle roster; no profile patch layer change is needed for source checkouts.

## Alternatives considered

**Auto-unarchive on open.** Rejected: opening an archived conversation to read it should not mutate the archive set; explicit 恢复 keeps display state user-owned.

**Unhide inside the sidebar row menu.** Rejected: archived rows are filtered client-side from grouped trees, so the menu would need per-surface plumbing across three groupings; a Settings page needs none, and the archive action's discoverability problem is an ui-workspace UX question beyond this fix.

**Direct medium edit / one-off script.** Rejected: undocumented, host-lock-unsafe, and leaves the gap open for the next accidental archive.

## Consequences

- Unarchive propagates to all clients through the existing changed-frame broadcast; no new push kind.
- The known-limitation wording in ui-workspace's README ("no viewing or unarchive surface") is retired; deletion of Sessions remains unsupported by design.
- Prevention hardening for the sibling latent risks (fail-loud whole-list scan on one bad artifact, silent torn-header skip) remains deferred; this change only closes the reversible gap.

## Testing

`packages/workspace/workspace/tests/workspace.spec.ts` covers durable/idempotent unarchive, accounting untouched, unknown-id no-op, and restart restore. `packages/host/apiproxy/tests/api-proxy-workspace.spec.ts` covers the route end-to-end including the single `host/archived-sessions-changed` snapshot and no-frame no-ops. Runtime `workspaces-service.client.spec.ts` covers echo install, selection preservation, and error passthrough. The plugin suite covers registration/HMR semantics and component behavior (ordering, empty state, missing-id skip, reactive removal, inline failure). Both tsconfig aggregates typecheck clean.
