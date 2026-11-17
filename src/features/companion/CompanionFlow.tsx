import { useEffect, useMemo, useRef, useState } from 'react'
import type { WorkoutRow } from '../../types'
import type { Profile } from '../../lib/profile'
import { copyText } from '../../lib/clipboard'
import { applyCompanionOps, type CompanionState } from '../../lib/companion/apply'
import type { CardioContext } from '../../lib/companion/cardio'
import { companionStatus, parseCompanionReply } from '../../lib/companion/parse'
import { BOOTSTRAP_LINE, buildCompanionPrompt, buildRepairPrompt } from '../../lib/companion/prompt'
import { giveCompanionConsent, hasCompanionConsent } from '../../lib/companion/undo'
import { Press, ProposalCard } from '../../components/ProposalCard'
import { useBackGuard } from '../../lib/useBackGuard'
import { useCompanion } from './useCompanion'

const BUTTON =
  'min-h-[44px] w-full rounded-xl bg-surface px-3 text-sm font-semibold active:bg-surface-2'

/** Chat apps that take a first message in the URL. The prompt itself is too long for one. */
const OPENERS = [
  { label: 'ChatGPT', url: 'https://chatgpt.com/?q=' },
  { label: 'Claude', url: 'https://claude.ai/new?q=' },
] as const

type Pending = { kind: 'copy' } | { kind: 'open'; url: string }

/** What the AI is shown, said once before the first copy. */
const CONSENT = {
  lifts: 'your plan, recent lifts and body details go to the AI you paste into',
  cardio: 'your cardio log, cardio plan and body details go to the AI you paste into',
} as const

/**
 * The copy-paste companion, start to finish: copy a prompt out to any chat AI,
 * paste its reply back, see what it would change, apply it.
 *
 * Nothing is saved until "apply changes", and only a reply that read cleanly
 * end to end gets that button. A reply with any bad line applies nothing —
 * its ops depend on each other (a remove that was half of a swap, a move next
 * to an add that failed), so the sensible half of a broken reply can still be
 * the wrong plan — and the fix-up message it offers instead quotes each bad
 * line back to the AI for a whole new block. A reply cut off before END, or
 * one holding questions, applies nothing either.
 *
 * With `cardio` the reply may change the cardio plan too, and the prompt says
 * where the running stands; `focus` 'cardio' makes the prompt about the cardio
 * plan alone (lib/companion/prompt).
 */
