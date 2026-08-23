/**
 * Archived-sessions recovery section: every session in the registry-global
 * archive set, newest first, with one restore action per row. Rows read the
 * standard sessions/workspaces feeds, so a committed restore (unary echo or
 * changed frame) removes the row reactively; opening a row shows the archived
 * conversation without restoring it.
 */
import { useMemo, useState, type ReactNode } from 'react'
import type {
  SessionId, SessionListState, WorkspaceListState,
} from '@deepseek-ai/dsh-client-runtime/client'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ArchiveSection.module.css'

/** Injected dependencies of {@link ArchiveSection} (slot `inject`). */
export interface ArchiveSectionInjected {
  /** uSES selector hook over the sessions list store. */
  useSessions: SnapshotSelectorHook<SessionListState>
  /** uSES selector hook over the workspaces store. */
  useWorkspaces: SnapshotSelectorHook<WorkspaceListState>
  /** Remove one session from the archive set (Host wire write). */
  unarchive: (sessionId: SessionId) => Promise<void>
  /** Select a session as current (valid for archived rows too). */
  open: (sessionId: SessionId) => void
}

/** Full component props assembled by the Settings slot renderer. */
export type ArchiveSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.sessionArchive'>
  & InjectFace<ArchiveSectionInjected>

/** One rendered archive row's display facts. */
interface ArchiveRow {
  id: SessionId
  title: string
  workspace: string
  updatedLabel: string
}

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
})

/** Newest activity first; stable id tie-break mirrors the sidebar ordering. */
function compareRecency(a: ArchiveRow, b: ArchiveRow): number {
  return a.id < b.id ? -1 : 1
}

/** Render the archived-sessions recovery list. */
export function ArchiveSection({ t, useSessions, useWorkspaces, unarchive, open }: ArchiveSectionProps): ReactNode {
  const sessions = useSessions(s => s)
  const workspaces = useWorkspaces(s => s)
  const [restoring, setRestoring] = useState<SessionId | undefined>(undefined)
  const [failed, setFailed] = useState<SessionId | undefined>(undefined)

  const rows = useMemo(() => {
    const workspaceByPath = new Map(workspaces.items.map(item => [item.path, item.title]))
    const rows: Array<ArchiveRow & { updatedAt: number }> = []
    for (const id of workspaces.archivedSessionIds) {
      const summary = sessions.byId[id]
      if (summary === undefined) continue
      rows.push({
        id,
        title: summary.displayTitle,
        workspace: summary.cwd === undefined ? t('ungrouped') : workspaceByPath.get(summary.cwd) ?? t('ungrouped'),
        updatedLabel: dateTimeFormat.format(summary.updatedAt),
        updatedAt: summary.updatedAt,
      })
    }
    return rows.sort((a, b) => b.updatedAt - a.updatedAt || compareRecency(a, b))
  }, [sessions.byId, workspaces.items, workspaces.archivedSessionIds, t])

  const restore = (id: SessionId): void => {
    setFailed(undefined)
    setRestoring(id)
    void unarchive(id).then(
      () => {
        // Success clears through the store projection: the echo/frame removes
        // this row before or alongside this settlement, so no per-row state.
        if (restoring === id) setRestoring(undefined)
      },
      () => {
        if (restoring === id) setRestoring(undefined)
        setFailed(id)
      },
    )
  }

  return (
    <div className={css.section}>
      <p className={css.intro}>{t('intro')}</p>
      {rows.length === 0 ? (
        <p className={css.empty}>{t('empty')}</p>
      ) : (
        <>
          <div className={css.heading}>
            <h3>{t('listHeading')}</h3>
            <span data-archive-count={rows.length}>{rows.length}</span>
          </div>
          <ul className={css.rows}>
            {rows.map(row => (
              <li className={css.row} key={row.id} data-session-id={row.id}>
                <div className={css.facts}>
                  <span className={css.title} title={row.id}>{row.title}</span>
                  <span className={css.meta}>{row.workspace}</span>
                  <span className={css.meta}>{row.updatedLabel}</span>
                </div>
                <div className={css.actions}>
                  <Button variant="ghost" onClick={() => { open(row.id) }}>{t('open')}</Button>
                  {failed === row.id ? <span className={css.error} role="alert">{t('failure')}</span> : null}
                  <Button
                    variant="outline"
                    disabled={restoring !== undefined}
                    onClick={() => { restore(row.id) }}
                  >
                    {restoring === row.id ? t('restoring') : t('restore')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
