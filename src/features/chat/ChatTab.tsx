import { useEffect, useRef, useState } from 'react'
import { useData } from '../../store/DataContext'
import { buildSystemPrompt } from '../../lib/chatPrompt'
import { chatCompleteRaw, type RawMessage, type Tool } from '../../services/openai'
import { applyPlanEdits, type PlanEdit } from '../../lib/planTools'
import { applyFlexEdits, type FlexEdit } from '../../lib/flexTools'
import {
  answerIssue,
  fetchIssueThread,
  latestQuestion,
  reportIssue,
  type IssueArea,
} from '../../services/issues'
import { refreshIssues } from '../../store/useTrackedIssues'
import { useKeyboardOpen } from '../../lib/useKeyboardOpen'
import { composerPad } from '../../lib/composerPad'
import { repRangeLabel, type Plan, type PlannedExercise } from '../../config/plan'
import { DAY_TYPES } from '../../config/plan'
import type { FlexBlock } from '../../config/flexPlan'
import { MdVpnKey, MdBuild, MdClose, MdHelpOutline, MdArrowForward } from 'react-icons/md'
import { Markdown } from './Markdown'

/**
 * A change the coach wants to make, held until the user says yes.
 *
 * The coach reaches for the nearest tool when it can't do what was asked — told
 * to add a flexibility goal, with no goal tool to hand, it went and invented two
 * stretches instead. So an edit is never written straight through: the pure
 * apply* function produces the whole resulting plan, that snapshot waits here
 * behind an approve button, and only a tap commits it.
 */
type Proposal = {
  kind: 'plan' | 'flex'
  /** The full plan/routine the edits produce, saved verbatim on approval. */
  next: Plan | FlexBlock[]
  /** What the edits do, one line each, as shown to the user. */
  changes: string[]
  status: 'pending' | 'approved' | 'rejected'
}

type Turn = {
  role: 'user' | 'assistant' | 'system'
  content: string
  error?: boolean
  /** Set on a system turn that is asking for approval rather than reporting. */
  proposal?: Proposal
}

// ChatTab unmounts whenever you leave the coach tab or start a workout, so the
// toggle and the thread outlive the component — otherwise "keep context" would
// forget itself the moment you looked at anything else.
const session: { keepContext: boolean; turns: Turn[] } = { keepContext: false, turns: [] }

const UPDATE_PLAN_TOOL: Tool = {
  type: 'function',
  function: {
    name: 'update_plan',
    description:
      "Propose an edit to the user's Push/Pull workout plan: change an exercise's sets/rep range/rest/name/group, add or remove an exercise, or rename a day. Only call when the user asks to change their plan. Nothing is saved until the user approves the proposal in the app. This tool cannot create or change goals — use report_issue for those. " +
      'Exercises marked circuit=<id> in the snapshot are performed as a rotation, one set at each station in turn, and their rest is per station: circuitRestSec on an exercise is the rest taken AFTER each of its sets in the rotation, where 0 rolls straight on to the next station and null hands the station back to the default timing. restSec is not what the user feels inside a circuit — to rest only after one station, set circuitRestSec on every station of that circuit, 0 on the ones to roll through.',
    parameters: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          description: 'Edits applied in order.',
          items: {
            type: 'object',
            properties: {
              op: { type: 'string', enum: ['setExercise', 'addExercise', 'removeExercise', 'setDayLabel'] },
              day: { type: 'string', enum: [...DAY_TYPES] },
              key: { type: 'string', description: 'exercise key (setExercise / removeExercise)' },
              label: { type: 'string', description: 'new day label (setDayLabel)' },
              fields: {
                type: 'object',
                description:
                  'fields to change (setExercise): name, sets, repMin, repMax, restSec, circuitRestSec, increment, bodyweight, group',
              },
              exercise: {
                type: 'object',
                description: 'new exercise (addExercise): name, sets, repMin, repMax, restSec, group, bodyweight, increment',
              },
            },
            required: ['op', 'day'],
          },
        },
      },
      required: ['edits'],
    },
  },
}

