/**
 * SlgGameView: the live-stream room rendered as the whole `conversation`
 * surface. Pure presentation — the conversation (nodes/partial/running/blank)
 * and the session list arrive through the framework hooks
 * (`useSession`/`useSessions`/`useProjection`); every behavior verb (`send`/
 * `stop` and the model-selection face) arrives through the inject face.
 * Tapping a portrait hit zone swaps the expression and routes the reaction
 * line into the bottom speech bar, then reverts. The slot is session-maybe,
 * so the room stays mounted and reads absent while no session is current.
 * Session/workspace management stays in the native left sidebar; this room
 * renders no list panel of its own.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import clsx from 'clsx'
import type { ConversationNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the frame's SlotMap merge for the `conversation` seat.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pull the `sessionStats` SessionProjectionMap key merge.
import type {} from '@deepseek-ai/dsh-session-stats/client'
import { SLG_SETTINGS_DEFAULTS } from './stores.ts'
import type { createSlgSettingsStore, SlgDmRegion, SlgSettingsState } from './stores.ts'
import type { SlgKey } from './locales.ts'
import css from './SlgGameView.module.css'

/** Injected business face of the live-room entry: conversation verbs plus the model-selection face. */
export interface SlgGameViewInjected {
  /** Send one prompt into the current session. */
  send: (text: string) => Promise<void>
  /** Cancel the current session's in-flight turn. */
  stop: () => Promise<void>
  /**
   * Pull one older history page so the room's log and navigator cover the
   * whole conversation, not just the newest window.
   */
  loadOlder: () => Promise<void>
  /** Whether this session may switch models (false for addressed subagent sessions). */
  modelAvailable: boolean
  /** The session's shared model directory store (same instance the /model popup reads). */
  modelDirectory: SnapshotStore<ModelDirectoryState>
  /** Refresh the advisory model directory (fire-and-forget; errors land on the store). */
  loadModels: () => void
  /**
   * Select a complete provider/model/reasoning selection.
   * @param selection - model selection and optional adapter-owned effort.
   * @returns whether the host accepted the selection.
   */
  selectModel: (selection: ModelSelection) => Promise<boolean>
}

/** Full composed props: conversation runtime share (session-maybe) + locale + settings store + injected verbs. */
export type SlgGameViewProps = PropsRuntime<'conversation'> & PropsLocale<'slg'>
  & PropsStore<ReturnType<typeof createSlgSettingsStore>> & SlgGameViewInjected

/**
 * Portrait asset URLs. The Web shell serves `apps/web/public/` at the root, so
 * these absolute paths resolve once the images ship in that public dir.
 */
const PORTRAIT = {
  default: '/portraits/default.png',
  happy: '/portraits/happy.png',
  shy: '/portraits/shy.png',
  angry: '/portraits/angry.png',
  resentful: '/portraits/resentful.png',
  morbid: '/portraits/morbid.png',
  pain: '/portraits/pain.png',
} as const

/** One portrait expression. */
type Emotion = keyof typeof PORTRAIT

/** One tappable hit zone over the portrait: swaps to an expression and shows a line. */
interface PokeZone {
  readonly emotion: Exclude<Emotion, 'default'>
  readonly lineKey: SlgKey
  readonly style: Readonly<{ top: string; left: string; width: string; height: string }>
}

/** The six reaction zones, as percentages over the 2:3 portrait frame. */
const POKE_ZONES: readonly PokeZone[] = [
  { emotion: 'shy', lineKey: 'poke.shy', style: { top: '0%', left: '26%', width: '48%', height: '22%' } },
  { emotion: 'happy', lineKey: 'poke.happy', style: { top: '22%', left: '30%', width: '40%', height: '16%' } },
  { emotion: 'angry', lineKey: 'poke.angry', style: { top: '38%', left: '34%', width: '32%', height: '18%' } },
  { emotion: 'resentful', lineKey: 'poke.resentful', style: { top: '40%', left: '0%', width: '30%', height: '22%' } },
  { emotion: 'morbid', lineKey: 'poke.morbid', style: { top: '40%', left: '70%', width: '30%', height: '22%' } },
  { emotion: 'pain', lineKey: 'poke.pain', style: { top: '56%', left: '34%', width: '32%', height: '20%' } },
]

/** Milliseconds before a poke expression reverts to the default portrait. */
const POKE_REVERT_MS = 2400

/** Danmaku vertical lanes and scroll speed, tuned for a roughly constant px/s sweep. */
const DANMAKU_LANES = 4
const DANMAKU_MIN_MS = 3200
const DANMAKU_PER_CHAR_MS = 160

/** Danmaku display region. */
type DmRegion = SlgDmRegion

/** Region option → locale key. */
const DM_REGION_KEY: Record<DmRegion, SlgKey> = {
  top: 'dm.region.top',
  middle: 'dm.region.middle',
  bottom: 'dm.region.bottom',
}

/** Top fraction (0-1) where each danmaku region starts, and how far down it spans. */
const DM_REGION_START: Record<DmRegion, number> = { top: 0.04, middle: 0.2, bottom: 0.6 }
const DM_REGION_SPAN: Record<DmRegion, number> = { top: 0.26, middle: 0.5, bottom: 0.34 }

/** Characters of a thinking line shown before it is collapsed into a summary. */
const THINKING_PREVIEW = 120

/** Truncate a thinking line to its preview prefix (used for the summary-only display). */
function summarizeThinking(text: string): string {
  return text.length > THINKING_PREVIEW ? `${text.slice(0, THINKING_PREVIEW)}…` : text
}


/** One rendered conversation line: who said it and what. */
type Role = 'me' | 'mingya' | 'thinking' | 'tool'

/** One tool invocation's detail for the expandable "打赏" row. */
interface ToolDetail {
  readonly callId: string
  readonly argsRaw: string
  readonly resultText: string
  readonly isError: boolean
}

interface Line {
  readonly role: Role
  readonly text: string
  readonly seq: number
  /** Tool calls only: one entry per underlying call; its length equals the collapsed count. */
  readonly details: readonly ToolDetail[]
}

