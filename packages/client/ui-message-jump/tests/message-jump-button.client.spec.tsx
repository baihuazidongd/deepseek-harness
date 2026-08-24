// @vitest-environment jsdom
/**
 * MessageJumpButton behavior, driven purely through props: reads the user
 * message refs from the framework `useSession` hook, pages the visible
 * five-cell window on wheel, previews the hovered/focused message in a
 * tooltip, and scrolls the mocked conversation scrollport on click. No render
 * machinery beyond @testing-library/react.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ChatConversationViewNode, ChatSnapshot, ConversationSnapshot,
} from '@deepseek-ai/dsh-client-runtime/client'
import { EMPTY_CHAT_SNAPSHOT } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { MessageJumpButton } from '../src/client/MessageJumpButton.tsx'
import { zh } from '../src/client/locales.ts'

type Props = Parameters<typeof MessageJumpButton>[0]

const t = makeTranslate(zh, commonZh) as Props['t']

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  // The scrollports are appended to document.body directly, outside React's
  // container; clear them so each test owns the single [data-conversation-scroll].
  document.body.innerHTML = ''
})

function userNode(key: string, text: string): ChatConversationViewNode {
  return {
    key, kind: 'user', id: key, target: 'chat', anchorSeq: 0,
    location: { kind: 'session' }, visibility: 'visible',
    data: { content: [{ type: 'text', text }] },
  }
}

function otherNode(key: string, kind: string): ChatConversationViewNode {
  return {
    key, kind, id: key, target: 'chat', anchorSeq: 0,
    location: { kind: 'session' }, visibility: 'visible', data: undefined,
  }
}

/** Interleave one assistant row between the user messages, matching a real flow. */
function makeChat(users: readonly string[]): ChatSnapshot {
  const nodes: ChatConversationViewNode[] = []
  users.forEach((text, index) => {
    nodes.push(userNode(`u${index}`, text))
    nodes.push(otherNode(`a${index}`, 'assistant-step'))
  })
  const order = nodes.map(node => node.key)
  const byKey = new Map(nodes.map(node => [node.key, node]))
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

function useSession(chat: ChatSnapshot): SnapshotSelectorHook<ConversationSnapshot> {
  const snapshot = { chat } as ConversationSnapshot
  return selector => selector(snapshot)
}

interface Bench {
  scrollport: HTMLElement
  rows: readonly HTMLElement[]
  scrollTo: ReturnType<typeof vi.fn>
}

/** Mount a jsdom conversation scrollport with one flow row per node and mocked geometry. */
function mountScrollport(count: number): Bench {
  const scrollport = document.createElement('div')
  scrollport.dataset.conversationScroll = ''
  scrollport.getBoundingClientRect = () => rect(0)
  const kinds = Array.from({ length: count * 2 }, (_, index) => index % 2 === 0 ? 'user' : 'assistant-step')
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
  const scrollTo = vi.fn()
  scrollport.scrollTo = scrollTo as unknown as typeof scrollport.scrollTo
  document.body.appendChild(scrollport)
  return { scrollport, rows, scrollTo }
}

function renderWith(users: readonly string[], scrollTop = 0): Bench & { container: HTMLElement } {
  const bench = mountScrollport(users.length)
  bench.scrollport.scrollTop = scrollTop
  const view = render(<MessageJumpButton useSession={useSession(makeChat(users))} t={t} />)
  return { ...bench, container: view.container }
}

const cellName = (ordinal: number, total: number): string => t('cell.aria', { ordinal, total })

function cell(ordinal: number, total: number): HTMLElement {
  return screen.getByRole('button', { name: cellName(ordinal, total) })
}

/** Dispatch one wheel step over the group with a spyable preventDefault. */
function wheelOn(deltaY: number): ReturnType<typeof vi.fn> {
  const event = new Event('wheel', { cancelable: true })
  Object.assign(event, { deltaY })
  const preventDefault = vi.spyOn(event, 'preventDefault')
  act(() => {
    screen.getByRole('group', { name: t('group.aria') }).dispatchEvent(event)
  })
  return preventDefault
}

describe('MessageJumpButton', () => {
  it('renders nothing when the session has no user messages', () => {
    const { container } = renderWith([])
    expect(container.firstChild).toBeNull()
  })

  it('renders one numbered cell per user message when they fit the window', () => {
    renderWith(['你好', '继续'])
    expect(cell(1, 2).textContent).toBe('1')
    expect(cell(2, 2).textContent).toBe('2')
    expect(screen.queryByRole('button', { name: cellName(3, 2) })).toBeNull()
  })

  it('shows at most five cells for longer conversations', () => {
    renderWith(['一', '二', '三', '四', '五', '六', '七'])
    expect(cell(1, 7)).toBeTruthy()
    expect(cell(5, 7)).toBeTruthy()
    expect(screen.queryByRole('button', { name: cellName(6, 7) })).toBeNull()
  })

  it('marks the cell at the scrollport top edge as current', () => {
    renderWith(['一', '二', '三'], 250)
    expect(cell(2, 3).getAttribute('aria-current')).toBe('true')
    expect(cell(1, 3).getAttribute('aria-current')).toBeNull()
    expect(cell(3, 3).getAttribute('aria-current')).toBeNull()
  })

  it('jumps to the clicked message row in the scrollport', () => {
    const b = renderWith(['一', '二', '三'], 0)
    fireEvent.click(cell(3, 3))
    expect(b.scrollTo).toHaveBeenCalledWith({ top: 392, behavior: 'smooth' })
  })

  it('does nothing on click when the user rows are not in the DOM (non-chat view)', () => {
    const b = renderWith(['一', '二'], 0)
    b.rows.forEach(row => row.remove())
    fireEvent.click(cell(2, 2))
    expect(b.scrollTo).not.toHaveBeenCalled()
  })

  it('updates the current cell as the scrollport scrolls', () => {
    const b = renderWith(['一', '二', '三'], 0)
    expect(cell(1, 3).getAttribute('aria-current')).toBe('true')
    act(() => {
      b.scrollport.scrollTop = 450
      fireEvent.scroll(b.scrollport)
    })
    expect(cell(3, 3).getAttribute('aria-current')).toBe('true')
  })

  it('pages the window forward on wheel-down without scrolling the conversation', () => {
    const b = renderWith(['一', '二', '三', '四', '五', '六', '七'])
    const preventDefault = wheelOn(120)
    expect(preventDefault).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: cellName(1, 7) })).toBeNull()
    expect(cell(2, 7)).toBeTruthy()
    expect(cell(6, 7)).toBeTruthy()
    expect(b.scrollTo).not.toHaveBeenCalled()
  })

  it('clamps the window at the last full page and pages back on wheel-up', () => {
    renderWith(['一', '二', '三', '四', '五', '六', '七'])
    for (let page = 0; page < 5; page += 1) wheelOn(120)
    expect(cell(3, 7)).toBeTruthy()
    expect(cell(7, 7)).toBeTruthy()
    wheelOn(-120)
    expect(cell(2, 7)).toBeTruthy()
    expect(cell(6, 7)).toBeTruthy()
  })

  it('keeps a manual window offset while the active cell stays inside it', () => {
    const b = renderWith(['一', '二', '三', '四', '五', '六', '七'])
    wheelOn(120)
    act(() => {
      b.scrollport.scrollTop = 450
      fireEvent.scroll(b.scrollport)
    })
    // Active ordinal 3 lies inside the offset window 2..6, so nothing moves.
    expect(screen.queryByRole('button', { name: cellName(1, 7) })).toBeNull()
    expect(cell(2, 7).getAttribute('aria-current')).toBeNull()
    expect(cell(3, 7).getAttribute('aria-current')).toBe('true')
  })

  it('shifts the window so the active cell becomes visible past five messages', () => {
    renderWith(['一', '二', '三', '四', '五', '六', '七'], 1000)
    // Active ordinal 6 sits outside the initial window; follow parks it last.
    expect(screen.queryByRole('button', { name: cellName(1, 7) })).toBeNull()
    expect(cell(2, 7)).toBeTruthy()
    expect(cell(6, 7).getAttribute('aria-current')).toBe('true')
  })

  it('previews the focused cell message text in a tooltip', () => {
    renderWith(['帮我看看这个报错', '再跑一次'])
    act(() => {
      cell(1, 2).focus()
    })
    expect(screen.getByRole('tooltip').textContent).toBe('帮我看看这个报错')
    act(() => {
      cell(1, 2).blur()
    })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('falls back to placeholder copy for a message without text blocks', () => {
    const bench = mountScrollport(1)
    bench.scrollport.scrollTop = 0
    render(
      <MessageJumpButton
        useSession={useSession({
          ...EMPTY_CHAT_SNAPSHOT,
          order: ['u0'],
          nodes: {
            get: key => key === 'u0'
              ? {
                key: 'u0', kind: 'user', id: 'u0', target: 'chat', anchorSeq: 0,
                location: { kind: 'session' }, visibility: 'visible',
                data: { content: [{ type: 'image', attachment: {} }] },
              }
              : undefined,
            values: () => [],
          },
        })}
        t={t}
      />,
    )
    act(() => {
      cell(1, 1).focus()
    })
    expect(screen.getByRole('tooltip').textContent).toBe(t('preview.empty'))
  })

  it('previews on hover after the delay and hides on leave', () => {
    vi.useFakeTimers()
    renderWith(['悬停预览的消息内容'])
    fireEvent.mouseOver(cell(1, 1))
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.getByRole('tooltip').textContent).toBe('悬停预览的消息内容')
    fireEvent.mouseOut(cell(1, 1))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
