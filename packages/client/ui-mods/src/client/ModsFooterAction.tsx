/**
 * 插件 (plugins) page: the sidebar-foot trigger beside Settings plus the
 * full-viewport management panel it opens. Each Loader entry renders as one
 * row with its fiber status dot, an enablement switch, and an expandable
 * detail block (declared description, version, module, loader entry id, and
 * source category); status and source filter chips plus search sit above the
 * list. A switch flip calls `setEnabled` — the returned snapshot is
 * authoritative, so a refused write reverts the row and raises the
 * panel-level error line instead of leaving a stale optimistic state.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import type {
  PluginInventorySetEnabledRequest,
  PluginInventorySnapshot,
} from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconChevronDownOutline14,
  IconCloseOutline16,
  IconSearchOutline16,
  IconSparkle16,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModsLocaleKey } from './locales.ts'
import css from './ModsFooterAction.module.css'

/** Registration-side Remote face used by the trigger and panel. */
export interface ModsInjected {
  /** Read a current Host inventory snapshot. */
  list: () => Promise<PluginInventorySnapshot>
  /** Persist one entry's enablement and apply it live. */
  setEnabled: (request: PluginInventorySetEnabledRequest) => Promise<PluginInventorySnapshot>
}

type PluginInventoryEntry = PluginInventorySnapshot['entries'][number]
type PluginFiberPhase = PluginInventoryEntry['fiberPhase']

/** Full component props assembled by the footer-action slot renderer. */
export type ModsFooterActionProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'mods'>
  & InjectFace<ModsInjected>

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: PluginInventorySnapshot }

type StatusFilter = 'all' | 'enabled' | 'disabled'
type SourceFilter = 'all' | 'native' | 'library'

const STATUS_KEYS = {
  all: 'filterAll',
  enabled: 'filterEnabled',
  disabled: 'filterDisabled',
} satisfies Record<StatusFilter, ModsLocaleKey>

const SOURCE_KEYS = {
  all: 'sourceAll',
  native: 'sourceNative',
  library: 'sourceLibrary',
} satisfies Record<SourceFilter, ModsLocaleKey>

const PHASE_KEYS = {
  pending: 'pendingPhase',
  loading: 'loadingPhase',
  active: 'active',
  failed: 'failed',
  unloading: 'unloading',
} satisfies Record<Exclude<PluginFiberPhase, null>, ModsLocaleKey>

/** Localized accessible label for one root Fiber phase. */
function phaseLabel(phase: PluginFiberPhase, t: ModsFooterActionProps['t']): string {
  return phase === null ? t('unobserved') : t(PHASE_KEYS[phase])
}

/** Localized category label; an unclassified entry reads as unknown. */
function sourceLabel(source: PluginInventoryEntry['source'], t: ModsFooterActionProps['t']): string {
  return source === null ? t('sourceUnknown') : t(SOURCE_KEYS[source])
}

/** Compact a module specifier for the row title; the full name stays in the detail block. */
function shortName(moduleName: string): string {
  const unscoped = moduleName.startsWith('@') ? moduleName.slice(moduleName.indexOf('/') + 1) : moduleName
  for (const prefix of ['cordis-plugin-', 'cordis:', 'dsh-host-', 'dsh-client-', 'dsh-']) {
    if (unscoped.startsWith(prefix)) return unscoped.slice(prefix.length)
  }
  return unscoped
}

/** Whether an inventory row passes the active filters and search query. */
function matches(
  entry: PluginInventoryEntry,
  status: StatusFilter,
  source: SourceFilter,
  normalizedQuery: string,
): boolean {
  if (status === 'enabled' && !entry.enabled) return false
  if (status === 'disabled' && entry.enabled) return false
  if (source !== 'all' && entry.source !== source) return false
  if (normalizedQuery.length === 0) return true
  return [entry.moduleName, entry.entryId]
    .some(value => value.toLocaleLowerCase().includes(normalizedQuery))
}

/**
 * The modal layer: full-viewport mask + centered panel with the toolbar and
 * entry rows. Close paths: the header button, a mask click, and document-level
 * Escape (mounted only while open, so the listener lifetime is the panel's).
 */
