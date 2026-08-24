/**
 * Message-jump helpers: identify the user's own sent messages in the in-window
 * chat snapshot and in the rendered flow, derive per-cell previews, resolve
 * the next/previous scroll target, and manage the visible five-cell window.
 * Kept as pure functions so the component's jump and window math is
 * unit-testable without a browser scrollport.
 */
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

/** Chat node kinds representing the user's own sent messages (ordinary and in-turn steering); injected `context` is excluded. */
const USER_KINDS: ReadonlySet<string> = new Set(['user', 'steering'])

/** Flow-row attribute the chat view stamps with each node's renderer kind. */
const FLOW_KIND_ATTR = 'data-chat-flow-kind'

/** Gap kept between the scrollport top and a jumped-to row. */
const TOP_GAP = 8

/** Cell-window size: at most this many message cells are visible at once. */
export const MAX_CELLS = 5

/** Preview length cap; longer messages collapse with an ellipsis. */
const PREVIEW_MAX_CHARS = 120

const EMPTY_CONTENT: readonly unknown[] = []

/** One jumpable user-sent message derived from the chat snapshot. */
export interface UserMessageRef {
  /** 1-based position among all user-sent messages in render order. */
  readonly ordinal: number
  /** Single-line text preview; null when the message carries no text block. */
  readonly preview: string | null
}

/**
 * Whether one Chat node kind is the user's own sent message.
 * @param kind - the node's renderer kind.
 * @returns true for ordinary user messages and steering messages.
 */
export function isUserMessage(kind: string): boolean {
  return USER_KINDS.has(kind)
}

/**
 * Collect the user's own sent messages in render order with their previews.
 * @param chat - the live chat snapshot slice.
 * @returns one ref per user/steering node, ordinals dense from 1.
 */
export function collectUserMessages(chat: ChatSnapshot): readonly UserMessageRef[] {
  const refs: UserMessageRef[] = []
  for (const key of chat.order) {
    const node = chat.nodes.get(key)
    /* v8 ignore next -- every order key is present in the node store */
    if (node === undefined) continue
    if (!isUserMessage(node.kind)) continue
    refs.push({ ordinal: refs.length + 1, preview: userMessagePreview(node.data) })
  }
  return refs
}

/**
 * Single-line text preview of one user/steering node payload: joined text
 * blocks with collapsed whitespace, capped length. The payload type lives in
 * another package's ChatNodeDataMap merge, so the read stays structural.
 * @param data - the Chat Node payload (a runtime message node).
 * @returns the preview text, or null when the message has no text block.
 */
export function userMessagePreview(data: unknown): string | null {
  const content = messageContent(data)
  const texts: string[] = []
  for (const block of content) {
    if (isTextBlock(block)) texts.push(block.text)
  }
  const joined = texts.join(' ').replace(/\s+/g, ' ').trim()
  if (joined === '') return null
  if (joined.length <= PREVIEW_MAX_CHARS) return joined
  return `${joined.slice(0, PREVIEW_MAX_CHARS - 1)}…`
}

/** Read a message node's content block array without assuming its declared type. */
function messageContent(data: unknown): readonly unknown[] {
  if (typeof data !== 'object' || data === null) return EMPTY_CONTENT
  const content = (data as { content?: unknown }).content
  return Array.isArray(content) ? content : EMPTY_CONTENT
}

function isTextBlock(block: unknown): block is { readonly type: 'text'; readonly text: string } {
  return typeof block === 'object' && block !== null
    && (block as { type?: unknown }).type === 'text'
    && typeof (block as { text?: unknown }).text === 'string'
}

/**
 * Clamp a window start so a full cell window always fits.
 * @param start - first visible ordinal minus 1.
 * @param total - number of user-sent messages.
 * @returns the clamped start; 0 whenever fewer than MAX_CELLS messages exist.
 */
export function clampWindowStart(start: number, total: number): number {
  return Math.max(0, Math.min(start, total - MAX_CELLS))
}

/**
 * Shift the visible window by one cell in a wheel direction.
 * @param start - current window start.
 * @param total - number of user-sent messages.
 * @param direction - +1 pages toward later messages, -1 toward earlier.
 * @returns the shifted, clamped start.
 */
export function shiftWindowStart(start: number, total: number, direction: 1 | -1): number {
  return clampWindowStart(start + direction, total)
}

/**
 * Nudge the window so the active cell stays visible after a scroll-driven
 * current change; a manual wheel offset survives while containment holds.
 * @param start - current window start.
 * @param current - active message index, or null while none is rendered.
 * @param total - number of user-sent messages.
 * @returns the adjusted start containing the active cell when it exists.
 */
export function followWindowStart(start: number, current: number | null, total: number): number {
  let next = clampWindowStart(start, total)
  if (current === null) return next
  if (current < next) next = current
  if (current >= next + MAX_CELLS) next = current - MAX_CELLS + 1
  return clampWindowStart(next, total)
}

/**
 * Rendered user-message rows inside the scrollport, in DOM (flow) order.
 * @param scrollport - the conversation scroll container.
 * @returns the flow rows whose kind is a user-sent message.
 */
export function userRows(scrollport: HTMLElement): readonly HTMLElement[] {
  const rows: HTMLElement[] = []
  for (const element of scrollport.querySelectorAll<HTMLElement>(`[${FLOW_KIND_ATTR}]`)) {
    const kind = element.dataset.chatFlowKind
    /* v8 ignore next -- a matched flow row always carries the attribute value */
    if (kind === undefined) continue
    if (isUserMessage(kind)) rows.push(element)
  }
  return rows
}

/**
 * A row's top edge relative to the scrollport's content origin.
 * @param row - rendered flow row.
 * @param scrollport - the conversation scroll container.
 * @returns the content-space offset, independent of the viewport position.
 */
export function flowTop(row: HTMLElement, scrollport: HTMLElement): number {
  return row.getBoundingClientRect().top - scrollport.getBoundingClientRect().top + scrollport.scrollTop
}

/**
 * Index of the user row currently at (or nearest above) the scrollport top.
 * @param scrollport - the conversation scroll container.
 * @returns the current user-row index, or -1 when none are rendered.
 */
export function activeIndex(scrollport: HTMLElement): number {
  const rows = userRows(scrollport)
  if (rows.length === 0) return -1
  let current = 0
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    /* v8 ignore next -- the loop index stays within the dense rows array */
    if (row === undefined) continue
    if (flowTop(row, scrollport) <= scrollport.scrollTop + TOP_GAP) current = index
  }
  return current
}

/**
 * Scroll the scrollport so a user row sits just below the top edge.
 * @param scrollport - the conversation scroll container.
 * @param row - the target user-message row.
 */
export function scrollToUserRow(scrollport: HTMLElement, row: HTMLElement): void {
  const top = Math.max(0, flowTop(row, scrollport) - TOP_GAP)
  scrollport.scrollTo({ top, behavior: 'smooth' })
}
