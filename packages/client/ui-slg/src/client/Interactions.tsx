/**
 * Room-native interaction surfaces fed by the session snapshot's standard
 * seats. The pending approval/question cards answer through the runtime
 * carrier's respond() — the same wire encoding the composer-chain entries use
 * (approval outcome value, question answer batch, cancelled error) — and the
 * queue strip renders the authoritative transient inbox, mutating rows through
 * the injected queue verb. A pending question outranks a pending approval:
 * answering the question first cannot strand the approval, because the
 * pending-list membership re-elects the moment either settles.
 */
import { useState } from 'react'
import clsx from 'clsx'
import type { PendingWait } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { QueueAction } from '@deepseek-ai/dsh-api-remotes/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SlgGameView.module.css'

/** The room chip's translate seat: the `slg` locale namespace bound by the renderer. */
type SlgTranslate = PropsLocale<'slg'>['t']

/** The pending approval carrier (payload fields verbatim from the `approval/requested` frame). */
export type ApprovalWait = PendingWait<'approval'>

/** The pending question carrier (payload carries the whole question batch). */
export type QuestionWait = PendingWait<'question'>

/** One transient inbox row (queued / steering / context placement). */
type QueueRow = ConversationSnapshot['queue'][number]

/** One question's local answer draft. */
interface QuestionDraft {
  selected: string[]
  custom: string
  skipped: boolean
}

const EMPTY_DRAFT: QuestionDraft = { selected: [], custom: '', skipped: false }

/**
 * The approval takeover: amber waiting strip, the asker's reason (or the
 * escalation headline naming the tool), and the two client-answerable
 * outcomes. Removal is frame-driven — the resolved frame drops the carrier
 * from the pending list.
 * @param props - the pending approval carrier plus the locale seat.
 */
export function ApprovalCard({ wait, t }: { wait: ApprovalWait; t: SlgTranslate }) {
  const [busy, setBusy] = useState(false)
  const answer = (outcome: 'allowed-once' | 'rejected'): void => {
    setBusy(true)
    void wait.respond({
      ok: true,
      value: { sessionId: wait.sessionId, approvalId: wait.payload.approvalId, outcome },
    })
      .catch(() => {
        // A failed transport leaves the carrier pending; the next push re-renders.
      })
      .finally(() => { setBusy(false) })
  }
  return (
    <div className={clsx(css.pendingCard, css.approvalCard)} data-approval-key={wait.key}>
      <div className={css.pendingStrip}><span className={css.pendingDot} />{t('approval.waiting')}</div>
      <div className={css.pendingHeadline}>
        {wait.payload.reason ?? t('approval.escalation', { name: wait.payload.toolName })}
      </div>
      <div className={css.pendingActions}>
        <button type="button" disabled={busy} onClick={() => { answer('rejected') }}>
          {t('approval.reject')}
        </button>
        <button
          type="button"
          className={css.pendingPrimary}
          disabled={busy}
          onClick={() => { answer('allowed-once') }}
        >
          {t('approval.allowOnce')}
        </button>
      </div>
    </div>
  )
}

/**
 * The generic question flow: every question of the batch renders its options
 * (single- or multi-select), one custom-answer row, and a skip affordance;
 * the batch submits as one answer or cancels as one cancelled error — core
 * ask() semantics: one ask, many questions, one answer, never split.
 * @param props - the pending question carrier plus the locale seat.
 */