function ModsPanel({ rows, counts, sourceCounts, setEnabled, applySnapshot, t, onClose }: {
  rows: readonly PluginInventoryEntry[]
  counts: Readonly<Record<StatusFilter, number>>
  sourceCounts: Readonly<Record<SourceFilter, number>>
  setEnabled: ModsInjected['setEnabled']
  applySnapshot: (snapshot: PluginInventorySnapshot) => void
  t: ModsFooterActionProps['t']
  onClose: () => void
}) {
  const titleId = useId()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [source, setSource] = useState<SourceFilter>('all')
  const [writeError, setWriteError] = useState(false)
  const [pendingId, setPendingId] = useState<PluginInventoryEntry['entryId'] | null>(null)
  const [expanded, setExpanded] = useState<PluginInventoryEntry['entryId'] | null>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  // Baseline focus management: entering the panel lands on the close button.
  const closeButton = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { closeButton.current?.focus() }, [])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = useMemo(
    () => rows.filter(entry => matches(entry, status, source, normalizedQuery)),
    [rows, status, source, normalizedQuery],
  )

  useEffect(() => {
    if (expanded !== null && !filtered.some(entry => entry.entryId === expanded)) {
      setExpanded(null)
    }
  }, [expanded, filtered])

  const toggle = (entry: PluginInventoryEntry): void => {
    setPendingId(entry.entryId)
    setWriteError(false)
    void setEnabled({ entryId: entry.entryId, enabled: !entry.enabled }).then(
      (snapshot) => {
        applySnapshot(snapshot)
        setPendingId(null)
      },
      () => {
        setWriteError(true)
        setPendingId(null)
      },
    )
  }

  return (
    <div className={css.overlay} role="presentation">
      <div className={css.mask} aria-hidden="true" onClick={onClose} />
      <div className={css.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={css.header}>
          <h2 className={css.title} id={titleId}>{t('title')}</h2>
          <span className={css.titleCount} data-plugin-count={rows.length}>{rows.length} {t('count')}</span>
          <button ref={closeButton} type="button" className={css.close} aria-label={t('close')} onClick={onClose}>
            <IconCloseOutline16 size={14} />
          </button>
        </div>
        <div className={css.toolbar}>
          <div className={css.filterGroup}>
            <div className={css.filters} role="group" aria-label={t('statusFilters')}>
              {(Object.keys(STATUS_KEYS) as StatusFilter[]).map(key => (
                <button
                  key={key}
                  type="button"
                  className={clsx(css.chip, status === key && css.chipActive)}
                  aria-pressed={status === key}
                  onClick={() => { setStatus(key) }}
                >
                  {t(STATUS_KEYS[key])} {counts[key]}
                </button>
              ))}
            </div>
            <div className={css.filters} role="group" aria-label={t('sourceFilters')}>
              {(Object.keys(SOURCE_KEYS) as SourceFilter[]).map(key => (
                <button
                  key={key}
                  type="button"
                  className={clsx(css.chip, source === key && css.chipActive)}
                  aria-pressed={source === key}
                  onClick={() => { setSource(key) }}
                >
                  {t(SOURCE_KEYS[key])} {sourceCounts[key]}
                </button>
              ))}
            </div>
          </div>
          <label className={css.search}>
            <IconSearchOutline16 aria-hidden="true" />
            <span className={css.visuallyHidden}>{t('search')}</span>
            <input
              type="search"
              value={query}
              placeholder={t('search')}
              aria-label={t('search')}
              onChange={(event) => { setQuery(event.currentTarget.value) }}
            />
          </label>
        </div>
        {writeError ? <p className={css.writeError} role="alert">{t('writeError')}</p> : null}
        {rows.length === 0 ? <p className={css.status}>{t('empty')}</p> : null}
        {rows.length > 0 && filtered.length === 0 ? <p className={css.status}>{t('emptySearch')}</p> : null}
        {filtered.length > 0 ? (
          <ul className={css.rows}>
            {filtered.map((entry) => {
              const name = shortName(entry.moduleName)
              const phase = phaseLabel(entry.fiberPhase, t)
              const category = sourceLabel(entry.source, t)
              const open = expanded === entry.entryId
              const detailId = `plugin-detail-${encodeURIComponent(entry.entryId)}`
              return (
                <li
                  className={css.row}
                  key={entry.entryId}
                  data-plugin-entry={entry.entryId}
                  data-open={open ? 'true' : undefined}
                >
                  <button
                    type="button"
                    className={css.rowHeader}
                    aria-expanded={open}
                    aria-controls={detailId}
                    aria-label={`${name}, ${category}${entry.enabled ? `, ${phase}` : ''}`}
                    onClick={() => {
                      setExpanded(current => current === entry.entryId ? null : entry.entryId)
                    }}
                  >
                    <span
                      className={css.statusDot}
                      data-phase={entry.enabled ? (entry.fiberPhase ?? 'unobserved') : 'off'}
                      role={entry.enabled ? 'img' : undefined}
                      aria-label={entry.enabled ? phase : undefined}
                      aria-hidden={entry.enabled ? undefined : true}
                      title={entry.enabled ? phase : undefined}
                    />
                    <span className={css.rowName}>{name}</span>
                    <IconChevronDownOutline14 className={css.chevron} size={12} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={clsx(css.switch, entry.enabled && css.switchOn)}
                    role="switch"
                    aria-checked={entry.enabled}
                    disabled={pendingId !== null}
                    aria-label={`${entry.enabled ? t('disable') : t('enable')} ${name}`}
                    onClick={() => { toggle(entry) }}
                  >
                    <span className={css.knob} />
                  </button>
                  {open ? (
                    <div className={css.detail} id={detailId}>
                      <p className={css.detailDescription}>
                        {entry.description ?? t('unavailable')}
                      </p>
                      <dl className={css.detailFields}>
                        <div>
                          <dt>{t('detailSource')}</dt>
                          <dd>{category}</dd>
                        </div>
                        <div>
                          <dt>{t('detailVersion')}</dt>
                          <dd>{entry.version ?? t('unavailable')}</dd>
                        </div>
                        <div>
                          <dt>{t('detailModule')}</dt>
                          <dd><code className={css.detailCode}>{entry.moduleName}</code></dd>
                        </div>
                        <div>
                          <dt>{t('detailEntryId')}</dt>
                          <dd><code className={css.detailCode}>{entry.entryId}</code></dd>
                        </div>
                      </dl>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : null}
        <span className={css.pendingLine} aria-live="polite">{pendingId !== null ? t('pending') : ''}</span>
      </div>
    </div>
  )
}

/**
 * Render the 插件 trigger row and, while open, the management panel portalled
 * to the document body.
 * @param props - composed slot props (footer-action owner state, locale seat, Remote face).
 * @returns the trigger element tree.
 */
export function ModsFooterAction({ wide, list, setEnabled, t }: ModsFooterActionProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [request, setRequest] = useState(0)
  const [state, setState] = useState<ViewState>({ status: 'loading' })

  // A fresh snapshot per open (and per retry); the last snapshot stays mounted
  // while the panel is open so a write's returned state lands without a refetch.
  useEffect(() => {
    if (!open) return
    let current = true
    void Promise.resolve().then(() => list()).then(
      (snapshot) => { if (current) setState({ status: 'ready', snapshot }) },
      () => { if (current) setState({ status: 'error' }) },
    )
    return () => { current = false }
  }, [open, request, list])

  const close = useCallback(() => { setOpen(false) }, [])

  const rows = state.status === 'ready' ? state.snapshot.entries : []
  const counts = useMemo(() => ({
    all: rows.length,
    enabled: rows.filter(entry => entry.enabled).length,
    disabled: rows.filter(entry => !entry.enabled).length,
  }), [rows])
  const sourceCounts = useMemo(() => ({
    all: rows.length,
    native: rows.filter(entry => entry.source === 'native').length,
    library: rows.filter(entry => entry.source === 'library').length,
  }), [rows])

  return (
    <>
      <Tooltip label={t('trigger')} delayMs={500} disabled={wide}>
        <button
          type="button"
          className={clsx(css.trigger, !wide && css.rail)}
          aria-label={t('trigger')}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => { setOpen(true) }}
        >
          <IconSparkle16 size={wide ? 16 : 18} />
          {wide && <span className={css.triggerLabel}>{t('trigger')}</span>}
        </button>
      </Tooltip>
      {open ? createPortal(
        state.status === 'error' ? (
          <div className={css.overlay} role="presentation">
            <div className={css.mask} aria-hidden="true" onClick={close} />
            <div className={css.panel} role="dialog" aria-modal="true" aria-label={t('title')}>
              <p className={css.failure} role="alert">{t('error')}</p>
              <button
                type="button"
                className={css.retry}
                onClick={() => {
                  setState({ status: 'loading' })
                  setRequest(value => value + 1)
                }}
              >
                {t('retry')}
              </button>
            </div>
          </div>
        ) : state.status === 'loading' ? (
          <div className={css.overlay} role="presentation">
            <div className={css.mask} aria-hidden="true" onClick={close} />
            <div className={css.panel} role="dialog" aria-modal="true" aria-label={t('title')} aria-busy="true">
              <p className={css.status}>{t('loading')}</p>
            </div>
          </div>
        ) : (
          <ModsPanel
            rows={rows}
            counts={counts}
            sourceCounts={sourceCounts}
            setEnabled={setEnabled}
            applySnapshot={(snapshot) => { setState({ status: 'ready', snapshot }) }}
            t={t}
            onClose={close}
          />
        ),
        document.body,
      ) : null}
    </>
  )
}