const UPDATE_FLEX_TOOL: Tool = {
  type: 'function',
  function: {
    name: 'update_flex_routine',
    description:
      "Propose an edit to the user's side-splits stretch routine: change/add/remove a stretch, add/remove a block, or set a block note. Blocks are matched by label. Only call when the user asks to change which stretches they do. Nothing is saved until the user approves the proposal in the app. This tool does not create flexibility goals or change their target angles — a request for a goal at some number of degrees is not a request for a new stretch, so file it with report_issue instead.",
    parameters: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          description: 'Edits applied in order.',
          items: {
            type: 'object',
            properties: {
              op: {
                type: 'string',
                enum: ['setExercise', 'addExercise', 'removeExercise', 'addBlock', 'removeBlock', 'setBlockNote'],
              },
              block: { type: 'string', description: 'block label' },
              key: { type: 'string', description: 'stretch key (setExercise / removeExercise)' },
              label: { type: 'string', description: 'new block label (addBlock)' },
              note: { type: 'string', description: 'block note (setBlockNote / addBlock)' },
              fields: { type: 'object', description: 'fields to change (setExercise): name, sets, maxSets, reps, tempo, restSec' },
              exercise: { type: 'object', description: 'new stretch (addExercise): name, sets, maxSets, reps, tempo, restSec' },
            },
            required: ['op'],
          },
        },
      },
      required: ['edits'],
    },
  },
}

const REPORT_ISSUE_TOOL: Tool = {
  type: 'function',
  function: {
    name: 'report_issue',
    description:
      'File a bug or feature request about the workout app itself as a GitHub issue. ' +
      'Call when the user asks to report a problem, says something is broken, or ' +
      'wants a change filed — and also whenever they ask for an app change the other ' +
      'tools cannot make, such as a new or changed goal, a chart, a screen, or ' +
      'different app behaviour. Not for questions about their training. Confirm the ' +
      'created issue number/link back to the user.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short one-line summary of the issue.' },
        body: {
          type: 'string',
          description: 'Details: what happens, steps to reproduce, and what was expected.',
        },
        area: {
          type: 'string',
          enum: ['plan', 'chat', 'timer', 'history', 'other'],
          description: 'Which part of the app the issue is about.',
        },
      },
      required: ['title'],
    },
  },
}

/**
 * The circuit an exercise belongs to and the rest it takes after each of its sets
 * in the rotation — without both, the coach can't tell a circuit station from an
 * ordinary exercise, or see which stations already roll straight on.
 */
function circuitNote(e: PlannedExercise): string {
  if (!e.circuit) return ''
  const rest =
    e.circuitRestSec == null ? 'circuitRestSec unset (default)' : `circuitRestSec ${e.circuitRestSec}s`
  return `, circuit=${e.circuit}, ${rest}`
}

/** A compact snapshot of the current plans so the assistant knows exact keys. */
function planSnapshot(plan: Plan, flexPlan: FlexBlock[]): string {
  const lines = ['CURRENT WORKOUT PLAN (use these exact keys with update_plan):']
  for (const d of DAY_TYPES) {
    lines.push(`${plan[d].label} (${d}):`)
    for (const e of plan[d].exercises) {
      lines.push(
        `  key=${e.key} — ${e.name}, ${e.sets}x${repRangeLabel(e)}, rest ${e.restSec}s${circuitNote(e)}`,
      )
    }
  }
  lines.push('', 'CURRENT STRETCH ROUTINE (use block label + stretch key with update_flex_routine):')
  for (const b of flexPlan) {
    lines.push(`${b.label}:`)
    for (const e of b.exercises) {
      lines.push(`  key=${e.key} — ${e.name}, ${e.sets}x${e.reps}, ${e.tempo}, rest ${e.restSec}s`)
    }
  }
  return lines.join('\n')
}

/** A question the auto-fixer left on an issue, waiting on a reply here. */
type AnswerTarget = { number: number; title: string; question: string }