export function QuestionCard({ wait, t }: { wait: QuestionWait; t: SlgTranslate }) {
  const [drafts, setDrafts] = useState<Record<string, QuestionDraft>>({})
  const [busy, setBusy] = useState(false)
  const questions = wait.payload.questions
  const draftOf = (id: string): QuestionDraft => drafts[id] ?? EMPTY_DRAFT
  const patch = (id: string, part: Partial<QuestionDraft>): void => {
    setDrafts(s => ({ ...s, [id]: { ...draftOf(id), ...part } }))
  }
  const answered = (d: QuestionDraft): boolean =>
    d.skipped || d.selected.length > 0 || d.custom.trim() !== ''
  const complete = questions.every(q => answered(draftOf(q.id)))

  const submit = (): void => {
    setBusy(true)
    void wait.respond({
      ok: true,
      value: {
        sessionId: wait.sessionId,
        answer: {
          answers: questions.map((q) => {
            const d = draftOf(q.id)
            // Single-select custom overrides the selection; multi-select custom supplements it.
            const custom = d.custom.trim() === '' ? undefined : d.custom.trim()
            if (custom !== undefined && q.multiSelect !== true) {
              return { id: q.id, selected: [], custom }
            }
            return { id: q.id, selected: d.selected, ...(custom === undefined ? {} : { custom }) }
          }),
        },
      },
    })
      .catch(() => {
        // Transport failure keeps the carrier and the drafts for a retry.
      })
      .finally(() => { setBusy(false) })
  }

  const cancel = (): void => {
    setBusy(true)
    void wait.respond({
      ok: false,
      error: { code: 'cancelled', message: 'the user closed this question request', details: {} },
    })
      .catch(() => { /* the carrier stays until its frame resolves */ })
      .finally(() => { setBusy(false) })
  }

  return (
    <div className={css.pendingCard} data-question-key={wait.key}>
      {questions.map((q) => {
        const d = draftOf(q.id)
        return (
          <div key={q.id} className={css.questionItem}>
            <div className={css.questionText}>
              {q.question}
              {q.multiSelect === true && <span className={css.questionTag}>{t('question.multi')}</span>}
            </div>
            {(q.options ?? []).map((option) => {
              const on = d.selected.includes(option.label)
              return (
                <button
                  key={option.label}
                  type="button"
                  className={clsx(css.questionOption, on && css.questionOptionOn)}
                  disabled={busy}
                  onClick={() => {
                    if (q.multiSelect === true) {
                      patch(q.id, {
                        selected: on ? d.selected.filter(l => l !== option.label) : [...d.selected, option.label],
                        skipped: false,
                      })
                    } else {
                      patch(q.id, { selected: on ? [] : [option.label], skipped: false })
                    }
                  }}
                >
                  <span>{option.label}</span>
                  {option.description !== undefined && <span className={css.questionDesc}>{option.description}</span>}
                </button>
              )
            })}
            <input
              className={css.questionCustom}
              placeholder={t('question.custom')}
              disabled={busy}
              value={d.custom}
              onChange={(e) => { patch(q.id, { custom: e.target.value, skipped: false }) }}
            />
            {!answered(d) && (
              <button
                type="button"
                className={css.questionSkip}
                disabled={busy}
                onClick={() => { patch(q.id, { skipped: true }) }}
              >
                {t('question.skip')}
              </button>
            )}
          </div>
        )
      })}
      <div className={css.pendingActions}>
        <button type="button" disabled={busy} onClick={cancel}>{t('question.cancel')}</button>
        <button
          type="button"
          className={css.pendingPrimary}
          disabled={busy || !complete}
          onClick={submit}
        >
          {t('question.submit')}
        </button>
      </div>
    </div>
  )
}

/**
 * The transient inbox strip above the input line: one row per queued or
 * steering occurrence (context placements are engine bookkeeping, not user
 * rows), queued rows offering send-now (strict steer) and remove.
 * @param props - the snapshot queue rows, the queue mutation verb, and the locale seat.
 */
export function QueueStrip({ rows, updateQueue, t }: {
  rows: readonly QueueRow[]
  updateQueue: (itemId: QueueRow['id'], action: QueueAction) => Promise<void>
  t: SlgTranslate
}) {
  const live = rows.filter(row => row.placement !== 'context')
  if (live.length === 0) return null
  return (
    <div className={css.queueStrip}>
      {live.map(row => (
        <div key={row.id} className={css.queueRow} data-placement={row.placement}>
          <span className={css.queueTag}>
            {row.placement === 'steering' ? t('queue.tag.steering') : t('queue.tag.queued')}
          </span>
          <span className={css.queuePreview}>{row.preview}</span>
          {row.placement === 'queued' && (
            <span className={css.queueActions}>
              <button type="button" onClick={() => { void updateQueue(row.id, { kind: 'steer' }) }}>
                {t('queue.sendNow')}
              </button>
              <button type="button" onClick={() => { void updateQueue(row.id, { kind: 'remove' }) }}>
                {t('queue.remove')}
              </button>
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
