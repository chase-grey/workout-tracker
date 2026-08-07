import { useEffect, useRef, useState } from 'react'
import { useData } from '../../store/DataContext'
import { buildSystemPrompt } from '../../lib/chatPrompt'
import { chatCompleteRaw, type RawMessage, type Tool } from '../../services/openai'
import { applyPlanEdits, type PlanEdit } from '../../lib/planTools'
import { applyFlexEdits, type FlexEdit } from '../../lib/flexTools'
import { reportIssue, type IssueArea } from '../../services/issues'
import { repRangeLabel, type Plan } from '../../config/plan'
import { DAY_TYPES } from '../../config/plan'
import type { FlexBlock } from '../../config/flexPlan'
import { MdVpnKey, MdBuild } from 'react-icons/md'

type Turn = { role: 'user' | 'assistant' | 'system'; content: string; error?: boolean }

// ChatTab unmounts whenever you leave the coach tab or start a workout, so the
// toggle and the thread outlive the component — otherwise "keep context" would
// forget itself the moment you looked at anything else.
const session: { keepContext: boolean; turns: Turn[] } = { keepContext: false, turns: [] }

const UPDATE_PLAN_TOOL: Tool = {
  type: 'function',
  function: {
    name: 'update_plan',
    description:
      "Edit the user's Push/Pull workout plan: change an exercise's sets/rep range/rest/name/group, add or remove an exercise, or rename a day. Only call when the user asks to change their plan.",
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
                description: 'fields to change (setExercise): name, sets, repMin, repMax, restSec, increment, bodyweight, group',
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
      "Edit the user's side-splits stretch routine: change/add/remove a stretch, add/remove a block, or set a block note. Blocks are matched by label. Only call when the user asks to change their stretch routine.",
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
      'Call only when the user asks to report a problem, says something is broken, or ' +
      'wants a change filed — not for questions about their training. Confirm the ' +
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

/** A compact snapshot of the current plans so the assistant knows exact keys. */
function planSnapshot(plan: Plan, flexPlan: FlexBlock[]): string {
  const lines = ['CURRENT WORKOUT PLAN (use these exact keys with update_plan):']
  for (const d of DAY_TYPES) {
    lines.push(`${plan[d].label} (${d}):`)
    for (const e of plan[d].exercises) {
      lines.push(`  key=${e.key} — ${e.name}, ${e.sets}x${repRangeLabel(e)}, rest ${e.restSec}s`)
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

export function ChatTab() {
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
              workingPlan = res.plan
              updatePlan(res.plan)
              if (res.applied.length) newTurns.push({ role: 'system', content: res.applied.join('; ') })
              resultMsg = JSON.stringify({ applied: res.applied, errors: res.errors })
            } else if (call.name === 'update_flex_routine') {
              const parsed = JSON.parse(call.arguments) as { edits: FlexEdit[] }
              const res = applyFlexEdits(workingFlex, parsed.edits ?? [])
              workingFlex = res.routine
              updateFlexPlan(res.routine)
              if (res.applied.length) newTurns.push({ role: 'system', content: res.applied.join('; ') })
              resultMsg = JSON.stringify({ applied: res.applied, errors: res.errors })
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
    <div className="flex min-h-full flex-col">
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

      <div className="flex flex-1 flex-col gap-3 pb-24">
        {turns.map((t, i) =>
          t.role === 'system' ? (
            <div key={i} className="mx-auto rounded-full bg-accent-2/15 px-3 py-1 text-xs text-accent-2">
              <MdBuild className="inline align-text-bottom mr-1" aria-hidden />
              {t.content}
            </div>
          ) : (
            <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                  t.role === 'user'
                    ? 'bg-accent text-black'
                    : t.error
                      ? 'bg-surface text-red-400'
                      : 'bg-surface text-neutral-100'
                }`}
              >
                {t.content}
              </div>
            </div>
          ),
        )}

        {/* The reply lands here as it streams; "…" holds the spot until the
            first token, and again while a tool call is being worked out. */}
        {loading && (
          <div className="flex justify-start">
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl bg-surface px-3 py-2 text-sm ${
                pending ? 'text-neutral-100' : 'text-neutral-400'
              }`}
            >
              {pending || '…'}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Frosted glass, so the tail of the thread dissolves behind the input
          instead of stopping at a hard edge. -mb-4 cancels the main scroller's
          bottom padding so the bar sits right down at the bottom of the screen. */}
      <div className="sticky bottom-0 -mx-4 -mb-4 flex gap-2 border-t border-border bg-bg/80 px-4 pb-2 pt-2 backdrop-blur-md">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send()
          }}
          // The keyboard opening shrinks the thread; keep its tail in view.
          onFocus={() => endRef.current?.scrollIntoView({ behavior: 'smooth' })}
          placeholder="ask your coach"
          className="min-h-[44px] flex-1 rounded-xl bg-surface px-3 text-base focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          onClick={() => void send()}
          disabled={loading || input.trim().length === 0}
          className="min-h-[44px] rounded-xl bg-accent px-4 font-semibold text-black active:opacity-80 disabled:opacity-40"
        >
          send
        </button>
      </div>
    </div>
  )
}
