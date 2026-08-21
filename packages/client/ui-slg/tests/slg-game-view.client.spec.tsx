// @vitest-environment jsdom
/**
 * Props-direct presentation coverage for the live-stream room. The framework
 * hooks (`useSession`/`useProjection`/`useSessions`) are stubbed as
 * selector-callers, and every injected verb is a spy, so the tests exercise
 * pure rendering plus handler wiring without a renderer host.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConversationSnapshot, SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { SlgGameView, type SlgGameViewProps } from '../src/client/SlgGameView.tsx'
import { createSlgSettingsStore } from '../src/client/stores.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  // Settings stores hydrate from localStorage; keep tests order-independent.
  window.localStorage.clear()
})

const SID = 's-current' as SessionId

const STATS = {
  turns: 3, steps: 7, decodeTokens: 1234, llmMs: 1, toolMs: 1, ttftMs: 1, ttftSteps: 1, decodeMs: 1,
}

/** Minimal zh translate seat with `{name}`/`{n}` substitution. */
function t(key: string, params?: Record<string, string | number>): string {
  let s = (zh as Record<string, string>)[key] ?? key
  if (params !== undefined) {
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v))
  }
  return s
}

function userNode(seq: number, text: string) {
  return { kind: 'user', seq, time: 0, content: [{ type: 'text', text }], source: null }
}
function steeringNode(seq: number, text: string) {
  return { kind: 'steering', seq, time: 0, content: [{ type: 'text', text }], source: null }
}
function assistantNode(seq: number, text: string) {
  return { kind: 'assistant', seq, time: 0, turn: 1, step: 1, blocks: [{ kind: 'text', text }] }
}
function reasoningNode(seq: number, text: string) {
  return { kind: 'assistant', seq, time: 0, turn: 1, step: 1, blocks: [{ kind: 'reasoning', text }] }
}
function toolNode(seq: number, name: string) {
  return { kind: 'assistant', seq, time: 0, turn: 1, step: 1, blocks: [{ kind: 'tool-call', callId: `c${seq}`, name, argsRaw: '{}' }] }
}
function toolResultNode(seq: number, callId: string, text: string) {
  return {
    kind: 'tool-result', seq, time: 0, callId,
    call: { name: 'read', argsRaw: '{"path":"a.txt"}' }, callTime: null,
    content: [{ type: 'text', text }], isError: false, callView: null, resultView: null, subCalls: [],
  }
}
function contextNode(seq: number) {
  return { kind: 'context', seq, time: 0 }
}

function snapshot(over: Record<string, unknown> = {}): ConversationSnapshot {
  return { nodes: [], partial: null, running: false, blank: true, ...over } as unknown as ConversationSnapshot
}

interface Overrides {
  snap?: Record<string, unknown>
  stats?: unknown
  sessions?: { byId?: Record<string, unknown> }
  sessionId?: SessionId | undefined
  send?: (text: string) => Promise<void>
  stop?: () => Promise<void>
  loadOlder?: () => Promise<void>
  modelAvailable?: boolean
  modelDirectory?: ReturnType<typeof createSnapshotStore<ModelDirectoryState>>
  loadModels?: () => void
  selectModel?: (selection: { provider: string; model: string; reasoningEffort?: string }) => Promise<boolean>
  settings?: ReturnType<ReturnType<typeof createSlgSettingsStore>['create']>
}

