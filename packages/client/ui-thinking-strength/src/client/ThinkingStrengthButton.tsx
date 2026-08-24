/**
 * ThinkingStrengthButton: the composer's thinking-strength seat
 * (`conversation.input.right`). A single chip in the tool row, immediately
 * before the primary send button, that opens a list of the current model's
 * reasoning-effort levels and submits through the SAME per-session
 * ModelDirectory as ui-model-selection's composer seat — the host-reported
 * current selection is the single fact both surfaces echo. The trigger renders
 * for every ordinary session with a current model: a model without reasoning
 * metadata opens to the "no levels" notice instead of a dead list. A rejected
 * selection announces through the shared transient Toast anchored to the
 * composer card.
 */
import {
  useEffect, useId, useMemo, useRef, useState,
  type FocusEvent, type KeyboardEvent,
} from 'react'
import clsx from 'clsx'
import type { ModelReasoningEffort, ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconCheckOutline16, IconChevronDownOutline14, IconThinkOutline14, IconWarningOutline16, Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThinkingStrengthInjected } from './slots.ts'
import css from './ThinkingStrengthButton.module.css'

/** One dynamic effort row; undefined means preserve the provider default. */
interface EffortChoice {
  key: string
  effort: string | undefined
  label: string
  description?: string
}

/** Component props: the bound injected face (directory hook included) plus the locale seat. */
export type ThinkingStrengthProps = InjectFace<ThinkingStrengthInjected> & PropsLocale<'thinking-strength'>

/**
 * Render the composer thinking-strength chip.
 * @param props - the injected face (availability, load/select/error verbs, the
 * directory hook) plus the standard locale seat.
 * @returns the trigger and, while open, the effort level menu.
 */
export function ThinkingStrengthButton({
  available, load, select, error, useDirectory, t,
}: ThinkingStrengthProps) {
  const state = useDirectory(s => s)
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const toastSeq = useRef(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const id = useId()

  // The current model's directory entry (absent until the first load, and while
  // a route the catalog stopped advertising is still current).
  const currentModel = useMemo(() => {
    const current = state.current
    if (current === null) return undefined
    for (const group of state.groups) {
      for (const model of group.models) {
        if (group.id === current.provider && model.id === current.model) return model
      }
    }
    return undefined
  }, [state.groups, state.current])

  const reasoning = currentModel?.reasoning

  const effortChoices = useMemo<readonly EffortChoice[]>(() => reasoning === undefined
    ? []
    : [
      ...reasoning.defaultEffort === undefined
        ? [{ key: 'provider-default', effort: undefined, label: t('effort.providerDefault') }]
        : [],
      ...reasoning.efforts.map((effort: ModelReasoningEffort) => ({
        key: `effort:${effort.id}`,
        effort: effort.id,
        label: effort.name,
        ...effort.description === undefined ? {} : { description: effort.description },
      })),
    ], [reasoning, t])

  // Mount-time load resolves the trigger label; every open refreshes.
  useEffect(() => {
    if (available) load()
  }, [available, load])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => { document.removeEventListener('mousedown', closeOutside) }
  }, [open])

  if (!available || state.current === null) return null

  const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort
  const effortLabel = effectiveEffort === undefined || reasoning === undefined
    ? t('effort.providerDefault')
    : reasoning.efforts.find(level => level.id === effectiveEffort)?.name ?? effectiveEffort
  const busy = state.status === 'selecting'

  const close = (restoreFocus = false): void => {
    setOpen(false)
    if (restoreFocus) queueMicrotask(() => { triggerRef.current?.focus() })
  }

  const toggle = (): void => {
    if (open) close()
    else {
      load()
      setOpen(true)
    }
  }

  const chooseEffort = (effort: string | undefined): void => {
    const current = state.current
    /* v8 ignore next -- the menu renders only while a model is current; a null snapshot unmounts the chip before a click lands */
    if (current === null) return
    if (effectiveEffort === effort) {
      close(true)
      return
    }
    const selection: ModelSelection = {
      provider: current.provider,
      model: current.model,
      ...effort === undefined ? {} : { reasoningEffort: effort },
    }
    void select(selection).then((accepted) => {
      if (accepted) close(true)
      else {
        toastSeq.current += 1
        const message = error()
        setToast({
          seq: toastSeq.current,
          text: message === null ? t('error.generic') : t('error.action', { message }),
        })
      }
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      close(true)
    }
  }

  const onBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return
    close()
  }

  return (
    <div ref={rootRef} className={css.root} onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        className={css.trigger}
        aria-label={t('trigger.aria', { effort: effortLabel })}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        title={effortLabel}
        onClick={toggle}
      >
        <IconThinkOutline14 className={css.icon} />
        <span className={css.label}>{effortLabel}</span>
        <IconChevronDownOutline14 className={clsx(css.chevron, open && css.chevronOpen)} />
      </button>

      {open && (
        <div
          id={`${id}-menu`}
          className={css.menu}
          role="menu"
          aria-label={t('menu.aria')}
          aria-busy={state.status === 'loading' || busy}
        >
          {effortChoices.length === 0
            ? <div className={css.empty}>{t('empty.efforts')}</div>
            : effortChoices.map(level => (
              <button
                type="button"
                role="menuitemradio"
                aria-label={level.label}
                aria-checked={effectiveEffort === level.effort}
                className={clsx(css.option, effectiveEffort === level.effort && css.selected)}
                key={level.key}
                disabled={busy}
                onClick={() => { chooseEffort(level.effort) }}
              >
                <span className={css.optionCopy}>
                  <span className={css.optionLabel}>{level.label}</span>
                  {level.description !== undefined && (
                    <span className={css.description}>{level.description}</span>
                  )}
                </span>
                <span className={css.check}>
                  {effectiveEffort === level.effort ? <IconCheckOutline16 /> : null}
                </span>
              </button>
            ))}
        </div>
      )}

      {toast !== null && (
        <Toast
          key={toast.seq}
          text={toast.text}
          icon={<IconWarningOutline16 />}
          anchor={rootRef.current?.closest<HTMLElement>('[data-composer-card]') ?? null}
          onDone={() => { setToast(null) }}
        />
      )}
    </div>
  )
}