const SPEAKER_KEY: Record<Role, SlgKey> = {
  me: 'speaker.me',
  mingya: 'speaker.mingya',
  thinking: 'speaker.thinking',
  tool: 'speaker.tool',
}

/** Thousands-grouped integer, kept locale-independent for deterministic rendering. */
function formatCount(value: number): string {
  return value.toLocaleString('en-US')
}

/** Stable empty node list for the no-session reads (keeps memo identity flat). */
const EMPTY_NODES: readonly ConversationNode[] = []

/**
 * Flatten a session's nodes into speakable lines: user text, assistant text,
 * reasoning (thinking) blocks, and tool calls. Tool results are backfilled onto
 * their matching call head by callId so the row can expand into args + result.
 */
function deriveLines(nodes: readonly ConversationNode[]): readonly Line[] {
  const lines: Line[] = []
  const toolIndex = new Map<string, number>()
  for (const node of nodes) {
    switch (node.kind) {
      case 'user':
      case 'steering': {
        const text = node.content.filter(b => b.type === 'text').map(b => b.text).join('')
        if (text !== '') lines.push({ role: 'me', text, seq: node.seq, details: [] })
        break
      }
      case 'assistant': {
        for (const block of node.blocks) {
          if (block.kind === 'text' && block.text !== '') {
            lines.push({ role: 'mingya', text: block.text, seq: node.seq, details: [] })
          } else if (block.kind === 'reasoning' && block.text !== '') {
            lines.push({ role: 'thinking', text: block.text, seq: node.seq, details: [] })
          } else if (block.kind === 'tool-call') {
            lines.push({
              role: 'tool',
              text: block.name,
              seq: node.seq,
              details: [{ callId: block.callId, argsRaw: block.argsRaw, resultText: '', isError: false }],
            })
            toolIndex.set(block.callId, lines.length - 1)
          }
        }
        break
      }
      case 'tool-result': {
        const idx = node.call === null ? undefined : toolIndex.get(node.callId)
        const head = idx === undefined ? undefined : lines[idx]
        const detail = head?.details[0]
        if (head !== undefined && detail !== undefined && idx !== undefined) {
          const resultText = node.content.filter(b => b.type === 'text').map(b => b.text).join('')
          lines[idx] = { ...head, details: [{ ...detail, resultText, isError: node.isError }] }
        }
        break
      }
      default: break
    }
  }
  return lines
}

/** Merge each run of consecutive identical tool-call lines into one counted line, keeping every call's detail. */
function collapseToolRuns(lines: readonly Line[]): readonly Line[] {
  const collapsed: Line[] = []
  for (const line of lines) {
    const prev = collapsed[collapsed.length - 1]
    if (prev !== undefined && prev.role === 'tool' && line.role === 'tool' && prev.text === line.text) {
      collapsed[collapsed.length - 1] = { ...prev, seq: line.seq, details: [...prev.details, ...line.details] }
    } else {
      collapsed.push(line)
    }
  }
  return collapsed
}

/** Settings read/write face handed to the room body by its wrapper. */
interface SettingsFace {
  read: SlgSettingsState
  /** Baked action face exactly as the renderer binds it from the declared store. */
  write: Exclude<SlgGameViewProps['actions'], undefined>
}

/** Composed props minus the store seats — what the room body itself consumes. */
type RoomBaseProps = Omit<SlgGameViewProps, 'useStore' | 'actions'>

/**
 * Renders the live-stream room. The renderer omits the store seats while no
 * session is current (session-maybe), and adoption does not remount — so this
 * dispatcher stays hook-free and picks the settings source per incarnation:
 * the declared store once a seat exists, ephemeral local state before.
 * @param props - framework hooks, injected verbs, and the `slg` translate seat.
 */
export function SlgGameView(props: SlgGameViewProps) {
  // The composed type marks the seats required, but the renderer really omits
  // them pre-adoption — view them as optional for the honest runtime check.
  const seats = props as RoomBaseProps & Partial<Pick<SlgGameViewProps, 'useStore' | 'actions'>>
  const { useStore, actions } = seats
  if (useStore === undefined || actions === undefined) return <EphemeralRoom room={props} />
  return <StoredRoom useStore={useStore} actions={actions} room={props} />
}

/** Store-backed incarnation: settings survive remounts and reloads. */
function StoredRoom(props: {
  useStore: Exclude<SlgGameViewProps['useStore'], undefined>
  actions: Exclude<SlgGameViewProps['actions'], undefined>
  room: RoomBaseProps
}) {
  const values = props.useStore(s => s)
  // Persistence replaces state wholesale, so a payload written before a field
  // existed hydrates without it; heal the shape and write the repair back.
  const hydrated = values as Omit<SlgSettingsState, 'thinkHeight'> & { thinkHeight?: number }
  const stale = hydrated.thinkHeight === undefined
  const read = stale ? { ...values, thinkHeight: SLG_SETTINGS_DEFAULTS.thinkHeight } : values
  useEffect(() => {
    if (stale) props.actions.setThinkHeight(SLG_SETTINGS_DEFAULTS.thinkHeight)
  }, [stale, props.actions])
  return <RoomView {...props.room} settings={{ read, write: props.actions }} />
}

/** Pre-session incarnation: no store seat exists, so settings live and die with this mount. */
function EphemeralRoom(props: { room: RoomBaseProps }) {
  const [read, setRead] = useState(SLG_SETTINGS_DEFAULTS)
  const write = useMemo<SettingsFace['write']>(() => ({
    setHostName: (v) => { setRead(s => ({ ...s, hostName: v })) },
    setDmRegion: (v) => { setRead(s => ({ ...s, dmRegion: v })) },
    setDmDensity: (v) => { setRead(s => ({ ...s, dmDensity: v })) },
    setDmOpacity: (v) => { setRead(s => ({ ...s, dmOpacity: v })) },
    setDmFontSize: (v) => { setRead(s => ({ ...s, dmFontSize: v })) },
    setDmSpeed: (v) => { setRead(s => ({ ...s, dmSpeed: v })) },
    setGiftSpeed: (v) => { setRead(s => ({ ...s, giftSpeed: v })) },
    setDmStack: (v) => { setRead(s => ({ ...s, dmStack: v })) },
    setThinkHeight: (v) => { setRead(s => ({ ...s, thinkHeight: v })) },
  }), [])
  return <RoomView {...props.room} settings={{ read, write }} />
}