function props(over: Overrides = {}): SlgGameViewProps {
  const snap = snapshot(over.snap)
  // `'sessionId' in over` distinguishes the no-session case from the default.
  const sessionId = 'sessionId' in over ? over.sessionId : SID
  const useSession = (sel: (s: ConversationSnapshot) => unknown) =>
    sessionId === undefined ? undefined : sel(snap)
  const useProjection = (key: string) => {
    if (key !== 'sessionStats') return undefined
    return 'stats' in over ? over.stats : STATS
  }
  const useSessions = (sel: (s: SessionListState) => unknown) => sel(
    { byId: over.sessions?.byId ?? {} } as unknown as SessionListState,
  )
  // Sanctioned zero-machinery store seat: a real settings store instance,
  // subscribed so store writes rerender like the renderer-bound hook.
  const settings = over.settings ?? createSlgSettingsStore().create()
  const useStore = (sel: (s: unknown) => unknown) =>
    sel(useSyncExternalStore(fn => settings.subscribe(fn), () => settings.getSnapshot()))
  return {
    sessionId,
    useSession,
    useProjection,
    useSessions,
    useStore,
    actions: settings.actions,
    send: over.send ?? vi.fn(() => Promise.resolve()),
    stop: over.stop ?? vi.fn(() => Promise.resolve()),
    loadOlder: over.loadOlder ?? vi.fn(() => Promise.resolve()),
    modelAvailable: over.modelAvailable ?? true,
    modelDirectory: over.modelDirectory ?? createSnapshotStore<ModelDirectoryState>({
      current: null, routable: null, groups: [], failures: [], status: 'idle', error: null,
    }),
    loadModels: over.loadModels ?? vi.fn(),
    selectModel: over.selectModel ?? vi.fn(() => Promise.resolve(true)),
    t,
  } as unknown as SlgGameViewProps
}

const portraitAlt = () => screen.getByAltText(zh['portrait.hint'])
const sendBtn = () => screen.getByRole('button', { name: zh['input.send'] })
const input = () => screen.getByPlaceholderText(zh['input.placeholder'])

