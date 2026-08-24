/**
 * MCP page: the sidebar-foot trigger plus the full-viewport management panel.
 * Each bridged server renders as one row with its transport, an enablement
 * switch, and an expandable detail block listing the tools that server
 * registers. A switch flip calls `setEnabled` (delegating to the plugin
 * inventory); the returned snapshot is authoritative.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import type {
  McpInventorySetEnabledRequest,
  McpInventorySnapshot,
} from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconChevronDownOutline14,
  IconCloseOutline16,
  IconSearchOutline16,
  IconSparkle16,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './McpFooterAction.module.css'

/** Registration-side Remote face used by the trigger and panel. */
export interface McpInjected {
  list: () => Promise<McpInventorySnapshot>
  setEnabled: (request: McpInventorySetEnabledRequest) => Promise<McpInventorySnapshot>
}

type McpServer = McpInventorySnapshot['servers'][number]

/** Full component props assembled by the footer-action slot renderer. */
export type McpFooterActionProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'mcp'>
  & InjectFace<McpInjected>

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: McpInventorySnapshot }

/** Whether a server row passes the active search query. */
function matches(server: McpServer, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true
  return server.name.toLocaleLowerCase().includes(normalizedQuery)
}

function McpPanel({ rows, setEnabled, applySnapshot, t, onClose }: {
  rows: readonly McpServer[]
  setEnabled: McpInjected['setEnabled']
  applySnapshot: (snapshot: McpInventorySnapshot) => void
  t: McpFooterActionProps['t']
  onClose: () => void
}) {
  const titleId = useId()
  const [query, setQuery] = useState('')
  const [writeError, setWriteError] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

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
    () => rows.filter(server => matches(server, normalizedQuery)),
    [rows, normalizedQuery],
  )

  const toggle = (server: McpServer): void => {
    setPendingId(server.name)
    setWriteError(false)
    void setEnabled({ name: server.name, enabled: !server.enabled }).then(
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
            {filtered.map((server) => {
              const open = expanded === server.name
              const detailId = `mcp-detail-${encodeURIComponent(server.name)}`
              return (
                <li
                  className={css.row}
                  key={server.name}
                  data-open={open ? 'true' : undefined}
                >
                  <button
                    type="button"
                    className={css.rowHeader}
                    aria-expanded={open}
                    aria-controls={detailId}
                    aria-label={`${server.name}, ${server.transport}`}
                    onClick={() => {
                      setExpanded(current => current === server.name ? null : server.name)
                    }}
                  >
                    <span
                      className={css.statusDot}
                      data-phase={server.status === 'error' ? 'error' : server.enabled ? 'active' : 'off'}
                      aria-hidden="true"
                    />
                    <span className={css.rowName}>{server.name}</span>
                    <IconChevronDownOutline14 className={css.chevron} size={12} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={clsx(css.switch, server.enabled && css.switchOn)}
                    role="switch"
                    aria-checked={server.enabled}
                    disabled={pendingId !== null}
                    aria-label={`${server.enabled ? t('disable') : t('enable')} ${server.name}`}
                    onClick={() => { toggle(server) }}
                  >
                    <span className={css.knob} />
                  </button>
                  {open ? (
                    <div className={css.detail} id={detailId}>
                      <dl className={css.detailFields}>
                        <div>
                          <dt>{t('detailTransport')}</dt>
                          <dd>{server.transport || t('unavailable')}</dd>
                        </div>
                      </dl>
                      <p className={css.detailToolsLabel}>{t('detailTools')}</p>
                      {server.tools.length > 0 ? (
                        <ul className={css.toolList}>
                          {server.tools.map(tool => (
                            <li key={tool.name}>
                              <code className={css.toolName}>{tool.name}</code>
                              <span className={css.toolDescription}>{tool.description}</span>
                            </li>
                          ))}
                        </ul>
                      ) : <p className={server.status === 'error' ? css.failure : css.status}>{server.status === 'error' ? t('errorStatus') : t('noTools')}</p>}
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
 * Render the MCP trigger row and, while open, the management panel portalled
 * to the document body.
 * @param props - composed slot props.
 * @returns the trigger element tree.
 */
export function McpFooterAction({ wide, list, setEnabled, t }: McpFooterActionProps): ReactNode {
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
  const rows = state.status === 'ready' ? state.snapshot.servers : []

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
          <McpPanel
            rows={rows}
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
