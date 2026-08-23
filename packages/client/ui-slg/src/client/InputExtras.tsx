/**
 * Input-line extras fed by the session snapshot's projection seats: the
 * context-occupancy ring (`contextPressure` + `contextBreakdown`, the same
 * provider figures the composer's meter renders), the plan-mode exit chip
 * (`plan` projection, /plan off through the session command verb), and the
 * slash-command discovery menu (the host command directory). All three render
 * nothing while their projection or catalog is absent, so a deployment
 * without the owning unit keeps the room unchanged.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import type { UseProjection } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the `contextPressure` / `contextBreakdown` projection key merges.
import type {} from '@deepseek-ai/dsh-token-meter/client'
// Type-only: the `plan` projection key merge.
import type {} from '@deepseek-ai/dsh-plan-mode/client'
import type { ContextPressureProjection } from '@deepseek-ai/dsh-token-meter/client'
import type { PlanProjection } from '@deepseek-ai/dsh-plan-mode/client'
import type { CommandDescriptor } from '@deepseek-ai/dsh-commands/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SlgGameView.module.css'

/** The room chip's translate seat: the `slg` locale namespace bound by the renderer. */
type SlgTranslate = PropsLocale<'slg'>['t']

/**
 * Compact token count: 517 / 12.2K / 1.2M (the TUI's rounding, replicated —
 * the conversation package's helper is not importable across plugins).
 * @param n - token count.
 * @returns display string.
 */