describe('speech bar', () => {
  it('greets a blank session', () => {
    render(<SlgGameView {...props()} />)
    expect(screen.getByText(zh['speech.greeting'])).toBeDefined()
  })

  it('awaits when the session is not blank but empty', () => {
    render(<SlgGameView {...props({ snap: { blank: false } })} />)
    expect(screen.getByText(zh['speech.awaiting'])).toBeDefined()
  })

  it('shows the latest assistant text', () => {
    render(<SlgGameView {...props({ snap: { nodes: [userNode(1, '帮我查天气'), assistantNode(2, '杭州晴，20℃')] } })} />)
    expect(screen.getAllByText('杭州晴，20℃').length).toBeGreaterThan(0)
  })

  it('shows the latest user line when no assistant has spoken', () => {
    render(<SlgGameView {...props({ snap: { nodes: [userNode(1, '在吗？')] } })} />)
    expect(screen.getByText('在吗？')).toBeDefined()
  })

  it('streams the partial assistant text while running', () => {
    render(<SlgGameView {...props({ snap: { running: true, partial: { blocks: [{ kind: 'text', text: '正在生成……' }] } } })} />)
    expect(screen.getByText('正在生成……')).toBeDefined()
  })

  it('shows the thinking line while running with no partial text', () => {
    render(<SlgGameView {...props({ snap: { running: true, partial: { blocks: [] } } })} />)
    expect(screen.getByText(zh['speech.thinking'])).toBeDefined()
  })

  it('shows the last thinking line in the speech bar', () => {
    render(<SlgGameView {...props({ snap: { nodes: [reasoningNode(1, '让我想想……')] } })} />)
    expect(screen.getAllByText(zh['speaker.thinking']).length).toBeGreaterThan(0)
    expect(screen.getAllByText('让我想想……').length).toBeGreaterThan(0)
  })

  it('streams the real reasoning content in a resizable persisted panel', () => {
    const settings = createSlgSettingsStore().create()
    const mount = () => render(<SlgGameView {...props({
      snap: { running: true, partial: { blocks: [{ kind: 'reasoning', text: '真正的思考内容' }] } },
      settings,
    })} />)
    mount()
    expect(screen.getByText('真正的思考内容')).toBeDefined()
    // Default panel height: 4 rows (96px), set on the resizable wrapper.
    const body = screen.getByText('真正的思考内容') as HTMLElement
    const wrap = body.parentElement as HTMLElement
    expect(wrap.style.height).toBe('96px')
    // Dragging the top edge up grows the panel and persists through the store.
    fireEvent.mouseDown(wrap.firstElementChild as HTMLElement, { clientY: 200 })
    fireEvent.mouseMove(window, { clientY: 104 })
    fireEvent.mouseUp(window)
    expect(wrap.style.height).toBe('192px')
    cleanup()
    mount()
    const remounted = screen.getByText('真正的思考内容') as HTMLElement
    expect((remounted.parentElement as HTMLElement).style.height).toBe('192px')
  })

  it('shows the tok decode speed beside the host name', () => {
    render(<SlgGameView {...props({ stats: { ...STATS, decodeTokens: 100, decodeMs: 1000 } })} />)
    expect(screen.getByText('tok速度 100.0/s')).toBeDefined()
  })

  it('degrades the tok speed to zero without decode time', () => {
    render(<SlgGameView {...props({ stats: { ...STATS, decodeTokens: 100, decodeMs: 0 } })} />)
    expect(screen.getByText('tok速度 0.0/s')).toBeDefined()
  })

  it('auto-pages older history while the snapshot reports more pages', async () => {
    const loadOlder = vi.fn(() => Promise.resolve())
    const { rerender } = render(<SlgGameView {...props({ snap: { hasMore: true }, loadOlder })} />)
    await act(async () => {})
    expect(loadOlder).toHaveBeenCalledTimes(1)
    // In-flight page: no duplicate pull.
    rerender(<SlgGameView {...props({ snap: { hasMore: true, loadingOlder: true }, loadOlder })} />)
    await act(async () => {})
    expect(loadOlder).toHaveBeenCalledTimes(1)
    // Page settled with more history left: the loop pulls again.
    rerender(<SlgGameView {...props({ snap: { hasMore: true, loadingOlder: false }, loadOlder })} />)
    await act(async () => {})
    expect(loadOlder).toHaveBeenCalledTimes(2)
  })

  it('stops auto-paging after a failed pull and retries on session switch', async () => {
    const loadOlder = vi.fn(() => Promise.reject(new Error('offline')))
    const first = props({ snap: { hasMore: true }, loadOlder })
    const { rerender } = render(<SlgGameView {...first} />)
    await act(async () => {})
    expect(loadOlder).toHaveBeenCalledTimes(1)
    // Same session: the failed page is not hammered again.
    rerender(<SlgGameView {...props({ snap: { hasMore: true }, loadOlder })} />)
    await act(async () => {})
    expect(loadOlder).toHaveBeenCalledTimes(1)
  })

  it('does not pull history when the snapshot is complete', async () => {
    const loadOlder = vi.fn(() => Promise.resolve())
    render(<SlgGameView {...props({ loadOlder })} />)
    await act(async () => {})
    expect(loadOlder).not.toHaveBeenCalled()
  })

  it('jumps a clicked dot to its message row, not a proportional guess', () => {
    const nodes = [
      userNode(1, '第一问'),
      assistantNode(2, '答一'),
      userNode(3, '第二问'),
      assistantNode(4, '答二'),
    ]
    render(<SlgGameView {...props({ snap: { nodes } })} />)
    const chat = screen.getAllByRole('log').at(-1) as HTMLElement
    Object.defineProperty(chat, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(chat, 'clientHeight', { value: 200, configurable: true })
    chat.scrollTop = 300
    // Distinct row offsets: the viewer rows sit at viewport-y 500 and 700.
    const rows = chat.querySelectorAll<HTMLElement>('[data-line]')
    chat.getBoundingClientRect = () => ({ top: 100 }) as DOMRect
    rows[0]!.getBoundingClientRect = () => ({ top: 500 }) as DOMRect
    rows[2]!.getBoundingClientRect = () => ({ top: 700 }) as DOMRect
    const nav = screen.getByLabelText(zh['chat.nav'])
    // A still press (not a drag) picks the second dot.
    fireEvent.mouseDown(nav, { clientX: 50 })
    const dots = within(nav).getAllByText(/^\d+$/)
    fireEvent.click(dots[1]!, { clientX: 52 })
    // delta = 700 - 100 = 600; scrollTop = 300 + 600 - 8 = 892.
    expect(chat.scrollTop).toBe(892)
  })

  it('keeps the active dot centered while the log scrolls', () => {
    const nodes = [
      userNode(1, '一'), assistantNode(2, '答'),
      userNode(3, '二'), assistantNode(4, '答'),
      userNode(5, '三'),
    ]
    render(<SlgGameView {...props({ snap: { nodes } })} />)
    const chat = screen.getAllByRole('log').at(-1) as HTMLElement
    Object.defineProperty(chat, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(chat, 'clientHeight', { value: 200, configurable: true })
    chat.getBoundingClientRect = () => ({ top: 100 }) as DOMRect
    const rows = chat.querySelectorAll<HTMLElement>('[data-line]')
    // All three viewer rows sit above the viewport-top line, so dot 3 is active.
    rows[0]!.getBoundingClientRect = () => ({ top: 100 }) as DOMRect
    rows[2]!.getBoundingClientRect = () => ({ top: 90 }) as DOMRect
    rows[4]!.getBoundingClientRect = () => ({ top: 50 }) as DOMRect
    const nav = screen.getByLabelText(zh['chat.nav']) as HTMLElement
    nav.getBoundingClientRect = () => ({ left: 0, width: 240 }) as DOMRect
    const dots = within(nav).getAllByText(/^\d+$/)
    dots[2]!.getBoundingClientRect = () => ({ left: 300, width: 32 }) as DOMRect
    fireEvent.scroll(chat)
    // Centering dot 3: target = 0 + (300 + 16 - 240 / 2) = 196.
    expect(nav.scrollLeft).toBe(196)
  })

  it('wheel steps the strip and jumps the log to the centered message', () => {
    const nodes = [
      userNode(1, '一'), assistantNode(2, '答'),
      userNode(3, '二'), assistantNode(4, '答'),
      userNode(5, '三'),
    ]
    render(<SlgGameView {...props({ snap: { nodes } })} />)
    const chat = screen.getAllByRole('log').at(-1) as HTMLElement
    Object.defineProperty(chat, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(chat, 'clientHeight', { value: 200, configurable: true })
    chat.getBoundingClientRect = () => ({ top: 100 }) as DOMRect
    const rows = chat.querySelectorAll<HTMLElement>('[data-line]')
    rows[2]!.getBoundingClientRect = () => ({ top: 700 }) as DOMRect
    const nav = screen.getByLabelText(zh['chat.nav']) as HTMLElement
    nav.getBoundingClientRect = () => ({ left: 0, width: 240 }) as DOMRect
    const dots = within(nav).getAllByText(/^\d+$/)
    // Real 56px pitch; the mocked geometry is the post-step state, where dot 2
    // sits nearest the strip center.
    dots[0]!.getBoundingClientRect = () => ({ left: 36, width: 32 }) as DOMRect
    dots[1]!.getBoundingClientRect = () => ({ left: 92, width: 32 }) as DOMRect
    dots[2]!.getBoundingClientRect = () => ({ left: 148, width: 32 }) as DOMRect
    fireEvent.wheel(nav, { deltaY: 120 })
    // One tick advances exactly one 56px pitch — not the raw 120px deltaY.
    expect(nav.scrollLeft).toBe(44)
    // Dot 2 is now nearest the strip center: the log lands on its row…
    expect(chat.scrollTop).toBe(592)
  })

  it('renders the room without a store seat and keeps settings ephemeral', () => {
    // The renderer omits useStore/actions until a session is adopted.
    const seatless = props({
      snap: { running: true, partial: { blocks: [{ kind: 'reasoning', text: '无座椅思考' }] } },
    }) as Record<string, unknown>
    delete seatless.useStore
    delete seatless.actions
    render(<SlgGameView {...seatless as SlgGameViewProps} />)
    expect(screen.getByText('无座椅思考')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: zh['host.settings'] }))
    fireEvent.change(screen.getByLabelText(zh['host.nameLabel']), { target: { value: '临时' } })
    expect(screen.getByRole('button', { name: '临时' })).toBeDefined()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: zh['dm.region.top'] }))
    fireEvent.change(screen.getByLabelText(zh['dm.density']), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText(zh['dm.opacity']), { target: { value: '80' } })
    fireEvent.change(screen.getByLabelText(zh['dm.fontSize']), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText(`${zh['dm.speed']} x1.0`), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(`${zh['gift.speed']} x1.0`), { target: { value: '10' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: zh['dm.stack.off'] }))
    // The thinking panel still resizes against the ephemeral face.
    const body = screen.getByText('无座椅思考') as HTMLElement
    const wrap = body.parentElement as HTMLElement
    fireEvent.mouseDown(wrap.firstElementChild as HTMLElement, { clientY: 200 })
    fireEvent.mouseMove(window, { clientY: 152 })
    fireEvent.mouseUp(window)
    expect(wrap.style.height).toBe('144px')
  })

  it('heals a stale persisted payload that predates thinkHeight', async () => {
    const settings = createSlgSettingsStore().create()
    // Whole-value hydration of a pre-thinkHeight payload: the field is absent.
    settings.store.update((draft) => { delete (draft as { thinkHeight?: number }).thinkHeight })
    render(<SlgGameView {...props({
      snap: { running: true, partial: { blocks: [{ kind: 'reasoning', text: '思考内容' }] } },
      settings,
    })} />)
    const body = screen.getByText('思考内容') as HTMLElement
    // The panel still clamps to the 4-row default instead of growing unbounded.
    expect((body.parentElement as HTMLElement).style.height).toBe('96px')
    // The repair is written back so the stored shape is whole again.
    await act(async () => {})
    expect(settings.getSnapshot().thinkHeight).toBe(96)
  })
})

