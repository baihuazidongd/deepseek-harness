/**
 * MessageJumpButton: a per-session header control (`conversation.session.header.actions`)
 * rendered as a strip of numbered cells — at most five visible — one per
 * user-sent message. The mouse wheel pages the window across longer
 * conversations, hovering a cell previews that message's text, and clicking
 * scrolls the chat view's `[data-conversation-scroll]` scrollport to the row.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  MAX_CELLS, activeIndex, collectUserMessages, followWindowStart, scrollToUserRow,
  shiftWindowStart, userRows,
} from './jump.ts'
import css from './MessageJumpButton.module.css'

/** Full component props composed by the session-header action slot renderer. */
export type MessageJumpProps =
  PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<'message-jump'>

/** Resolve the conversation scrollport the chat view owns. */
function conversationScrollport(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-conversation-scroll]')
}

/**
 * Render the jump control: up to five numbered cells with hover text
 * previews. Hidden while the session has no user messages.
 * @param props - the framework session kit (`useSession`) and the locale seat.
 * @returns the header control, or null with no user messages to jump between.
 */
export function MessageJumpButton({ useSession, t }: MessageJumpProps): ReactNode {
  const chat = useSession(s => s.chat)
  const messages = useMemo(() => collectUserMessages(chat), [chat])
  const total = messages.length
  const [current, setCurrent] = useState<number | null>(null)
  const [start, setStart] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Track the reader's current user message off the scrollport's scroll
  // events; re-bind when the user-message set changes so a new row re-runs
  // the measurement and the initial read.
  useEffect(() => {
    const scrollport = conversationScrollport()
    /* v8 ignore next -- the header renders beside the always-mounted scrollport, so the null arm is unreachable */
    if (scrollport === null) return
    const update = (): void => {
      const index = activeIndex(scrollport)
      setCurrent(index < 0 ? null : index)
    }
    update()
    scrollport.addEventListener('scroll', update, { passive: true })
    return () => { scrollport.removeEventListener('scroll', update) }
  }, [total])

  // Keep the active cell inside the visible window as the reader scrolls.
  useEffect(() => {
    setStart(windowStart => followWindowStart(windowStart, current, total))
  }, [current, total])

  // Page the cell window on wheel without scrolling the conversation behind
  // the control; React's synthetic wheel listener is passive, so bind natively.
  useEffect(() => {
    const root = rootRef.current
    if (root === null) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      if (event.deltaY === 0) return
      const direction: 1 | -1 = event.deltaY > 0 ? 1 : -1
      setStart(windowStart => shiftWindowStart(windowStart, total, direction))
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => { root.removeEventListener('wheel', onWheel) }
  }, [total])

  if (total === 0) return null

  const jumpTo = (ordinal: number): void => {
    const scrollport = conversationScrollport()
    /* v8 ignore next -- the header renders beside the always-mounted scrollport, so the null arm is unreachable */
    if (scrollport === null) return
    const rows = userRows(scrollport)
    const row = rows[ordinal - 1]
    /* v8 ignore next -- transient only while a fresh message's flow row has not rendered yet */
    if (row === undefined) return
    scrollToUserRow(scrollport, row)
  }

  return (
    <div ref={rootRef} className={css.root} role="group" aria-label={t('group.aria')}>
      {messages.slice(start, start + MAX_CELLS).map(({ ordinal, preview }) => {
        const isActive = ordinal - 1 === current
        return (
          <Tooltip key={ordinal} label={preview ?? t('preview.empty')} side="bottom" delayMs={150} maxWidth={280}>
            <button
              type="button"
              className={isActive ? `${css.cell} ${css.cellActive}` : css.cell}
              aria-label={t('cell.aria', { ordinal, total })}
              aria-current={isActive ? 'true' : undefined}
              onClick={() => { jumpTo(ordinal) }}
            >
              {ordinal}
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