function formatTokens(n: number): string {
  const scaled = (v: number): string =>
    v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${scaled(n / 1_000)}K`
  return `${scaled(n / 1_000_000)}M`
}

/** Occupancy figure with its numerator and denominator, or null until both are known. */
interface Occupancy {
  percent: number
  usedTokens: number
  contextWindow: number
}

/**
 * Approximate context occupancy over the pressure projection: the numerator
 * is `projectedTokens` (the carried-forward provider sample) falling back to
 * the bare `pressureTokens` sample, integer-rounded and clamped like the
 * TUI's figure.
 * @param pressure - the session's context-pressure projection value.
 * @returns occupancy, or null until a numerator and a capacity both exist.
 */
function occupancyOf(pressure: ContextPressureProjection | undefined): Occupancy | null {
  const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens
  if (usedTokens === undefined || pressure?.contextWindow === undefined) return null
  return {
    percent: Math.min(100, Math.round(usedTokens / pressure.contextWindow * 100)),
    usedTokens,
    contextWindow: pressure.contextWindow,
  }
}

/** Ring geometry: 14px viewBox, 2px stroke. */
const RADIUS = 5.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** Panel legend rows in bar-segment order; each color class carries the shared tint. */
const BREAKDOWN_ROWS = [
  { key: 'systemTokens', label: 'context.system', color: css.colorSystem },
  { key: 'toolsTokens', label: 'context.tools', color: css.colorTools },
  { key: 'messageTokens', label: 'context.messages', color: css.colorMessages },
] as const

/**
 * The context-occupancy ring beside the send button, with a click-open
 * breakdown panel. Renders nothing until a provider reports both a numerator
 * and a route capacity; the breakdown rows render only while the heuristic
 * composition projection exists.
 * @param props - the projection read seat plus the locale seat.
 */
export function ContextRing({ useProjection, t }: { useProjection: UseProjection; t: SlgTranslate }) {
  const pressure = useProjection('contextPressure')
  const breakdown = useProjection('contextBreakdown')
  const [open, setOpen] = useState(false)
  const occupancy = occupancyOf(pressure)
  const breakdownTotal = breakdown === undefined
    ? 0
    : breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens
  const segments = useMemo(() => {
    if (occupancy === null) return []
    if (breakdown === undefined || breakdownTotal === 0) {
      return [{ key: 'total', color: undefined, width: occupancy.percent }]
    }
    return BREAKDOWN_ROWS
      .map(row => ({ key: row.key, color: row.color, width: occupancy.percent * breakdown[row.key] / breakdownTotal }))
      .filter(part => part.width > 0)
  }, [occupancy, breakdown, breakdownTotal])
  if (occupancy === null) return null
  const reading = `${occupancy.percent}%`
  return (
    <span className={css.ringWrap}>
      <button
        type="button"
        className={css.ringTrigger}
        aria-label={t('context.aria', { percent: reading })}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t('context.aria', { percent: reading })}
        onClick={() => { setOpen(!open) }}
      >
        <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden>
          <circle className={css.ringTrack} cx="7" cy="7" r={RADIUS} />
          <circle
            className={css.ringFill}
            cx="7"
            cy="7"
            r={RADIUS}
            strokeDasharray={`${CIRCUMFERENCE * occupancy.percent / 100} ${CIRCUMFERENCE}`}
            transform="rotate(-90 7 7)"
          />
        </svg>
      </button>
      {open && (
        <div className={css.contextPanel} role="dialog" aria-label={t('context.used')}>
          <div className={css.contextHead}>
            <span className={css.contextPercent}>{reading}</span>
            <span className={css.contextFigures}>
              {`~${formatTokens(occupancy.usedTokens)} / ${formatTokens(occupancy.contextWindow)}`}
            </span>
          </div>
          <div className={css.contextBar}>
            {segments.map(segment => (
              <div
                key={segment.key}
                className={segment.color === undefined ? css.contextSegment : `${css.contextSegment} ${segment.color}`}
                style={{ width: `${segment.width}%` }}
              />
            ))}
          </div>
          {breakdown !== undefined && (
            <dl className={css.contextRows}>
              {BREAKDOWN_ROWS.map(row => (
                <div key={row.key} className={css.contextRow}>
                  <dt>
                    <span className={clsx(css.contextSwatch, row.color)} aria-hidden />
                    {t(row.label)}
                  </dt>
                  <dd>{`~${formatTokens(breakdown[row.key])}`}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </span>
  )
}

/**
 * The plan-mode exit chip. Renders only while the projection's effective
 * target is plan mode (`pending ? !active : active` — a folded host value,
 * not client optimism).
 * @param props - effective target, busy flag, exit verb, and the locale seat.
 */
export function PlanChip({ target, leaving, onExit, t }: {
  target: boolean
  leaving: boolean
  onExit: () => void
  t: SlgTranslate
}) {
  if (!target) return null
  return (
    <button
      type="button"
      className={css.planChip}
      aria-label={t('plan.exit')}
      title={t('plan.exit')}
      disabled={leaving}
      onClick={onExit}
    >
      Plan
      <span className={css.planChipClose} aria-hidden>×</span>
    </button>
  )
}

/**
 * The slash-command discovery panel: one row per host catalog descriptor,
 * filterable, inserted into the draft or executed bare by the parent's pick
 * verb. Hidden entirely when the session exposes no commands.
 * @param props - the catalog rows, the pick verb, and the locale seat.
 */
export function CommandMenu({ commands, onPick, t }: {
  commands: readonly CommandDescriptor[]
  onPick: (command: CommandDescriptor) => void
  t: SlgTranslate
}) {
  const [filter, setFilter] = useState('')
  const visible = useMemo(() => {
    const query = filter.trim().replace(/^\//, '').toLowerCase()
    if (query === '') return commands
    return commands.filter(command => command.name.toLowerCase().includes(query))
  }, [commands, filter])
  return (
    <div className={css.slashMenu} role="menu" aria-label={t('slash.open')}>
      <input
        className={css.slashFilter}
        placeholder={t('slash.filter')}
        value={filter}
        onChange={(e) => { setFilter(e.target.value) }}
      />
      {visible.length === 0
        ? <div className={css.slashEmpty}>{t('slash.empty')}</div>
        : visible.map(command => (
          <button
            key={command.name}
            type="button"
            role="menuitem"
            className={css.slashRow}
            onClick={() => { onPick(command) }}
          >
            <span className={css.slashName}>{`/${command.name}`}</span>
            <span className={css.slashDesc}>{command.description}</span>
          </button>
        ))}
    </div>
  )
}

/** Effective plan-mode target of one `plan` projection value (the native chip's fold). */
export function planTarget(plan: PlanProjection | undefined): boolean {
  if (plan === undefined) return false
  return plan.pending ? !plan.active : plan.active
}