describe('portrait poke reactions', () => {
  it('routes the reaction line into the speech bar and swaps the expression', () => {
    render(<SlgGameView {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: zh['poke.angry'] }))
    expect(screen.getByText(zh['poke.angry'])).toBeDefined()
    expect((portraitAlt() as HTMLImageElement).src).toContain('/portraits/angry.png')
  })

  it('reverts the expression and reaction after the timer', () => {
    vi.useFakeTimers()
    render(<SlgGameView {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: zh['poke.shy'] }))
    expect((portraitAlt() as HTMLImageElement).src).toContain('/portraits/shy.png')
    act(() => { vi.advanceTimersByTime(2400) })
    expect((portraitAlt() as HTMLImageElement).src).toContain('/portraits/default.png')
    expect(screen.queryByText(zh['poke.shy'])).toBeNull()
    vi.useRealTimers()
  })
})

describe('tools, danmaku, and gifts', () => {
  it('shows tool calls as gift danmaku', () => {
    render(<SlgGameView {...props({ snap: { nodes: [toolNode(3, 'web_search')] } })} />)
    const danmaku = screen.getAllByRole('log').find(el => el.getAttribute('aria-live') === 'polite')!
    expect(within(danmaku).getByText(t('tool.called', { name: 'web_search' }))).toBeDefined()
  })

  it('hides the gift danmaku when gifts are off', () => {
    render(<SlgGameView {...props({ snap: { nodes: [toolNode(3, 'web_search')] } })} />)
    fireEvent.click(screen.getByRole('button', { name: zh['toggle.gift'] }))
    const danmaku = screen.getAllByRole('log').find(el => el.getAttribute('aria-live') === 'polite')!
    expect(within(danmaku).queryByText(t('tool.called', { name: 'web_search' }))).toBeNull()
  })

  it('hides the chatter danmaku when danmaku is off', () => {
    render(<SlgGameView {...props({ snap: { nodes: [userNode(1, '你好')] } })} />)
    expect(screen.getByText(`${t('speaker.me')}：你好`)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: zh['toggle.danmaku'] }))
    expect(screen.queryByText(`${t('speaker.me')}：你好`)).toBeNull()
  })

  it('shows gift danmaku alongside chatter danmaku', () => {
    render(<SlgGameView {...props({ snap: { nodes: [userNode(1, '你好'), toolNode(2, 'pwsh')] } })} />)
    const logs = screen.getAllByRole('log')
    const danmaku = logs.find(el => el.getAttribute('aria-live') === 'polite')!
    const chat = logs.find(el => el.getAttribute('aria-live') === null)!
    expect(within(danmaku).getByText(`${t('speaker.me')}：你好`)).toBeDefined()
    expect(within(danmaku).getByText(t('tool.called', { name: 'pwsh' }))).toBeDefined()
    expect(within(chat).getByText(`${t('tool.called', { name: 'pwsh' })} x1`)).toBeDefined()
  })

  it('collapses consecutive identical tool calls into a counted line', () => {
    render(<SlgGameView {...props({ snap: { nodes: [
      toolNode(1, 'read'), toolNode(2, 'read'), toolNode(3, 'edit'), toolNode(4, 'edit'), toolNode(5, 'edit'), toolNode(6, 'read'),
    ] } })} />)
    const chat = screen.getAllByRole('log').find(el => el.getAttribute('aria-live') === null)!
    expect(within(chat).getByText(`${t('tool.called', { name: 'read' })} x2`)).toBeDefined()
    expect(within(chat).getByText(`${t('tool.called', { name: 'edit' })} x3`)).toBeDefined()
    expect(within(chat).getByText(`${t('tool.called', { name: 'read' })} x1`)).toBeDefined()
  })

  it('renders the tok spend from the sessionStats projection', () => {
    render(<SlgGameView {...props()} />)
    expect(screen.getByText(t('host.tok', { n: '1,234' }))).toBeDefined()
  })

  it('shows zero tok when the sessionStats projection is absent', () => {
    render(<SlgGameView {...props({ stats: undefined })} />)
    expect(screen.getByText(t('host.tok', { n: '0' }))).toBeDefined()
  })

  it('shows the current conversation title as the room title', () => {
    render(<SlgGameView {...props({ sessions: {
      byId: { [SID]: { id: SID, displayTitle: '天气查询', running: false, blank: false, updatedAt: '' } },
    } })} />)
    expect(screen.getByText('天气查询')).toBeDefined()
  })

  it('falls back to the decorative room title with no session row', () => {
    render(<SlgGameView {...props()} />)
    expect(screen.getByText(zh['host.title'])).toBeDefined()
  })
})