export function CompanionFlow({
  state,
  today,
  profile,
  heightIn,
  workouts,
  cardio,
  focus = 'lifts',
  onApply,
}: {
  state: CompanionState
  today: Date
  profile?: Profile | null
  heightIn?: number
  workouts: WorkoutRow[]
  cardio?: CardioContext
  focus?: 'lifts' | 'cardio'
  onApply: (next: CompanionState, summary: string) => void
}) {
  const [consentAsk, setConsentAsk] = useState<Pending | null>(null)
  const [copied, setCopied] = useState<'prompt' | 'fix' | null>(null)
  const [reply, setReply] = useState('')
  const [typing, setTyping] = useState(false)
  const boxRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(null), 2000)
    return () => clearTimeout(t)
  }, [copied])
  useEffect(() => {
    if (typing) boxRef.current?.focus()
  }, [typing])

  const prompt = useMemo(
    () =>
      buildCompanionPrompt({
        today,
        plan: state.plan,
        profile,
        heightIn,
        workouts,
        weeklyWorkouts: state.weeklyWorkouts,
        ...(cardio ? { cardio: { entries: cardio.entries, plan: state.cardioPlan, liftDays: cardio.liftDays } } : {}),
        focus,
      }),
    [today, state, profile, heightIn, workouts, cardio, focus],
  )
  const parse = useMemo(
    () => parseCompanionReply(reply, { plan: state.plan, canSetWeekly: state.weeklyWorkouts != null, cardio: !!cardio }),
    [reply, state, cardio],
  )
  const status = reply.trim() ? companionStatus(parse) : null
  const preview = useMemo(
    () => (status === 'ready' ? applyCompanionOps(state, parse.ops, cardio) : null),
    [status, state, parse, cardio],
  )
  const blocked = status === 'none' || status === 'truncated' || status === 'errors' || (preview?.errors.length ?? 0) > 0

  // The window opens inside the press, before any await, or it's a blocked popup.
  const go = (p: Pending) => {
    void copyText(prompt).then((ok) => ok && setCopied('prompt'))
    if (p.kind === 'open') window.open(p.url + encodeURIComponent(BOOTSTRAP_LINE), '_blank', 'noopener')
  }
  const out = (p: Pending) => {
    if (hasCompanionConsent()) go(p)
    else setConsentAsk(p)
  }

  const pasteIn = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text.trim()) {
        setReply(text)
        setTyping(false)
        return
      }
    } catch {
      // No clipboard read here (an older webview, a denied prompt): type it in.
    }
    setTyping(true)
  }

  const reset = () => {
    setReply('')
    setTyping(false)
  }

  return (
    <div className="flex flex-col gap-3">
      {consentAsk ? (
        <div role="alertdialog" aria-label="share with an AI" className="flex flex-col gap-2 rounded-xl bg-surface p-3">
          <p className="text-sm text-neutral-100">{CONSENT[focus]}</p>
          <div className="flex gap-2">
            <Press
              onPress={() => {
                giveCompanionConsent()
                const p = consentAsk
                setConsentAsk(null)
                go(p)
              }}
              className="min-h-[44px] flex-1 rounded-xl bg-accent px-3 text-sm font-semibold text-on-accent active:opacity-80"
            >
              ok
            </Press>
            <Press
              onPress={() => setConsentAsk(null)}
              className="min-h-[44px] flex-1 rounded-xl bg-bg px-3 text-sm font-medium text-neutral-300 active:opacity-80"
            >
              cancel
            </Press>
          </div>
        </div>
      ) : (
        <>
          <Press onPress={() => out({ kind: 'copy' })} className={BUTTON}>
            {copied === 'prompt' ? 'copied' : 'copy prompt'}
          </Press>
          <div className="grid grid-cols-2 gap-2">
            {OPENERS.map((o) => (
              <Press key={o.label} onPress={() => out({ kind: 'open', url: o.url })} className={BUTTON}>
                copy & open {o.label}
              </Press>
            ))}
          </div>
        </>
      )}

      <Press
        onPress={() => void pasteIn()}
        className="min-h-[44px] w-full rounded-xl bg-accent px-3 text-sm font-semibold text-on-accent active:opacity-80"
      >
        paste from AI
      </Press>
      {(typing || reply) && (
        <textarea
          ref={boxRef}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="AI reply"
          aria-label="AI reply"
          rows={typing && !reply ? 6 : 3}
          className="w-full rounded-xl bg-surface px-3 py-2 font-mono text-xs ring-2 ring-border focus:outline-none focus:ring-accent"
        />
      )}

      {status === 'none' && <p className="text-sm text-red-400">no WT v1 block in that</p>}
      {status === 'truncated' && <p className="text-sm text-red-400">the reply was cut off before END</p>}
      {status === 'ask' && (
        <div className="rounded-xl bg-surface px-3 py-2">
          <p className="text-xs text-accent-2">the AI asked</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-neutral-100">
            {parse.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      {(status === 'errors' || (preview && preview.errors.length > 0)) && (
        <div className="rounded-xl bg-surface px-3 py-2">
          <p className="text-xs text-red-400">
            {parse.errors.length + (preview?.errors.length ?? 0) === 1
              ? '1 line to fix'
              : `${parse.errors.length + (preview?.errors.length ?? 0)} lines to fix`}
          </p>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {parse.errors.map((e, i) => (
              <li key={i}>
                {e.line > 0 && <code className="block truncate text-xs text-neutral-500">{e.text}</code>}
                <span className="text-neutral-100">{e.message}</span>
              </li>
            ))}
            {preview?.errors.map((e, i) => (
              <li key={`a${i}`} className="text-neutral-100">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}
      {blocked && (
        <Press
          onPress={() => {
            void copyText(buildRepairPrompt(parse, preview?.errors)).then((ok) => ok && setCopied('fix'))
          }}
          className={BUTTON}
        >
          {copied === 'fix' ? 'copied' : 'copy fix-up message'}
        </Press>
      )}
      {status === 'ready' && preview && preview.errors.length === 0 && (
        preview.applied.length === 0 ? (
          <p className="text-sm text-neutral-300">{parse.summary || 'no changes'}</p>
        ) : (
          <ProposalCard
            title={parse.summary}
            changes={preview.applied}
            notes={[...parse.adjusted, ...preview.notes]}
            status="pending"
            approveLabel="apply changes"
            rejectLabel="discard"
            onApprove={() => {
              onApply(preview.next, parse.summary)
              reset()
            }}
            onReject={reset}
          />
        )
      )}
    </div>
  )
}

/** {@link CompanionFlow} laid over the screen that asked for it, the way the plan editor sheet is. */
export function CompanionSheet({
  onClose,
  ...flow
}: Parameters<typeof CompanionFlow>[0] & { onClose: () => void }) {
  useBackGuard(true, onClose)
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg" role="dialog" aria-label="your AI">
      <div className="flex min-h-[52px] items-center justify-between px-4 pt-[env(safe-area-inset-top)]">
        <h2 className="text-lg font-bold">your AI</h2>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] rounded-xl px-3 text-sm font-semibold text-neutral-300 active:bg-surface"
        >
          close
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
        <CompanionFlow
          {...flow}
          onApply={(next, summary) => {
            flow.onApply(next, summary)
            onClose()
          }}
        />
      </div>
    </div>
  )
}

/**
 * The companion wired to the live plan: what the coach tab shows without an
 * API key, what the Settings sheet opens, and, on cardio, what the cardio goal
 * form and the plan on Progress open. `onApplied` follows a reply's changes
 * being saved.
 */
export function LiveCompanion({
  sheet,
  onClose,
  focus,
  onApplied,
}: {
  sheet?: boolean
  onClose?: () => void
  focus?: 'lifts' | 'cardio'
  onApplied?: (next: CompanionState) => void
}) {
  const c = useCompanion()
  const [today] = useState(() => new Date())
  const props = {
    state: c.state,
    today,
    profile: c.profile,
    heightIn: c.heightIn,
    workouts: c.workouts,
    cardio: c.cardio,
    focus: c.cardio ? focus : 'lifts',
    onApply: (next: CompanionState, summary: string) => {
      c.commit(next, summary)
      onApplied?.(next)
    },
  }
  return sheet ? <CompanionSheet {...props} onClose={onClose ?? (() => {})} /> : <CompanionFlow {...props} />
}
