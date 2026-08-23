/**
 * PermissionChip: the live-room input line's access-mode selector. It reads
 * the host-computed `permissions` projection (the same select the composer
 * chip renders) and writes through the injected `/permission` command verb,
 * so both surfaces share one read source and one write path; the pushed
 * projection frame is the single confirmation. Key absence (permission-less
 * host composition) renders nothing, and picking Full access runs the same
 * explicit risk gate as the composer chip before submitting.
 */
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import type { PermissionSelect } from '@deepseek-ai/dsh-permission-presets/client'
import { IconChevronDownOutline14, Menu, RiskConfirmation } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SlgGameView.module.css'

/** The preset value that switches the sandbox wide open; it gates behind the risk dialog. */
const FULL_ACCESS = 'danger-full-access'

/** The room chip's translate seat: the `slg` locale namespace bound by the renderer. */
type SlgTranslate = PropsLocale<'slg'>['t']

/**
 * Display transform shared with the composer chip: kebab-case machine names
 * render title-case (`workspace-write` → `Workspace Write`); non-kebab
 * host-configured names pass through, and Full access keeps the product label.
 */
function displayName(name: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

function optionLabel(option: PermissionSelect['options'][number]): string {
  return option.value === FULL_ACCESS ? 'Full access' : displayName(option.name)
}

export interface PermissionChipProps {
  /** The session's permissions projection; undefined hides the chip entirely. */
  value: PermissionSelect | undefined
  /** Disabled while no session is current or a switch is in flight. */
  locked: boolean
  /** Submit `/permission <id>` for the current session; true = the host accepted it. */
  setPermission: (id: string) => Promise<boolean>
  /** The owning room's locale seat, passed down as a plain prop. */
  t: SlgTranslate
}

/**
 * Renders the compact access-mode chip with its preset menu and Full-access
 * risk confirmation.
 * @param props - projection value, lock state, submit verb, and locale seat.
 */
export function PermissionChip({ value, locked, setPermission, t }: PermissionChipProps) {
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)

  // A pushed projection frame is the switch's confirmation: drop the pending
  // pick once the value catches up, and close the menu when the chip locks.
  useEffect(() => {
    setPick(null)
  }, [value])
  useEffect(() => {
    if (locked) {
      setOpen(false)
      setAcknowledged(false)
      setConfirmation(null)
    }
  }, [locked])

  if (value === undefined) return null

  const currentValue = pick ?? value.currentValue
  const current = value.options.find(option => option.value === currentValue)
  const busy = pick !== null || confirmation !== null

  const items: MenuEntry[] = value.options
    .filter(option => option.value !== 'custom')
    .map(option => ({ id: option.value, label: optionLabel(option) }))

  const submit = (id: string): void => {
    setPick(id)
    void setPermission(id)
      .catch(() => false)
      .then(() => { setPick(null) })
  }

  const choose = (id: string): void => {
    setOpen(false)
    if (id === value.currentValue) return
    if (id === FULL_ACCESS) {
      setAcknowledged(false)
      setConfirmation(id)
      return
    }
    submit(id)
  }

  const confirmFullAccess = (): void => {
    if (locked || !acknowledged || confirmation === null) return
    const id = confirmation
    setAcknowledged(false)
    setConfirmation(null)
    submit(id)
  }

  return (
    <>
      <Menu
        open={open}
        items={items}
        selectedId={currentValue}
        onSelect={choose}
        onClose={() => { setOpen(false) }}
        side="top"
        anchor={(
          <button
            type="button"
            className={css.permChip}
            aria-label={t('access.button', { name: current === undefined ? displayName(currentValue) : optionLabel(current) })}
            disabled={locked || busy}
            onClick={() => { setOpen(!open) }}
          >
            <span>{current === undefined ? displayName(currentValue) : optionLabel(current)}</span>
            <span className={clsx(css.permChevron, open && css.permChevronOpen)} aria-hidden>
              <IconChevronDownOutline14 />
            </span>
          </button>
        )}
      />
      <RiskConfirmation
        open={confirmation !== null}
        title={t('access.confirm.title')}
        description={t('access.confirm.description')}
        acknowledgeLabel={t('access.confirm.acknowledge')}
        cancelLabel={t('access.confirm.cancel')}
        confirmLabel={t('access.confirm.enable')}
        acknowledged={acknowledged}
        onAcknowledgedChange={setAcknowledged}
        onCancel={() => { setConfirmation(null) }}
        onConfirm={confirmFullAccess}
      />
    </>
  )
}