describe('input and send', () => {
  it('forwards a trimmed draft and clears it', () => {
    const send = vi.fn(() => Promise.resolve())
    render(<SlgGameView {...props({ send })} />)
    fireEvent.change(input(), { target: { value: '  你好  ' } })
    fireEvent.click(sendBtn())
    expect(send).toHaveBeenCalledWith('你好')
    expect((input() as HTMLInputElement).value).toBe('')
  })

  it('ignores an empty draft', () => {
    const send = vi.fn(() => Promise.resolve())
    render(<SlgGameView {...props({ send })} />)
    fireEvent.click(sendBtn())
    expect(send).not.toHaveBeenCalled()
  })

  it('offers stop instead of send while running', () => {
    const send = vi.fn(() => Promise.resolve())
    const stop = vi.fn(() => Promise.resolve())
    render(<SlgGameView {...props({ send, stop, snap: { running: true } })} />)
    fireEvent.click(screen.getByRole('button', { name: zh['input.stop'] }))
    expect(stop).toHaveBeenCalledTimes(1)
    expect(send).not.toHaveBeenCalled()
  })

  it('submits on Enter but not while composing', () => {
    const send = vi.fn(() => Promise.resolve())
    render(<SlgGameView {...props({ send })} />)
    fireEvent.change(input(), { target: { value: 'hi' } })
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true })
    expect(send).not.toHaveBeenCalled()
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: false })
    expect(send).toHaveBeenCalledWith('hi')
  })

  it('ignores Enter with an empty draft', () => {
    const send = vi.fn(() => Promise.resolve())
    render(<SlgGameView {...props({ send })} />)
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: false })
    expect(send).not.toHaveBeenCalled()
  })

  it('ignores Enter while running', () => {
    const send = vi.fn(() => Promise.resolve())
    render(<SlgGameView {...props({ send, snap: { running: true } })} />)
    fireEvent.change(input(), { target: { value: 'hi' } })
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: false })
    expect(send).not.toHaveBeenCalled()
  })
})

