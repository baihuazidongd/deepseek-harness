// @vitest-environment jsdom
/** Pure message-jump helpers over a jsdom scrollport: user-message detection,
 * per-message refs with previews, rendered-row extraction, the scroll target
 * math, and the visible five-cell window arithmetic. */
import { describe, expect, it, vi } from 'vitest'
import type { ChatConversationViewNode, ChatSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { EMPTY_CHAT_SNAPSHOT } from '@deepseek-ai/dsh-client-runtime/client'
import {
  MAX_CELLS, activeIndex, clampWindowStart, collectUserMessages, flowTop,
  followWindowStart, isUserMessage, scrollToUserRow, shiftWindowStart,
  userMessagePreview, userRows,
} from '../src/client/jump.ts'

function node(key: string, kind: string, data: unknown = undefined): ChatConversationViewNode {
  return {
    key, kind, id: key, target: 'chat', anchorSeq: 0,
    location: { kind: 'session' }, visibility: 'visible', data,
  }
}

function makeChat(kinds: readonly string[], datas: readonly unknown[] = []): ChatSnapshot {
  const order = kinds.map((_, index) => `k${index}`)
  const byKey = new Map(order.map((key, index) => [key, node(key, kinds[index]!, datas[index])]))
  return {
    ...EMPTY_CHAT_SNAPSHOT,
    order,
    nodes: { get: key => byKey.get(key), values: () => [...byKey.values()] },
  }
}

function rect(top: number): DOMRect {
  return {
    x: 0, y: top, width: 100, height: 24,
    top, right: 100, bottom: top + 24, left: 0,
    toJSON: () => ({}),
  } as DOMRect
}

function makeScrollport(kinds: readonly string[]): { scrollport: HTMLElement; rows: readonly HTMLElement[] } {
  const scrollport = document.createElement('div')
  scrollport.getBoundingClientRect = () => rect(0)
  const rows = kinds.map((kind) => {
    const row = document.createElement('div')
    row.dataset.chatFlowKind = kind
    scrollport.appendChild(row)
    return row
  })
  rows.forEach((row, index) => {
    // Model a real scrollport: the viewport top of a row is its content offset
    // minus the current scroll, so flowTop recovers the content offset.
    row.getBoundingClientRect = () => rect(index * 100 - scrollport.scrollTop)
  })
  return { scrollport, rows }
}

describe('jump helpers', () => {
  it('classifies only the user-sent message kinds', () => {
    expect(isUserMessage('user')).toBe(true)
    expect(isUserMessage('steering')).toBe(true)
    expect(isUserMessage('context')).toBe(false)
    expect(isUserMessage('assistant-step')).toBe(false)
  })

  it('collects dense user-message refs in render order, skipping other kinds', () => {
    const refs = collectUserMessages(makeChat(
      ['user', 'assistant-step', 'context', 'steering'],
      [
        { content: [{ type: 'text', text: '第一条' }] },
        undefined,
        undefined,
        { content: [{ type: 'text', text: '第二条' }] },
      ],
    ))
    expect(refs).toEqual([
      { ordinal: 1, preview: '第一条' },
      { ordinal: 2, preview: '第二条' },
    ])
  })

  it('collects nothing from an empty snapshot', () => {
    expect(collectUserMessages(makeChat([]))).toEqual([])
  })

  it('joins text blocks and collapses whitespace into one preview line', () => {
    const preview = userMessagePreview({
      content: [
        { type: 'text', text: '  第一段\n' },
        { type: 'image', attachment: {} },
        { type: 'text', text: '第二段\t继续' },
      ],
    })
    expect(preview).toBe('第一段 第二段 继续')
  })

  it('truncates long previews with an ellipsis at the cap', () => {
    const preview = userMessagePreview({ content: [{ type: 'text', text: 'a'.repeat(200) }] })
    expect(preview).toHaveLength(120)
    expect(preview!.endsWith('…')).toBe(true)
  })

  it('keeps a preview of exactly the cap length untruncated', () => {
    const preview = userMessagePreview({ content: [{ type: 'text', text: 'a'.repeat(120) }] })
    expect(preview).toBe('a'.repeat(120))
  })

  it('returns null when the payload carries no text block', () => {
    expect(userMessagePreview({ content: [{ type: 'image', attachment: {} }] })).toBeNull()
    expect(userMessagePreview({ content: [] })).toBeNull()
    expect(userMessagePreview({})).toBeNull()
    expect(userMessagePreview(undefined)).toBeNull()
    expect(userMessagePreview({ content: 'not-an-array' })).toBeNull()
  })

  it('extracts rendered user rows in DOM order', () => {
    const { scrollport } = makeScrollport(['user', 'assistant-step', 'steering', 'context'])
    const rows = userRows(scrollport)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.dataset.chatFlowKind).toBe('user')
    expect(rows[1]!.dataset.chatFlowKind).toBe('steering')
  })

  it('computes a row top in scrollport content coordinates', () => {
    const { scrollport, rows } = makeScrollport(['user', 'user'])
    scrollport.scrollTop = 40
    expect(flowTop(rows[1]!, scrollport)).toBe(100)
  })

  it('resolves the active index from the scrollport top', () => {
    const { scrollport } = makeScrollport(['user', 'user', 'user'])
    scrollport.scrollTop = 120
    expect(activeIndex(scrollport)).toBe(1)
  })

  it('returns -1 when no user rows are rendered', () => {
    const scrollport = document.createElement('div')
    expect(activeIndex(scrollport)).toBe(-1)
  })

  it('scrolls the target row just below the top edge', () => {
    const { scrollport, rows } = makeScrollport(['user', 'user'])
    const scrollTo = vi.fn()
    scrollport.scrollTo = scrollTo as unknown as typeof scrollport.scrollTo
    scrollToUserRow(scrollport, rows[1]!)
    expect(scrollTo).toHaveBeenCalledWith({ top: 92, behavior: 'smooth' })
  })
})

describe('cell window math', () => {
  it('clamps starts so a full window fits and keeps zero for short conversations', () => {
    expect(clampWindowStart(-3, 12)).toBe(0)
    expect(clampWindowStart(4, MAX_CELLS)).toBe(0)
    expect(clampWindowStart(9, 10)).toBe(5)
    expect(clampWindowStart(2, 4)).toBe(0)
  })

  it('shifts one cell per wheel step and stops at both ends', () => {
    expect(shiftWindowStart(0, 8, -1)).toBe(0)
    expect(shiftWindowStart(0, 8, 1)).toBe(1)
    expect(shiftWindowStart(1, 20, 1)).toBe(2)
    expect(shiftWindowStart(8, 8, 1)).toBe(3)
  })

  it('follows the active cell out of the window and keeps manual offsets otherwise', () => {
    // Active above the window pulls the start down onto it.
    expect(followWindowStart(4, 2, 20)).toBe(2)
    // Active past the window end parks it on the last full window holding it.
    expect(followWindowStart(0, 6, 20)).toBe(2)
    // Contained active cells leave a manual wheel offset alone.
    expect(followWindowStart(4, 6, 20)).toBe(4)
    // No active message just clamps.
    expect(followWindowStart(99, null, 7)).toBe(2)
  })
})