export function ChatTab({
  answering,
  onAnsweringDone,
}: {
  /**
   * An issue number to answer, set when you tap an asking issue in Settings.
   * The coach chat is where the answer gets typed: the fixer's question arrived
   * without you, so this is the one place in the app already built to hold a
   * back-and-forth about the app itself.
   */
  answering?: number | null
  /** Called once the question is answered or dismissed, so it isn't re-opened. */
  onAnsweringDone?: () => void
}) {
  const { workouts, bodyWeights, streaks, settings, plan, updatePlan, flexPlan, updateFlexPlan } =
    useData()
  // Only a kept thread comes back: with the toggle off, what's on screen has to
  // match what the coach was given, which is nothing yet.
  const [turns, setTurnsState] = useState<Turn[]>(() => {
    if (!session.keepContext) session.turns = []
    return session.turns
  })
  const setTurns = (next: Turn[]) => {
    session.turns = next
    setTurnsState(next)
  }
  const [input, setInput] = useState('')
  // Read here as well as in App: the nav below the composer stands down while
  // the keyboard is up, and the bar's bottom padding stands in for it.
  const keyboardOpen = useKeyboardOpen()
  const [loading, setLoading] = useState(false)
  // The reply as it streams in, before it becomes a turn.
  const [pending, setPending] = useState('')
  // Off by default: each message starts a fresh conversation, so an answer is
  // never coloured by whatever was asked before it. Once it's on it stays on
  // for the rest of the session, tab switches and workouts included.
  const [keepContext, setKeepContext] = useState(session.keepContext)
  const toggleKeepContext = () => {
    session.keepContext = !keepContext
    setKeepContext(!keepContext)
  }
  const endRef = useRef<HTMLDivElement>(null)
  // Answering an issue takes over the composer: what you type goes to the fixer
  // as a comment, not to the model. Null means the tab is a normal chat.
  const [answerTarget, setAnswerTarget] = useState<AnswerTarget | null>(null)
  const [answerLoading, setAnswerLoading] = useState(false)
  const [answerError, setAnswerError] = useState('')

  // Pull the question itself only when one is actually being answered — the list
  // in Settings knows an issue is asking, but not what it asked.
  useEffect(() => {
    setAnswerError('')
    if (answering == null) {
      setAnswerTarget(null)
      return
    }
    let alive = true
    setAnswerLoading(true)
    fetchIssueThread(answering)
      .then((thread) => {
        if (!alive) return
        setAnswerTarget({
          number: thread.number,
          title: thread.title,
          question: latestQuestion(thread),
        })
      })
      .catch(
        (e) =>
          alive && setAnswerError(e instanceof Error ? e.message : 'could not read that issue.'),
      )
      .finally(() => alive && setAnswerLoading(false))
    return () => {
      alive = false
    }
  }, [answering])

  const dismissAnswer = () => {
    setAnswerTarget(null)
    setAnswerError('')
    onAnsweringDone?.()
  }

  /** Send the typed text to the fixer as an issue comment rather than to the model. */
  const sendAnswer = async (target: AnswerTarget, text: string) => {
    setLoading(true)
    setAnswerError('')
    try {
      await answerIssue(target.number, text)
      setInput('')
      setTurns([
        ...turns,
        { role: 'user', content: text },
        { role: 'system', content: `answered #${target.number} — ${target.title}` },
      ])
      setAnswerTarget(null)
      onAnsweringDone?.()
      // The label just moved off `needs-input`; re-read so the nav dot clears
      // now instead of at the next poll.
      refreshIssues()
    } catch (e) {
      // Leave the target and the typed text in place so it can just be re-sent.
      setAnswerError(e instanceof Error ? e.message : 'could not send that answer.')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Commit or discard a proposed edit. The proposal carries the whole resulting
   * plan, so approving is a straight save of that snapshot — no replaying edits
   * against a plan that may have moved on since.
   */
  const resolveProposal = (index: number, approve: boolean) => {
    const turn = turns[index]
    const proposal = turn?.proposal
    if (!proposal || proposal.status !== 'pending') return
    if (approve) {
      if (proposal.kind === 'plan') updatePlan(proposal.next as Plan)
      else updateFlexPlan(proposal.next as FlexBlock[])
    }
    const next = [...turns]
    next[index] = { ...turn, proposal: { ...proposal, status: approve ? 'approved' : 'rejected' } }
    setTurns(next)
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns, pending, loading])

  // Three ways to be able to send (see chatCompleteRaw): the dev proxy holds the
  // key locally, a coach token reaches that same proxy on a laptop over its
  // tunnel, or an OpenAI key goes straight to OpenAI.
  const hasKey =
    import.meta.env.DEV ||
    settings.chatToken.trim().length > 0 ||
    settings.openAiKey.trim().length > 0

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    // Typing ahead of a question that's still loading is an answer, not a
    // message to the coach — hold it rather than sending it to the model.
    if (answerLoading) return
    if (answerTarget) return sendAnswer(answerTarget, text)

    // Without "keep context" the thread starts over on every send, so what's on
    // screen is exactly what the coach was given.
    const priorTurns = keepContext ? turns : []
    const base: Turn[] = [...priorTurns, { role: 'user', content: text }]
    setTurns(base)
    setInput('')
    setPending('')
    setLoading(true)

    // Build the raw message history (system context + visible turns + new user).
    const messages: RawMessage[] = [
      { role: 'system', content: buildSystemPrompt({ today: new Date(), workouts, bodyWeights, streaks }) },
      { role: 'system', content: planSnapshot(plan, flexPlan) },
      ...priorTurns
        .filter((t) => t.role !== 'system')
        .map((t) => ({ role: t.role, content: t.content }) as RawMessage),
      { role: 'user', content: text },
    ]

    let workingPlan = plan
    let workingFlex = flexPlan
    const newTurns: Turn[] = []
    const show = () => setTurns([...base, ...newTurns])
    try {
      // Tool loop: let the model call a tool, apply it, feed results back.
      for (let i = 0; i < 4; i++) {
        const turn = await chatCompleteRaw(settings.openAiKey, messages, {
          tools: [UPDATE_PLAN_TOOL, UPDATE_FLEX_TOOL, REPORT_ISSUE_TOOL],
          model: settings.openAiModel,
          onText: setPending,
        })
        messages.push(turn.message)

        // Settle the streamed text into a turn, then clear the live buffer — the
        // two must swap in the same commit or the reply flickers.
        if (turn.content) newTurns.push({ role: 'assistant', content: turn.content })
        show()
        setPending('')

        if (turn.toolCalls.length === 0) break

        for (const call of turn.toolCalls) {
          let resultMsg = ''
          try {
            if (call.name === 'update_plan') {
              const parsed = JSON.parse(call.arguments) as { edits: PlanEdit[] }
              const res = applyPlanEdits(workingPlan, parsed.edits ?? [])
              // Chain the preview so a second edit in the same reply builds on the
              // first, but write nothing — the snapshot goes to the user instead.
              workingPlan = res.plan
              if (res.applied.length) {
                newTurns.push({
                  role: 'system',
                  content: 'the coach wants to change your workout plan',
                  proposal: { kind: 'plan', next: res.plan, changes: res.applied, status: 'pending' },
                })
              }
              resultMsg = JSON.stringify({
                status: 'awaiting_approval',
                proposed: res.applied,
                errors: res.errors,
                note: 'Nothing has been saved. The user must tap approve. Tell them what you proposed and that it is waiting on them.',
              })
            } else if (call.name === 'update_flex_routine') {
              const parsed = JSON.parse(call.arguments) as { edits: FlexEdit[] }
              const res = applyFlexEdits(workingFlex, parsed.edits ?? [])
              workingFlex = res.routine
              if (res.applied.length) {
                newTurns.push({
                  role: 'system',
                  content: 'the coach wants to change your stretch routine',
                  proposal: { kind: 'flex', next: res.routine, changes: res.applied, status: 'pending' },
                })
              }
              resultMsg = JSON.stringify({
                status: 'awaiting_approval',
                proposed: res.applied,
                errors: res.errors,
                note: 'Nothing has been saved. The user must tap approve. Tell them what you proposed and that it is waiting on them.',
              })
            } else if (call.name === 'report_issue') {
              const parsed = JSON.parse(call.arguments) as {
                title: string
                body?: string
                area?: IssueArea
              }
              // Attach the recent conversation so the issue carries its own context.
              const chatTail = base
                .filter((t) => t.role !== 'system')
                .slice(-6)
                .map((t) => `${t.role}: ${t.content}`)
                .join('\n')
              const issue = await reportIssue(parsed, chatTail)
              newTurns.push({ role: 'system', content: `filed #${issue.number} — ${parsed.title}` })
              resultMsg = JSON.stringify({ filed: true, number: issue.number, url: issue.url })
            } else {
              resultMsg = JSON.stringify({ error: `unknown tool ${call.name}` })
            }
          } catch (e) {
            resultMsg = JSON.stringify({ error: e instanceof Error ? e.message : 'bad arguments' })
          }
          messages.push({ role: 'tool', tool_call_id: call.id, content: resultMsg })
        }
        // Show what the tools did while the coach works on what to say about it.
        show()
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'something went wrong.'
      setTurns([...base, ...newTurns, { role: 'assistant', content: msg, error: true }])
    } finally {
      setPending('')
      setLoading(false)
    }
  }

  if (!hasKey) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 pb-24 pt-24 text-center">
        <MdVpnKey className="text-5xl" aria-hidden />
        <h2 className="text-xl font-bold">add your openai key</h2>
        <p className="max-w-xs text-sm text-neutral-500">
          to use the coach in the deployed app, add an openai api key in settings (stored on this
          device only). an epic key only works when you run the app locally (<code>npm run dev</code>)
          on epic's network — see the readme.
        </p>
      </div>
    )
  }

  return (
    /* A screenful plus the scroller's own bottom padding, then pulled back by the
       same amount: the tab reaches the very bottom of the screen without adding
       anything to scroll. The composer below can then sit flush there as an
       ordinary last child, rather than reaching down with a negative margin of
       its own — a sticky box is held inside its containing block, so a bottom
       margin that hangs past it just parks the bar that far short of the bottom
       once the thread is long enough to scroll. */
    <div className="-mb-4 flex min-h-[calc(100%+1rem)] flex-col">
      <div className="flex items-center justify-end pb-2">
        <button
          onClick={toggleKeepContext}
          aria-pressed={keepContext}
          className={`min-h-[44px] rounded-xl px-3 text-sm font-medium active:opacity-80 ${
            keepContext ? 'bg-accent text-black' : 'bg-surface text-neutral-300'
          }`}
        >
          keep context
        </button>
      </div>

      {/* pb-5 matches the scroller's own top padding (see AppShell's main), so
          the thread ends the same distance above the composer as it starts below
          the top of the screen. It wants no more than that: the composer is an
          ordinary sticky sibling at the end of the column, so once you're
          scrolled to the bottom it's sitting in its own space rather than over
          the thread, and every pixel of tail here is blank screen holding the
          conversation up off the input. */}
      <div className="flex flex-1 flex-col gap-3 pb-5">
        {turns.map((t, i) =>
          t.proposal ? (
            <div key={i} className="mx-auto w-full max-w-[85%] rounded-2xl border border-border bg-surface px-3 py-2">
              <div className="flex items-center gap-1 text-xs text-accent-2">
                <MdBuild aria-hidden />
                {t.content}
              </div>
              <ul className="mt-1 list-disc pl-5 text-sm text-neutral-100">
                {t.proposal.changes.map((c, j) => (
                  <li key={j}>{c}</li>
                ))}
              </ul>
              {t.proposal.status === 'pending' ? (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => resolveProposal(i, true)}
                    className="min-h-[44px] flex-1 rounded-xl bg-accent px-3 font-semibold text-black active:opacity-80"
                  >
                    approve
                  </button>
                  <button
                    onClick={() => resolveProposal(i, false)}
                    className="min-h-[44px] flex-1 rounded-xl bg-bg px-3 font-medium text-neutral-300 active:opacity-80"
                  >
                    reject
                  </button>
                </div>
              ) : (
                <div className="mt-2 text-xs text-neutral-500">
                  {t.proposal.status === 'approved' ? 'approved — saved' : 'rejected — nothing changed'}
                </div>
              )}
            </div>
          ) : t.role === 'system' ? (
            <div key={i} className="mx-auto rounded-full bg-accent-2/15 px-3 py-1 text-xs text-accent-2">
              <MdBuild className="inline align-text-bottom mr-1" aria-hidden />
              {t.content}
            </div>
          ) : (
            <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  t.role === 'user'
                    ? 'whitespace-pre-wrap bg-accent-dark text-white'
                    : t.error
                      ? 'whitespace-pre-wrap bg-surface text-red-400'
                      : 'bg-surface text-neutral-100'
                }`}
              >
                {/* Only the coach's own replies are Markdown. What the user typed
                    is shown exactly as typed, and an error is a bare sentence. */}
                {t.role === 'assistant' && !t.error ? <Markdown text={t.content} /> : t.content}
              </div>
            </div>
          ),
        )}

        {/* The reply lands here as it streams; "…" holds the spot until the
            first token, and again while a tool call is being worked out. */}
        {loading && (
          <div className="flex justify-start">
            <div
              className={`max-w-[85%] rounded-2xl bg-surface px-3 py-2 text-sm ${
                pending ? 'text-neutral-100' : 'text-neutral-400'
              }`}
            >
              {/* Rendered as it streams, so the reply doesn't reflow the moment
                  it settles into a turn. */}
              {pending ? <Markdown text={pending} /> : '…'}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Frosted glass, so the tail of the thread dissolves behind the input
          instead of stopping at a hard edge. The bar's bottom edge is pinned to
          the bottom of the scroller, so the space under the field is this
          padding plus whatever sits below the bar — see composerPad, which is
          what keeps that reading level with the space above. */}
      <div
        className={`sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-border bg-bg/80 px-4 backdrop-blur-md ${composerPad(keyboardOpen)}`}
      >
        {/* The question rides above the composer rather than sitting in the
            thread: it has to stay on screen while the answer is being typed. */}
        {(answerLoading || answerTarget || answerError) && (
          <div className="rounded-xl border border-accent/40 bg-surface px-3 py-2">
            <div className="flex items-start gap-2">
              <MdHelpOutline className="mt-0.5 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 flex-1 text-xs text-accent">
                {answerTarget
                  ? `#${answerTarget.number} asks — ${answerTarget.title}`
                  : answerLoading
                    ? 'loading the question…'
                    : `#${answering}`}
              </span>
              <button
                onClick={dismissAnswer}
                aria-label="stop answering"
                className="-my-1 -mr-1 shrink-0 p-1 text-neutral-400 active:opacity-70"
              >
                <MdClose aria-hidden />
              </button>
            </div>
            {answerTarget?.question && (
              <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-neutral-100">
                {answerTarget.question}
              </p>
            )}
            {answerError && <p className="mt-1 text-sm text-red-400">{answerError}</p>}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send()
            }}
            // The keyboard opening shrinks the thread; keep its tail in view.
            onFocus={() => endRef.current?.scrollIntoView({ behavior: 'smooth' })}
            aria-label={answerTarget ? `answer #${answerTarget.number}` : 'message'}
            /* Ghost text only when the field is aimed somewhere other than the
               coach: answering an issue is the one case where an empty box is
               ambiguous. Plain chat gets none — the tab it lives on already
               says what typing here does. */
            placeholder={answerTarget ? `answer #${answerTarget.number}` : undefined}
            className="min-h-[44px] flex-1 rounded-xl bg-surface px-3 text-base focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            onClick={() => void send()}
            disabled={loading || answerLoading || input.trim().length === 0}
            aria-label={answerTarget ? 'reply' : 'send'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-black active:opacity-80 disabled:opacity-40"
          >
            <MdArrowForward className="text-xl" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}