/** The room body: all presentation hooks live here, one incarnation per mount. */
function RoomView(props: RoomBaseProps & { settings: SettingsFace }) {
  const {
    useSession, useProjection, useSessions, sessionId,
    send, stop, loadOlder, t,
    modelAvailable, modelDirectory, loadModels, selectModel,
  } = props
  const [draft, setDraft] = useState('')
  const [danmakuOn, setDanmakuOn] = useState(true)
  const [giftOn, setGiftOn] = useState(true)
  const [emotion, setEmotion] = useState<Emotion>('default')
  const [reaction, setReaction] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Settings arrive through the wrapper's face: persisted store or ephemeral state.
  const settings = props.settings.read
  const hostName = settings.hostName !== '' ? settings.hostName : t('speaker.mingya')
  const setHostName = (v: string) => { props.settings.write.setHostName(v) }
  const setDmRegion = (v: DmRegion) => { props.settings.write.setDmRegion(v) }
  const setDmDensity = (v: number) => { props.settings.write.setDmDensity(v) }
  const setDmOpacity = (v: number) => { props.settings.write.setDmOpacity(v) }
  const setDmFontSize = (v: number) => { props.settings.write.setDmFontSize(v) }
  const setDmSpeed = (v: number) => { props.settings.write.setDmSpeed(v) }
  const setGiftSpeed = (v: number) => { props.settings.write.setGiftSpeed(v) }
  const setDmStack = (v: boolean) => { props.settings.write.setDmStack(v) }
  const dmRegion = settings.dmRegion
  const dmDensity = settings.dmDensity
  const dmOpacity = settings.dmOpacity
  const dmFontSize = settings.dmFontSize
  const dmSpeed = settings.dmSpeed
  const giftSpeed = settings.giftSpeed
  const dmStack = settings.dmStack
  const [sideWidth, setSideWidth] = useState(300)
  const [resizing, setResizing] = useState(false)
  const resizeStart = useRef({ x: 0, width: 0 })
  const [portraitX, setPortraitX] = useState(0)
  const [portraitY, setPortraitY] = useState(0)
  const [portraitScale, setPortraitScale] = useState(1)
  const dragRef = useRef({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 })
  const revertTimer = useRef<number | undefined>(undefined)

  // Session-maybe: every selected value is absent until a session is current.
  const noSession = sessionId === undefined
  const nodes = useSession(s => s.nodes) ?? EMPTY_NODES
  const partial = useSession(s => s.partial)
  const running = useSession(s => s.running) ?? false
  const blank = useSession(s => s.blank) ?? false
  const hasMore = useSession(s => s.hasMore) ?? false
  const loadingOlder = useSession(s => s.loadingOlder) ?? false
  const stats = useProjection('sessionStats')
  const sessionRows = useSessions(s => s.byId)

  // History pages in on demand, so the navigator covers the whole conversation.
  // A failed pull stops auto-paging (hasMore stays true; retry on session switch).
  const [olderFailed, setOlderFailed] = useState(false)
  useEffect(() => { setOlderFailed(false) }, [sessionId])
  useEffect(() => {
    if (hasMore && !loadingOlder && !olderFailed) {
      loadOlder().catch(() => { setOlderFailed(true) })
    }
  }, [hasMore, loadingOlder, olderFailed, loadOlder])

  /** Room title: the open conversation's label, so switching a member is visible; decorative default otherwise. */
  const roomTitle = sessionId === undefined ? undefined : sessionRows[sessionId]?.displayTitle

  const lines = useMemo(() => deriveLines(nodes), [nodes])

  /** The chat log collapses consecutive identical tool calls into one counted entry. */
  const chatLines = useMemo(() => collapseToolRuns(lines), [lines])

  /** Wheel dots stand for the viewer's own messages only; Mingya's lines get no marker. */
  const navLines = useMemo(() => chatLines.filter(line => line.role === 'me'), [chatLines])

  /** Chat-lines index of each wheel dot, so a click can anchor to the real row. */
  const navDots = useMemo(
    () => chatLines.flatMap((line, chatIndex) => line.role === 'me' ? [chatIndex] : []),
    [chatLines])

  /** Chat-list row element per line index — exact anchors for jumps and highlights. */
  const lineEls = useRef(new Map<number, HTMLElement>())
  const setLineEl = (i: number) => (el: HTMLElement | null) => {
    if (el === null) lineEls.current.delete(i)
    else lineEls.current.set(i, el)
  }

  /** Wheel-strip dot elements, for centering and center-hit tests. */
  const dotEls = useRef(new Map<number, HTMLElement>())
  const setDotEl = (i: number) => (el: HTMLElement | null) => {
    if (el === null) dotEls.current.delete(i)
    else dotEls.current.set(i, el)
  }
  const lastActiveRef = useRef<number | null>(null)

  /** Scroll the strip so dot i sits exactly in the middle of the viewport. */
  const centerOnDot = (i: number) => {
    const nav = navRef.current
    const dot = dotEls.current.get(i)
    if (nav === null || dot === undefined) return
    const navRect = nav.getBoundingClientRect()
    const dotRect = dot.getBoundingClientRect()
    const target = nav.scrollLeft + (dotRect.left + dotRect.width / 2 - (navRect.left + navRect.width / 2))
    nav.scrollLeft = Math.max(0, target)
  }

  /** The dot nearest the strip's horizontal center, or null when empty. */
  const activeFromStrip = (): number | null => {
    const nav = navRef.current
    if (nav === null) return null
    const navRect = nav.getBoundingClientRect()
    const center = navRect.left + navRect.width / 2
    let best: number | null = null
    let bestDist = Number.POSITIVE_INFINITY
    for (const [i, dot] of dotEls.current) {
      const rect = dot.getBoundingClientRect()
      const dist = Math.abs(rect.left + rect.width / 2 - center)
      if (dist < bestDist) {
        bestDist = dist
        best = i
      }
    }
    return best
  }

  /** Anchor the chat log on message i and mark its dot active. */
  const jumpToMessage = (i: number, center: boolean) => {
    const chatIndex = navDots[i]
    const row = chatIndex === undefined ? undefined : lineEls.current.get(chatIndex)
    const chat = chatListRef.current
    if (row === undefined || chat === null) return
    // Land the message at the viewport top so its answer follows in view.
    const delta = row.getBoundingClientRect().top - chat.getBoundingClientRect().top
    chat.scrollTop += delta - 8
    lastActiveRef.current = i
    setNavActive(i)
    if (center) centerOnDot(i)
  }

  const streamingText = useMemo(() =>
    (partial?.blocks ?? []).filter(b => b.kind === 'text').map(b => b.text).join(''),
  [partial])

  /** Live reasoning text streamed in the partial — the real "thinking" content. */
  const thinkingText = useMemo(() =>
    (partial?.blocks ?? []).filter(b => b.kind === 'reasoning').map(b => b.text).join(''),
  [partial])

  /** Stream decode rate in tok/s, shown beside the host name. */
  const tokPerSec = stats !== undefined && stats.decodeMs > 0
    ? stats.decodeTokens / (stats.decodeMs / 1000)
    : 0

  /** The bottom speech-bar content: reaction > streaming > live thinking > last speakable line > greeting. */
  const speech = useMemo<{ role: Role; text: string }>(() => {
    if (reaction !== null) return { role: 'mingya', text: reaction }
    if (running) {
      if (streamingText !== '') return { role: 'mingya', text: streamingText }
      // Real reasoning streams in place of the placeholder once chunks arrive.
      if (thinkingText !== '') return { role: 'thinking', text: thinkingText }
      return { role: 'mingya', text: t('speech.thinking') }
    }
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]
      if (line === undefined || line.role === 'tool') continue
      return line.role === 'thinking'
        ? { role: 'thinking', text: summarizeThinking(line.text) }
        : { role: line.role, text: line.text }
    }
    return { role: 'mingya', text: blank ? t('speech.greeting') : t('speech.awaiting') }
  }, [reaction, running, streamingText, thinkingText, lines, blank, t])

  // Danmaku is viewer chatter (spoken lines); gifts ride the same overlay as
  // danmaku instead of a bottom float. Both capped: chatter by density, gifts by 6.
  const danmaku = lines.filter(line => line.role === 'me' || line.role === 'mingya').slice(-dmDensity)
  const giftDanmaku = lines.filter(line => line.role === 'tool').slice(-6)
  const decodeTokens = stats?.decodeTokens ?? 0

  const speaker = (role: Role) => role === 'mingya' ? hostName : t(SPEAKER_KEY[role])

  /** Stable per locale revision, so MarkdownText's streaming cache survives chunks. */
  const codeLabels = useMemo(() => ({ copyLabel: t('copy'), copiedLabel: t('copied') }), [t])

  /**
   * Danmaku lane top within the chosen region. Stacked mode derives the lane
   * from the source seq (lanes may overlap); unstacked mode assigns each
   * on-screen line its own lane by render index so none overlap.
   */
  const danmakuTop = (seq: number, index: number) => {
    const start = DM_REGION_START[dmRegion]
    const span = DM_REGION_SPAN[dmRegion]
    const laneCount = dmStack ? DANMAKU_LANES : Math.max(1, danmaku.length)
    const lane = dmStack ? seq % DANMAKU_LANES : index
    return `${(start + (lane / Math.max(1, laneCount - 1)) * span) * 100}%`
  }

  const poke = (zone: PokeZone) => {
    setEmotion(zone.emotion)
    setReaction(t(zone.lineKey))
    window.clearTimeout(revertTimer.current)
    revertTimer.current = window.setTimeout(() => {
      setEmotion('default')
      setReaction(null)
    }, POKE_REVERT_MS)
  }

  // Drop any pending expression revert when the view unmounts.
  useEffect(() => () => { window.clearTimeout(revertTimer.current) }, [])

  const onPortraitMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, origX: portraitX, origY: portraitY }
  }
  const onPortraitWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.08 : 0.08
    setPortraitScale(s => Math.max(0.5, Math.min(3, s + delta)))
  }

  // Global drag listeners so the pointer can leave the portrait frame.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return
      setPortraitX(dragRef.current.origX + e.clientX - dragRef.current.startX)
      setPortraitY(dragRef.current.origY + e.clientY - dragRef.current.startY)
    }
    const onUp = () => { dragRef.current.active = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const submit = () => {
    const text = draft.trim()
    if (text === '' || running) return
    setDraft('')
    void send(text)
  }

  const chatListRef = useRef<HTMLDivElement | null>(null)
  const navRef = useRef<HTMLDivElement | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [navDragging, setNavDragging] = useState(false)
  const navDragStart = useRef({ x: 0, scroll: 0 })
  const [navHover, setNavHover] = useState<number | null>(null)
  const [navActive, setNavActive] = useState<number | null>(null)
  const [expandedTool, setExpandedTool] = useState<number | null>(null)
  const [expandedThinking, setExpandedThinking] = useState<number | null>(null)

  // Auto-stick to the bottom while already there; new lines land in view.
  useEffect(() => {
    const el = chatListRef.current
    if (el !== null && atBottom) el.scrollTop = el.scrollHeight
  }, [chatLines, atBottom])

  const onChatScroll = () => {
    const el = chatListRef.current
    if (el === null) return
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 24)
    syncActiveFromChat()
  }

  const scrollToBottom = () => {
    const el = chatListRef.current
    if (el !== null) el.scrollTop = el.scrollHeight
    setAtBottom(true)
  }

  /** Highlight the last dot whose message sits at/above the viewport top, and keep it centered. */
  const syncActiveFromChat = () => {
    const chat = chatListRef.current
    if (chat === null || navDots.length === 0) {
      lastActiveRef.current = null
      setNavActive(null)
      return
    }
    const chatTop = chat.getBoundingClientRect().top
    let active: number | null = null
    for (const [d, chatIndex] of navDots.entries()) {
      const row = lineEls.current.get(chatIndex)
      if (row === undefined) continue
      if (row.getBoundingClientRect().top <= chatTop + 24) active = d
    }
    if (active !== lastActiveRef.current) {
      lastActiveRef.current = active
      setNavActive(active)
      // The selected dot rides the middle of the strip as the log moves.
      if (active !== null) centerOnDot(active)
    }
  }

  /** Jump the chat log to the line a wheel dot stands for. */
  const jumpToDot = (i: number, clientX: number) => {
    // A drag ends over some dot too — only treat near-still presses as picks.
    if (Math.abs(clientX - navDragStart.current.x) > 4) return
    jumpToMessage(i, true)
  }

  /** Live dot pitch (dot + gap), so a wheel tick steps exactly one dot. */
  const dotPitch = (): number => {
    const first = dotEls.current.get(0)
    const second = dotEls.current.get(1)
    if (first === undefined || second === undefined) return 56
    return Math.abs(second.getBoundingClientRect().left - first.getBoundingClientRect().left) || 56
  }

  /** Vertical wheel steps the strip one dot per tick; the centered dot becomes the selection. */
  const onNavWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const nav = navRef.current
    if (nav === null) return
    const dir = Math.sign(e.deltaY)
    if (dir === 0) return
    nav.scrollLeft += dir * dotPitch()
    const i = activeFromStrip()
    if (i !== null) jumpToMessage(i, true)
  }

  const onNavMouseDown = (e: React.MouseEvent) => {
    setNavDragging(true)
    navDragStart.current = { x: e.clientX, scroll: navRef.current?.scrollLeft ?? 0 }
  }

  // Drag-to-scroll on the wheel strip while the button is held.
  useEffect(() => {
    if (!navDragging) return
    const onMove = (e: MouseEvent) => {
      const nav = navRef.current
      if (nav === null) return
      nav.scrollLeft = navDragStart.current.scroll - (e.clientX - navDragStart.current.x)
      const i = activeFromStrip()
      if (i !== null) jumpToMessage(i, false)
    }
    const onUp = () => {
      setNavDragging(false)
      if (lastActiveRef.current !== null) centerOnDot(lastActiveRef.current)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [navDragging])

  const onResizeDown = (e: React.MouseEvent) => {
    setResizing(true)
    resizeStart.current = { x: e.clientX, width: sideWidth }
  }

  useEffect(() => {
    if (!resizing) return
    const onMove = (e: MouseEvent) => {
      const w = Math.max(200, Math.min(600, resizeStart.current.width - (e.clientX - resizeStart.current.x)))
      setSideWidth(w)
    }
    const onUp = () => { setResizing(false) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [resizing])

  // Live thinking panel: persisted height, top-edge drag to resize, streaming auto-scroll.
  // Clamp guards against out-of-band stored values; the band matches the drag.
  const rawThinkHeight = settings.thinkHeight
  const thinkHeight = typeof rawThinkHeight === 'number' && Number.isFinite(rawThinkHeight)
    ? Math.min(360, Math.max(48, rawThinkHeight))
    : SLG_SETTINGS_DEFAULTS.thinkHeight
  const setThinkHeight = (v: number) => { props.settings.write.setThinkHeight(v) }
  const thinkScrollRef = useRef<HTMLDivElement | null>(null)
  const [thinkResizing, setThinkResizing] = useState(false)
  const thinkResizeStart = useRef({ y: 0, height: 0 })

  const onThinkResizeDown = (e: React.MouseEvent) => {
    setThinkResizing(true)
    thinkResizeStart.current = { y: e.clientY, height: thinkHeight }
  }

  useEffect(() => {
    if (!thinkResizing) return
    const onMove = (e: MouseEvent) => {
      // Dragging up grows the panel; clamp to a sane band.
      setThinkHeight(Math.max(48, Math.min(360, thinkResizeStart.current.height + (thinkResizeStart.current.y - e.clientY))))
    }
    const onUp = () => { setThinkResizing(false) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [thinkResizing])

  // Streaming reasoning sticks to the bottom like the chat log does.
  useEffect(() => {
    const el = thinkScrollRef.current
    if (el !== null) el.scrollTop = el.scrollHeight
  }, [speech.text, thinkHeight])

  /** Hovered wheel dot's preview, overlaid at card level — the scroll strip clips its children. */
  const hoverLine = navHover === null ? undefined : navLines[navHover]
  const hoverTip = hoverLine === undefined
    ? null
    : `${speaker(hoverLine.role)}：${hoverLine.text.length > 40 ? `${hoverLine.text.slice(0, 40)}…` : hoverLine.text}`

  // Strip geometry tracks the panel width, so its right edge aligns with the
  // chat log below while exactly 4.5 dots stay in view (4.5 pitches wide).
  const navWidth = Math.max(0, sideWidth - 26)
  const navPitch = navWidth / 4.5
  const navDotSize = Math.round(navPitch * 4 / 7)
  const navGap = navPitch - navDotSize
  const navPad = (navWidth - navDotSize) / 2

  return (
    <div className={css.root}>
      <div className={css.main}>
        {/* 直播画面 */}
        <div className={css.video}>
          <div className={css.hostInfo}>
            <button type="button" className={css.avatarBtn} aria-label={t('host.settings')} title={t('host.settings')} onClick={() => { setSettingsOpen(v => !v) }}>
              <img src={PORTRAIT.default} alt="" />
            </button>
            <div className={css.hostMeta}>
              <div className={css.name}>
                <button type="button" className={css.nameBtn} onClick={() => { setSettingsOpen(v => !v) }}>{hostName}</button>
                <span className={css.badge}>{t('host.live')}</span>
                <span className={css.tokSpeed}>{t('host.tokSpeed', { n: tokPerSec.toFixed(1) })}</span>
              </div>
              <div className={css.title}>{roomTitle ?? t('host.title')}</div>
            </div>
          </div>

          <div className={css.topRight}>
            <div className={css.tokBadge}>{t('host.tok', { n: formatCount(decodeTokens) })}</div>
            <button
              type="button"
              className={clsx(css.toggle, danmakuOn ? css.on : css.off)}
              aria-pressed={danmakuOn}
              onClick={() => { setDanmakuOn(v => !v) }}
            >
              {t('toggle.danmaku')}
            </button>
            <button
              type="button"
              className={clsx(css.toggle, giftOn ? css.on : css.off)}
              aria-pressed={giftOn}
              onClick={() => { setGiftOn(v => !v) }}
            >
              {t('toggle.gift')}
            </button>
            {modelAvailable && (
              <ModelSwitcher
                directory={modelDirectory}
                loadModels={loadModels}
                selectModel={selectModel}
                t={t}
              />
            )}
          </div>

          <div className={css.portraitFrame}
            style={{
              transform: `translate(${portraitX}px, ${portraitY}px) scale(${portraitScale})`,
              cursor: dragRef.current.active ? 'grabbing' : 'grab',
            }}
            onMouseDown={onPortraitMouseDown}
            onWheel={onPortraitWheel}
          >
            <img
              src={PORTRAIT[emotion]}
              alt={t('portrait.hint')}
              className={css.portraitImg}
              draggable={false}
            />
            <div className={css.pokeLayer}>
              {POKE_ZONES.map(zone => (
                <button
                  key={zone.emotion}
                  type="button"
                  className={css.pokeZone}
                  style={zone.style}
                  aria-label={t(zone.lineKey)}
                  title={t(zone.lineKey)}
                  onClick={() => { poke(zone) }}
                />
              ))}
            </div>
          </div>

          {(danmakuOn || giftOn) && (
            <div className={css.danmaku} role="log" aria-live="polite" style={{ opacity: dmOpacity }}>
              {danmakuOn && danmaku.map((line, i) => (
                <div
                  key={line.seq}
                  className={clsx(css.dm, css[line.role])}
                  style={{
                    top: danmakuTop(line.seq, i),
                    fontSize: `${dmFontSize}px`,
                    animationDuration: `${Math.max(DANMAKU_MIN_MS, line.text.length * DANMAKU_PER_CHAR_MS) / dmSpeed}ms`,
                  }}
                >
                  {`${speaker(line.role)}：${line.text}`}
                </div>
              ))}
              {giftOn && giftDanmaku.map((line, i) => (
                <div
                  key={`g${line.seq}`}
                  className={clsx(css.dm, css.giftDm)}
                  style={{
                    top: danmakuTop(line.seq, i),
                    fontSize: `${dmFontSize}px`,
                    animationDuration: `${Math.max(DANMAKU_MIN_MS, line.text.length * DANMAKU_PER_CHAR_MS) / giftSpeed}ms`,
                  }}
                >
                  {t('tool.called', { name: line.text })}
                </div>
              ))}
            </div>
          )}

          {settingsOpen && (
            <HostSettings
              hostName={hostName}
              setHostName={setHostName}
              dmRegion={dmRegion}
              setDmRegion={setDmRegion}
              dmDensity={dmDensity}
              setDmDensity={setDmDensity}
              dmOpacity={dmOpacity}
              setDmOpacity={setDmOpacity}
              dmFontSize={dmFontSize}
              setDmFontSize={setDmFontSize}
              dmSpeed={dmSpeed}
              setDmSpeed={setDmSpeed}
              giftSpeed={giftSpeed}
              setGiftSpeed={setGiftSpeed}
              dmStack={dmStack}
              setDmStack={setDmStack}
              t={t}
              onClose={() => { setSettingsOpen(false) }}
            />
          )}
        </div>

        {/* 视觉小说说话条 */}
        <div className={css.speechBar}>
          <span className={clsx(css.speakerTag, css[speech.role])}>{speaker(speech.role)}</span>
          {running && speech.role === 'thinking' ? (
            <div className={css.thinkWrap} style={{ height: `${thinkHeight}px` }}>
              <div
                className={clsx(css.thinkResize, thinkResizing && css.dragging)}
                onMouseDown={onThinkResizeDown}
              />
              <div className={css.speechBody} style={{ maxHeight: '100%' }} ref={thinkScrollRef}>
                {speech.text}
              </div>
            </div>
          ) : (
            <div className={css.speechBody}>
              {speech.text}
              {running && speech.role === 'mingya' && <span className={css.caret} aria-hidden />}
            </div>
          )}
        </div>

        {/* 底部输入条 */}
        <div className={css.inputLine}>
          <input
            value={draft}
            placeholder={t('input.placeholder')}
            disabled={noSession}
            onChange={(e) => { setDraft(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit() }}
          />
          <button
            type="button"
            className={running ? css.stop : css.send}
            disabled={noSession || (!running && draft.trim() === '')}
            onClick={running ? () => { void stop() } : submit}
          >
            {running ? t('input.stop') : t('input.send')}
          </button>
        </div>
      </div>

      {/* 右侧对话记录 */}
      <aside className={css.side} style={{ flex: `0 0 ${sideWidth}px` }}>
        <div
          className={clsx(css.sideHandle, resizing && css.dragging)}
          onMouseDown={onResizeDown}
        />
        <div className={css.card}>
          <h4>{t('chat.title')}<span className={css.tag}>{t('chat.realtime')}</span></h4>
          <div
            ref={navRef}
            className={css.nav}
            aria-label={t('chat.nav')}
            style={{
              height: `${navDotSize + 28}px`,
              cursor: navDragging ? 'grabbing' : 'grab',
              '--nav-dot': `${navDotSize}px`,
              '--nav-gap': `${navGap}px`,
              '--nav-pad': `${navPad}px`,
            } as React.CSSProperties}
            onWheel={onNavWheel}
            onMouseDown={onNavMouseDown}
            onMouseLeave={() => { setNavHover(null) }}
          >
            <div className={css.navTrack}>
              {navLines.map((line, i) => (
                <div
                  key={i}
                  ref={setDotEl(i)}
                  className={clsx(css.navDot, css[line.role], i === navActive && css.navDotOn)}
                  onMouseEnter={() => { setNavHover(i) }}
                  onClick={(e) => { jumpToDot(i, e.clientX) }}
                >
                  {i + 1}
                </div>
              ))}
            </div>
          </div>
          {hoverTip !== null && (
            <div className={css.navTip}>{hoverTip}</div>
          )}
          <div className={css.chatList} role="log" ref={chatListRef} onScroll={onChatScroll}>
            {chatLines.map((line, chatIndex) => line.role === 'thinking' ? (
              <div key={`t${line.seq}`} className={css.msg} ref={setLineEl(chatIndex)} data-line={chatIndex}>
                <span className={clsx(css.who, css.thinking)}>{speaker(line.role)}</span>
                <span className={css.thinkingText}>
                  {expandedThinking === line.seq ? line.text : summarizeThinking(line.text)}
                </span>
                {line.text.length > THINKING_PREVIEW && (
                  <button
                    type="button"
                    className={css.thinkingToggle}
                    onClick={() => { setExpandedThinking(expandedThinking === line.seq ? null : line.seq) }}
                  >
                    {expandedThinking === line.seq ? t('chat.collapse') : t('chat.expand')}
                  </button>
                )}
              </div>
            ) : line.role === 'tool' ? (
              <div key={`c${line.seq}`} className={css.msg} ref={setLineEl(chatIndex)} data-line={chatIndex}>
                <button
                  type="button"
                  className={css.toolRow}
                  aria-expanded={expandedTool === line.seq}
                  onClick={() => { setExpandedTool(expandedTool === line.seq ? null : line.seq) }}
                >
                  <span className={css.sys}>{t('tool.called', { name: line.text })} x{line.details.length}</span>
                </button>
                {expandedTool === line.seq && (
                  <div className={css.toolDetail}>
                    {line.details.map((detail, i) => (
                      <div key={detail.callId !== '' ? detail.callId : i} className={css.toolCall}>
                        <div className={css.toolArg}>{detail.argsRaw}</div>
                        <div className={clsx(css.toolResult, detail.isError && css.toolResultError)}>
                          {detail.resultText !== '' ? detail.resultText : '…'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : line.role === 'mingya' ? (
              <div key={line.seq} className={css.msg} ref={setLineEl(chatIndex)} data-line={chatIndex}>
                <span className={clsx(css.who, css[line.role])}>{speaker(line.role)}</span>
                <div className={css.txt}><MarkdownText text={line.text} codeLabels={codeLabels} /></div>
              </div>
            ) : (
              <div key={line.seq} className={css.msg} ref={setLineEl(chatIndex)} data-line={chatIndex}>
                <span className={clsx(css.who, css[line.role])}>{speaker(line.role)}</span>
                <span className={css.txt}>：{line.text}</span>
              </div>
            ))}
          </div>
          {!atBottom && (
            <button type="button" className={css.scrollBottom} onClick={scrollToBottom}>{t('chat.toBottom')}</button>
          )}
        </div>
      </aside>
    </div>
  )
}

/** Current-model display name resolved from the directory, falling back to the raw model id. */
function modelDisplayName(state: ModelDirectoryState): string | undefined {
  const current = state.current
  if (current === null) return undefined
  for (const group of state.groups) {
    for (const model of group.models) {
      if (model.id === current.model) return model.name
    }
  }
  return current.model
}

/**
 * The top-right model switcher: a trigger showing the current model plus a
 * dropdown listing the session's provider-grouped model directory and, for the
 * current route, its adapter-owned reasoning efforts. Data and submission ride
 * the shared ui-model-selection directory (same instance as the /model popup).
 */
function ModelSwitcher(props: {
  directory: SnapshotStore<ModelDirectoryState>
  loadModels: () => void
  selectModel: (selection: ModelSelection) => Promise<boolean>
  t: TranslateNS<'slg'>
}) {
  const { t } = props
  const state = useSyncExternalStore(
    fn => props.directory.subscribe(fn),
    () => props.directory.getSnapshot(),
  )
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Refresh the advisory directory on open unless a load is already in flight.
  useEffect(() => {
    if (open && state.status === 'idle') props.loadModels()
    // loadModels is a stable inject closure; status changes are the refresh trigger.
  }, [open, state.status])

  // Close on outside pointer-down or Escape.
  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const currentName = modelDisplayName(state)
  const currentModel = state.current
  const currentRoute = currentModel === null
    ? undefined
    : state.groups.flatMap(group => group.models).find(model => model.id === currentModel.model)

  const pick = (selection: ModelSelection) => {
    if (currentModel !== null
      && currentModel.provider === selection.provider
      && currentModel.model === selection.model
      && currentModel.reasoningEffort === selection.reasoningEffort) {
      setOpen(false)
      return
    }
    void props.selectModel(selection).then((accepted) => { if (accepted) setOpen(false) })
  }

  return (
    <div ref={rootRef} className={css.modelWrap}>
      <button
        type="button"
        className={clsx(css.toggle, css.modelTrigger)}
        aria-label={t('model.switchAria')}
        aria-haspopup="menu"
        aria-expanded={open}
        title={currentName ?? t('model.switch')}
        onClick={() => { setOpen(v => !v) }}
      >
        {currentName ?? t('model.switch')}
      </button>
      {open && (
        <div className={css.modelMenu} role="menu" aria-label={t('model.switchAria')}>
          {state.status === 'loading' && <div className={css.modelStatus}>{t('model.loading')}</div>}
          {state.status === 'error' && <div className={css.modelStatus}>{t('model.failed')}</div>}
          {state.groups.map(group => (
            <div key={group.id} className={css.modelGroup}>
              <div className={css.modelGroupTitle}>{group.name}</div>
              {group.models.map((model) => {
                const selected = currentModel !== null
                  && currentModel.provider === group.id
                  && currentModel.model === model.id
                return (
                  <button
                    key={model.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    className={clsx(css.modelOption, selected && css.modelOptionCurrent)}
                    title={model.description}
                    onClick={() => { pick({
                      provider: group.id,
                      model: model.id,
                      ...model.reasoning?.defaultEffort === undefined
                        ? {}
                        : { reasoningEffort: model.reasoning.defaultEffort },
                    }) }}
                  >
                    <span className={css.modelOptionMain}>
                      <span>{model.name}</span>
                      {model.description !== undefined && (
                        <span className={css.modelOptionDesc}>{model.description}</span>
                      )}
                    </span>
                    {selected && <span className={css.modelCheck}>✓</span>}
                  </button>
                )
              })}
            </div>
          ))}
          {state.status === 'ready' && state.groups.length === 0 && (
            <div className={css.modelStatus}>{t('model.empty')}</div>
          )}
          {currentModel !== null && currentRoute?.reasoning !== undefined
            && currentRoute.reasoning.efforts.length > 0 && (
            <div className={css.modelGroup}>
              <div className={css.modelGroupTitle}>{t('model.effort')}</div>
              {currentRoute.reasoning.efforts.map((level) => {
                const selectedEffort = currentModel.reasoningEffort === level.id
                  || (currentModel.reasoningEffort === undefined
                    && level.id === currentRoute.reasoning?.defaultEffort)
                return (
                  <button
                    key={level.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selectedEffort}
                    className={clsx(css.modelOption, selectedEffort && css.modelOptionCurrent)}
                    title={level.description}
                    onClick={() => { pick({
                      provider: currentModel.provider,
                      model: currentModel.model,
                      reasoningEffort: level.id,
                    }) }}
                  >
                    <span className={css.modelOptionMain}>
                      <span>{level.name}</span>
                      {level.description !== undefined && (
                        <span className={css.modelOptionDesc}>{level.description}</span>
                      )}
                    </span>
                    {selectedEffort && <span className={css.modelCheck}>✓</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The host/stream settings popover opened by clicking the avatar or the host
 * name: renames the streamer and tunes the danmaku region/density/opacity/font
 * size/speed. Presentation-only; every value rides the declared settings store.
 */
function HostSettings(props: {
  hostName: string
  setHostName: (v: string) => void
  dmRegion: DmRegion
  setDmRegion: (v: DmRegion) => void
  dmDensity: number
  setDmDensity: (v: number) => void
  dmOpacity: number
  setDmOpacity: (v: number) => void
  dmFontSize: number
  setDmFontSize: (v: number) => void
  dmSpeed: number
  setDmSpeed: (v: number) => void
  giftSpeed: number
  setGiftSpeed: (v: number) => void
  dmStack: boolean
  setDmStack: (v: boolean) => void
  t: TranslateNS<'slg'>
  onClose: () => void
}) {
  const { t } = props
  return (
    <div className={css.settings} role="dialog" aria-label={t('host.settings')}>
      <div className={css.settingsHead}>
        <span>{t('host.settings')}</span>
        <button type="button" className={css.settingsClose} aria-label={t('settings.close')} onClick={props.onClose}>×</button>
      </div>
      <label className={css.settingsField}>
        <span>{t('host.nameLabel')}</span>
        <input type="text" value={props.hostName} onChange={(e) => { props.setHostName(e.target.value) }} />
      </label>
      <div className={css.settingsField}>
        <span>{t('dm.region')}</span>
        <div className={css.regionGroup}>
          {(['top', 'middle', 'bottom'] as const).map(region => (
            <button
              key={region}
              type="button"
              className={clsx(css.regionBtn, props.dmRegion === region && css.regionBtnOn)}
              onClick={() => { props.setDmRegion(region) }}
            >
              {t(DM_REGION_KEY[region])}
            </button>
          ))}
        </div>
      </div>
      <label className={css.settingsField}>
        <span>{t('dm.density')}</span>
        <input type="range" min={1} max={12} step={1} value={props.dmDensity}
          onChange={(e) => { props.setDmDensity(Number(e.target.value)) }} />
      </label>
      <label className={css.settingsField}>
        <span>{t('dm.opacity')}</span>
        <input type="range" min={20} max={100} step={5} value={Math.round(props.dmOpacity * 100)}
          onChange={(e) => { props.setDmOpacity(Number(e.target.value) / 100) }} />
      </label>
      <label className={css.settingsField}>
        <span>{t('dm.fontSize')}</span>
        <input type="range" min={10} max={20} step={1} value={props.dmFontSize}
          onChange={(e) => { props.setDmFontSize(Number(e.target.value)) }} />
      </label>
      <label className={css.settingsField}>
        <span>{t('dm.speed')} x{props.dmSpeed.toFixed(1)}</span>
        <input type="range" min={10} max={200} step={10} value={Math.round(props.dmSpeed * 100)}
          onChange={(e) => { props.setDmSpeed(Number(e.target.value) / 100) }} />
      </label>
      <label className={css.settingsField}>
        <span>{t('gift.speed')} x{props.giftSpeed.toFixed(1)}</span>
        <input type="range" min={10} max={200} step={10} value={Math.round(props.giftSpeed * 100)}
          onChange={(e) => { props.setGiftSpeed(Number(e.target.value) / 100) }} />
      </label>
      <div className={css.settingsField}>
        <span>{t('dm.stack')}</span>
        <div className={css.regionGroup}>
          <button
            type="button"
            className={clsx(css.regionBtn, props.dmStack && css.regionBtnOn)}
            onClick={() => { props.setDmStack(true) }}
          >
            {t('dm.stack.on')}
          </button>
          <button
            type="button"
            className={clsx(css.regionBtn, !props.dmStack && css.regionBtnOn)}
            onClick={() => { props.setDmStack(false) }}
          >
            {t('dm.stack.off')}
          </button>
        </div>
      </div>
    </div>
  )
}
