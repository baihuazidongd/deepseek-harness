/** ArchiveSection behavior: rows from the archive set, restore writes, and the reactive row removal. */
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore, type SessionId, type SessionListState, type SessionSummary, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { ArchiveSection } from '../src/client/ArchiveSection.tsx'
import type { ArchiveSectionProps } from '../src/client/ArchiveSection.tsx'
import { en, zh, type SessionArchiveLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: SessionArchiveLocaleKey): string => en[key]) as ArchiveSectionProps['t']

function sid(id: string): SessionId {
  return id as SessionId
}

function summary(id: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: sid(id), displayTitle: `会话 ${id}`, blank: false, running: false,
    updatedAt: 1_700_000_000_000, ...overrides,
  }
}

function sessionsState(rows: SessionSummary[], current: SessionId | undefined = undefined): SessionListState {
  return {
    ids: rows.map(row => row.id),
    byId: Object.fromEntries(rows.map(row => [row.id, row])),
    current,
    phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
  }
}

function workspacesState(archived: readonly string[], titles: Readonly<Record<string, string>> = {}): WorkspaceListState {
  return {
    items: Object.entries(titles).map(([path, title]) => ({
      workspaceId: title, path, title, sessionIds: [], createdAt: '0', updatedAt: '0',
    })) as never,
    archivedSessionIds: archived.map(sid),
    state: 'idle', phase: 'ready', error: null, baselinesReady: true, recentWorkspaceId: undefined,
  }
}

const SESSIONS = sessionsState([
  summary('s-old', { updatedAt: 1_700_000_001_000 }),
  summary('s-new', { cwd: 'D:\\proj', updatedAt: 1_700_000_002_000 }),
])
const WORKSPACES = workspacesState(['s-new', 's-old'], { 'D:\\proj': 'proj' })

function props(sessions: SessionListState, workspaces: WorkspaceListState) {
  const sessionsStore = createSnapshotStore(sessions)
  const workspacesStore = createSnapshotStore(workspaces)
  const sectionProps: ArchiveSectionProps = {
    t,
    close: () => {},
    useSessions: bindSnapshotSelector(sessionsStore),
    useWorkspaces: bindSnapshotSelector(workspacesStore),
    unarchive: vi.fn(async () => {}),
    open: vi.fn(),
  } as ArchiveSectionProps
  return { stores: { sessionsStore, workspacesStore }, props: sectionProps }
}

describe('ArchiveSection', () => {
  it('renders archived rows newest first with workspace labels and zh copy keys', () => {
    expect(zh.restore).toBe('恢复')
    const { props: sectionProps } = props(SESSIONS, WORKSPACES)
    const view = render(<ArchiveSection {...sectionProps} />)
    expect(screen.getByRole('heading', { name: en.listHeading })).toBeTruthy()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    // Newest first: s-new (cwd D:\proj → titled workspace) leads s-old (ungrouped).
    expect(rows[0]!.dataset.sessionId).toBe('s-new')
    expect(screen.getByText('proj')).toBeTruthy()
    expect(screen.getByText(en.ungrouped)).toBeTruthy()
    for (const id of ['s-new', 's-old']) {
      expect(view.container.querySelector(`[title="${id}"]`)).not.toBeNull()
    }
  })

  it('shows the empty state when nothing is archived', () => {
    const { props: sectionProps } = props(SESSIONS, workspacesState([]))
    render(<ArchiveSection {...sectionProps} />)
    expect(screen.queryByRole('listitem')).toBeNull()
    expect(screen.getByText(en.empty)).toBeTruthy()
  })

  it('skips archive ids missing from the session list store', () => {
    const { props: sectionProps } = props(
      sessionsState([summary('s-old')]),
      workspacesState(['s-ghost', 's-old']),
    )
    const view = render(<ArchiveSection {...sectionProps} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(view.container.querySelector('[title="s-old"]')).not.toBeNull()
    expect(view.container.querySelector('[title="s-ghost"]')).toBeNull()
  })

  it('restore writes through the wire face; the store update removes the row reactively', async () => {
    const harness = props(SESSIONS, WORKSPACES)
    const view = render(<ArchiveSection {...harness.props} />)
    fireEvent.click(screen.getAllByRole('button', { name: en.restore })[0]!)
    await waitFor(() => { expect(harness.props.unarchive).toHaveBeenCalledOnce() })
    expect(vi.mocked(harness.props.unarchive).mock.calls[0]).toEqual([sid('s-new')])
    // The unary echo/frame path lands as a plain store replacement.
    await act(async () => {
      harness.stores.workspacesStore.set(workspacesState(['s-old'], { 'D:\\proj': 'proj' }))
    })
    await waitFor(() => { expect(view.container.querySelector('[data-session-id="s-new"]')).toBeNull() })
    expect(view.container.querySelector('[data-session-id="s-old"]')).not.toBeNull()
  })

  it('a rejected restore keeps the row and shows the inline failure', async () => {
    const sessionsStore = createSnapshotStore(SESSIONS)
    const workspacesStore = createSnapshotStore(WORKSPACES)
    const failingProps = {
      t,
      close: () => {},
      useSessions: bindSnapshotSelector(sessionsStore),
      useWorkspaces: bindSnapshotSelector(workspacesStore),
      unarchive: async () => { throw new Error('wire down') },
      open: () => {},
    } as unknown as ArchiveSectionProps
    const view = render(<ArchiveSection {...failingProps} />)
    fireEvent.click(screen.getAllByRole('button', { name: en.restore })[0]!)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(en.failure)
    expect(view.container.querySelector('[data-session-id="s-new"]')).not.toBeNull()
  })

  it('open selects the archived conversation without restoring it', () => {
    const harness = props(SESSIONS, WORKSPACES)
    render(<ArchiveSection {...harness.props} />)
    fireEvent.click(screen.getAllByRole('button', { name: en.open })[0]!)
    expect(harness.props.open).toHaveBeenCalledWith(sid('s-new'))
    expect(harness.props.unarchive).not.toHaveBeenCalled()
  })
})