describe('line derivation', () => {
  it('ignores empty user text and non-speech node kinds', () => {
    render(<SlgGameView {...props({ snap: { nodes: [userNode(1, ''), contextNode(2), steeringNode(3, '换个方向')] } })} />)
    expect(screen.getByText('换个方向')).toBeDefined()
  })

  it('ignores empty assistant text blocks', () => {
    render(<SlgGameView {...props({ snap: { nodes: [assistantNode(1, '')] } })} />)
    expect(screen.getByText(zh['speech.greeting'])).toBeDefined()
  })
})

describe('no-session state', () => {
  it('renders the room shell and disables input while no session is current', () => {
    render(<SlgGameView {...props({ sessionId: undefined })} />)
    expect(screen.getByText(zh['speech.awaiting'])).toBeDefined()
    expect(portraitAlt()).toBeDefined()
    expect((input() as HTMLInputElement).disabled).toBe(true)
    expect((sendBtn() as HTMLButtonElement).disabled).toBe(true)
  })
})

const MODEL_GROUPS = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    models: [
      { id: 'deepseek-v4-flash-0731', name: 'DeepSeek V4 Flash' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', description: '旗舰推理' },
    ],
  },
] as const

function modelDir(current: { provider: string; model: string; reasoningEffort?: string } | null) {
  return createSnapshotStore<ModelDirectoryState>({
    current,
    routable: true,
    groups: MODEL_GROUPS as never,
    failures: [],
    status: 'ready',
    error: null,
  })
}

