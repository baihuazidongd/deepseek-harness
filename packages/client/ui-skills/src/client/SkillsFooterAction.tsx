/**
 * 技能 (skills) page: the sidebar-foot trigger beside the plugins trigger plus
 * the full-viewport management panel it opens. Each skill renders as one row
 * with its source, an enablement switch, and an expandable detail block
 * (description, provider, source, and the loaded instruction body). Search sits
 * above the list; a switch flip calls `setEnabled`, whose returned snapshot is
 * authoritative.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import type {
  SkillInventoryDetail,
  SkillInventorySetEnabledRequest,
  SkillInventorySnapshot,
} from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconChevronDownOutline14,
  IconCloseOutline16,
  IconSearchOutline16,
  IconSparkle16,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SkillsFooterAction.module.css'

/** Registration-side Remote face used by the trigger and panel. */
export interface SkillsInjected {
  list: () => Promise<SkillInventorySnapshot>
  setEnabled: (request: SkillInventorySetEnabledRequest) => Promise<SkillInventorySnapshot>
  get: (request: { name: string }) => Promise<SkillInventoryDetail | undefined>
}

type SkillEntry = SkillInventorySnapshot['entries'][number]

/** Full component props assembled by the footer-action slot renderer. */
export type SkillsFooterActionProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'skills'>
  & InjectFace<SkillsInjected>

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: SkillInventorySnapshot }

/** Whether a skill row passes the active search query. */
function matches(entry: SkillEntry, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true
  return [entry.name, entry.description, entry.provider]
    .some(value => value.toLocaleLowerCase().includes(normalizedQuery))
}

function SkillsPanel({ rows, setEnabled, get, applySnapshot, t, onClose }: {
  rows: readonly SkillEntry[]
  setEnabled: SkillsInjected['setEnabled']
  get: SkillsInjected['get']
  applySnapshot: (snapshot: SkillInventorySnapshot) => void
  t: SkillsFooterActionProps['t']
  onClose: () => void
}) {
  const titleId = useId()
  const [query, setQuery] = useState('')
  const [writeError, setWriteError] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, SkillInventoryDetail | undefined>>({})

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  const closeButton = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { closeButton.current?.focus() }, [])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = useMemo(
    () => rows.filter(entry => matches(entry, normalizedQuery)),
    [rows, normalizedQuery],
  )

  useEffect(() => {
    if (expanded !== null && details[expanded] === undefined) {
      let current = true
      void get({ name: expanded }).then((detail) => {
        if (current) setDetails(prev => ({ ...prev, [expanded]: detail }))
      }, () => {})
      return () => { current = false }
    }
    return undefined
  }, [expanded, get, details])

  const toggle = (entry: SkillEntry): void => {
    setPendingId(entry.name)
    setWriteError(false)
    void setEnabled({ name: entry.name, enabled: !entry.enabled }).then(
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
          <span className={css.titleCount}>{rows.length} {t('count')}</span>
          <button ref={closeButton} type="button" className={css.close} aria-label={t('close')} onClick={onClose}>
            <IconCloseOutline16 size={14} />
          </button>
        </div>
        <div className={css.toolbar}>
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
              const open = expanded === entry.name
              const detailId = `skill-detail-${encodeURIComponent(entry.name)}`
              const detail = details[entry.name]
              return (
                <li
                  className={css.row}
                  key={entry.name}
                  data-open={open ? 'true' : undefined}
                >
                  <button
                    type="button"
                    className={css.rowHeader}
                    aria-expanded={open}
                    aria-controls={detailId}
                    aria-label={`${entry.name}, ${entry.source}`}
                    onClick={() => {
                      setExpanded(current => current === entry.name ? null : entry.name)
                    }}
                  >
                    <span
                      className={css.statusDot}
                      data-phase={entry.enabled ? 'active' : 'off'}
                      aria-hidden="true"
                    />
                    <span className={css.rowName}>{entry.name}</span>
                    <IconChevronDownOutline14 className={css.chevron} size={12} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={clsx(css.switch, entry.enabled && css.switchOn)}
                    role="switch"
                    aria-checked={entry.enabled}
                    disabled={pendingId !== null}
                    aria-label={`${entry.enabled ? t('disable') : t('enable')} ${entry.name}`}
                    onClick={() => { toggle(entry) }}
                  >
                    <span className={css.knob} />
                  </button>
                  {open ? (
                    <div className={css.detail} id={detailId}>
                      <p className={css.detailDescription}>
                        {entry.description || t('unavailable')}
                      </p>
                      <dl className={css.detailFields}>
                        <div>
                          <dt>{t('detailProvider')}</dt>
                          <dd>{entry.provider}</dd>
                        </div>
                        <div>
                          <dt>{t('detailSource')}</dt>
                          <dd>{entry.source}</dd>
                        </div>
                      </dl>
                      {detail !== undefined ? (
                        <pre className={css.detailBody}>{detail.content}</pre>
                      ) : null}
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
 * Render the 技能 trigger row and, while open, the management panel portalled
 * to the document body.
 * @param props - composed slot props.
 * @returns the trigger element tree.
 */
export function SkillsFooterAction({ wide, list, setEnabled, get, t }: SkillsFooterActionProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [request, setRequest] = useState(0)
  const [state, setState] = useState<ViewState>({ status: 'loading' })

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
          <SkillsPanel
            rows={rows}
            setEnabled={setEnabled}
            get={get}
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