const modelTrigger = () => screen.getByRole('button', { name: zh['model.switchAria'] })

describe('model switcher', () => {
  it('shows the current model and selects another from the menu', async () => {
    const selectModel = vi.fn(() => Promise.resolve(true))
    render(<SlgGameView {...props({
      modelDirectory: modelDir({ provider: 'deepseek', model: 'deepseek-v4-flash-0731' }),
      selectModel,
    })} />)
    expect(modelTrigger().textContent).toBe('DeepSeek V4 Flash')
    fireEvent.click(modelTrigger())
    expect(screen.getByText('DeepSeek V4 Pro')).toBeDefined()
    fireEvent.click(screen.getByRole('menuitemradio', { name: /DeepSeek V4 Pro/ }))
    await act(async () => {})
    expect(selectModel).toHaveBeenCalledWith({ provider: 'deepseek', model: 'deepseek-v4-pro' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('keeps the menu open when selection is rejected', async () => {
    const selectModel = vi.fn(() => Promise.resolve(false))
    render(<SlgGameView {...props({
      modelDirectory: modelDir({ provider: 'deepseek', model: 'deepseek-v4-flash-0731' }),
      selectModel,
    })} />)
    fireEvent.click(modelTrigger())
    fireEvent.click(screen.getByRole('menuitemradio', { name: /DeepSeek V4 Pro/ }))
    expect(selectModel).toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeDefined()
  })

  it('renders no switcher when model switching is unavailable', () => {
    render(<SlgGameView {...props({ modelAvailable: false })} />)
    expect(screen.queryByRole('button', { name: zh['model.switchAria'] })).toBeNull()
  })
})

describe('thinking and tool details', () => {
  it('shows a reasoning line in the chat log', () => {
    render(<SlgGameView {...props({ snap: { nodes: [reasoningNode(1, '让我先想想'), assistantNode(2, '答案是 42')] } })} />)
    expect(screen.getByText('让我先想想')).toBeDefined()
    expect(screen.getAllByText('答案是 42').length).toBeGreaterThan(0)
  })

  it('summarizes long thinking and expands it on demand', () => {
    const longThinking = '想'.repeat(200)
    render(<SlgGameView {...props({ snap: { nodes: [reasoningNode(1, longThinking)] } })} />)
    expect(screen.getAllByText(`${'想'.repeat(120)}…`).length).toBeGreaterThan(0)
    expect(screen.queryByText(longThinking)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: zh['chat.expand'] }))
    expect(screen.getByText(longThinking)).toBeDefined()
  })

  it('renders assistant Markdown formatting', () => {
    render(<SlgGameView {...props({ snap: { nodes: [assistantNode(1, '## 标题内容\n\n**加粗文字**')] } })} />)
    expect(screen.getByRole('heading', { name: '标题内容' })).toBeDefined()
    expect(screen.getByText('加粗文字')).toBeDefined()
  })

  it('expands a tool call to show its arguments and result', () => {
    render(<SlgGameView {...props({ snap: { nodes: [toolNode(1, 'read'), toolResultNode(2, 'c1', '文件内容')] } })} />)
    const row = screen.getByRole('button', { name: `${t('tool.called', { name: 'read' })} x1` })
    expect(screen.queryByText('文件内容')).toBeNull()
    fireEvent.click(row)
    expect(screen.getByText('文件内容')).toBeDefined()
    expect(screen.getByText('{}')).toBeDefined()
  })
})

describe('host settings', () => {
  it('opens settings from the avatar and renames the streamer', () => {
    render(<SlgGameView {...props()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: zh['host.settings'] }))
    expect(screen.getByRole('dialog')).toBeDefined()
    const input = screen.getByLabelText(zh['host.nameLabel']) as HTMLInputElement
    fireEvent.change(input, { target: { value: '小鲸' } })
    expect(input.value).toBe('小鲸')
    expect(screen.getAllByText('小鲸').length).toBeGreaterThan(0)
  })

  it('offers a danmaku stacking toggle in the settings popover', () => {
    render(<SlgGameView {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: zh['host.settings'] }))
    expect(screen.getByRole('button', { name: zh['dm.stack.on'] })).toBeDefined()
    expect(screen.getByRole('button', { name: zh['dm.stack.off'] })).toBeDefined()
  })

  it('shows current speed multipliers, drives every setting, and keeps them across remounts', () => {
    const settings = createSlgSettingsStore().create()
    const open = () => {
      render(<SlgGameView {...props({ settings })} />)
      fireEvent.click(screen.getByRole('button', { name: zh['host.settings'] }))
    }
    open()
    // Speed labels carry the live multiplier after the text.
    expect(screen.getByText(`${zh['dm.speed']} x1.0`)).toBeDefined()
    expect(screen.getByText(`${zh['gift.speed']} x1.0`)).toBeDefined()
    fireEvent.change(screen.getByLabelText(zh['host.nameLabel']), { target: { value: '小鲸' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: zh['dm.region.top'] }))
    fireEvent.change(screen.getByLabelText(zh['dm.density']), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText(zh['dm.opacity']), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText(zh['dm.fontSize']), { target: { value: '16' } })
    // The low end reaches x0.1 on both speed sliders.
    fireEvent.change(screen.getByLabelText(`${zh['dm.speed']} x1.0`), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(`${zh['gift.speed']} x1.0`), { target: { value: '10' } })
    expect(screen.getByText(`${zh['gift.speed']} x0.1`)).toBeDefined()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: zh['dm.stack.off'] }))
    cleanup()
    // Same store instance, fresh mount: every setting survived the remount.
    open()
    const name = screen.getByLabelText(zh['host.nameLabel']) as HTMLInputElement
    expect(name.value).toBe('小鲸')
    expect(screen.getByText(`${zh['gift.speed']} x0.1`)).toBeDefined()
    const density = screen.getByLabelText(zh['dm.density']) as HTMLInputElement
    expect(density.value).toBe('3')
    const opacity = screen.getByLabelText(zh['dm.opacity']) as HTMLInputElement
    expect(opacity.value).toBe('50')
    const fontSize = screen.getByLabelText(zh['dm.fontSize']) as HTMLInputElement
    expect(fontSize.value).toBe('16')
  })
})

describe('chat scrolling', () => {
  // The chat list is the last `log` region on the page (the danmaku overlay is first).
  const chatLog = () => screen.getAllByRole('log').at(-1)!

  it('shows a back-to-bottom button when scrolled up', () => {
    render(<SlgGameView {...props({ snap: { nodes: [userNode(1, '你好'), assistantNode(2, '你好呀')] } })} />)
    const chat = chatLog()
    Object.defineProperty(chat, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(chat, 'clientHeight', { value: 100, configurable: true })
    chat.scrollTop = 0
    expect(screen.queryByText(zh['chat.toBottom'])).toBeNull()
    fireEvent.scroll(chat)
    expect(screen.getByText(zh['chat.toBottom'])).toBeDefined()
  })

  it('auto-scrolls to the bottom on new lines while pinned', () => {
    const { rerender } = render(<SlgGameView {...props({ snap: { nodes: [userNode(1, '你好')] } })} />)
    const chat = chatLog()
    Object.defineProperty(chat, 'scrollHeight', { value: 500, configurable: true })
    rerender(<SlgGameView {...props({ snap: { nodes: [userNode(1, '你好'), assistantNode(2, '你好呀')] } })} />)
    expect(chat.scrollTop).toBe(500)
  })
})
