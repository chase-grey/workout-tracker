import { useEffect, useRef, useState } from 'react'
import { useData } from '../../store/DataContext'
import { buildSystemPrompt } from '../../lib/chatPrompt'
import { chatCompleteRaw, type RawMessage, type Tool } from '../../services/openai'
import { applyPlanEdits, type PlanEdit } from '../../lib/planTools'
import { repRangeLabel, type Plan } from '../../config/plan'
import { DAY_TYPES } from '../../config/plan'
import { MdVpnKey, MdBuild } from 'react-icons/md'

type Turn = { role: 'user' | 'assistant' | 'system'; content: string; error?: boolean }

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
              day: { type: 'string', enum: ['push', 'pull'] },
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

/** A compact snapshot of the current plan so the assistant knows exact keys. */
function planSnapshot(plan: Plan): string {
  const lines = ['CURRENT PLAN (use these exact keys with update_plan):']
  for (const d of DAY_TYPES) {
    lines.push(`${plan[d].label} (${d}):`)
    for (const e of plan[d].exercises) {
      lines.push(`  key=${e.key} — ${e.name}, ${e.sets}x${repRangeLabel(e)}, rest ${e.restSec}s`)
    }
  }
  return lines.join('\n')
}

export function ChatTab() {
  const { workouts, bodyWeights, streaks, settings, plan, updatePlan } = useData()
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns, loading])

  const hasKey = settings.openAiKey.trim().length > 0

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    const priorTurns = turns
    setTurns([...priorTurns, { role: 'user', content: text }])
    setInput('')
    setLoading(true)

    // Build the raw message history (system context + visible turns + new user).
    const messages: RawMessage[] = [
      { role: 'system', content: buildSystemPrompt({ today: new Date(), workouts, bodyWeights, streaks }) },
      { role: 'system', content: planSnapshot(plan) },
      ...priorTurns
        .filter((t) => t.role !== 'system')
        .map((t) => ({ role: t.role, content: t.content }) as RawMessage),
      { role: 'user', content: text },
    ]

    let workingPlan = plan
    const newTurns: Turn[] = []
    try {
      // Tool loop: let the model call update_plan, apply it, feed results back.
      for (let i = 0; i < 4; i++) {
        const turn = await chatCompleteRaw(settings.openAiKey, messages, { tools: [UPDATE_PLAN_TOOL] })
        messages.push(turn.message)

        if (turn.toolCalls.length === 0) {
          if (turn.content) newTurns.push({ role: 'assistant', content: turn.content })
          break
        }

        for (const call of turn.toolCalls) {
          let resultMsg = ''
          if (call.name === 'update_plan') {
            try {
              const parsed = JSON.parse(call.arguments) as { edits: PlanEdit[] }
              const res = applyPlanEdits(workingPlan, parsed.edits ?? [])
              workingPlan = res.plan
              updatePlan(res.plan)
              if (res.applied.length) newTurns.push({ role: 'system', content: res.applied.join('; ') })
              resultMsg = JSON.stringify({ applied: res.applied, errors: res.errors })
            } catch (e) {
              resultMsg = JSON.stringify({ error: e instanceof Error ? e.message : 'bad arguments' })
            }
          } else {
            resultMsg = JSON.stringify({ error: `unknown tool ${call.name}` })
          }
          messages.push({ role: 'tool', tool_call_id: call.id, content: resultMsg })
        }
      }
      setTurns([...priorTurns, { role: 'user', content: text }, ...newTurns])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.'
      setTurns([...priorTurns, { role: 'user', content: text }, { role: 'assistant', content: msg, error: true }])
    } finally {
      setLoading(false)
    }
  }

  if (!hasKey) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 pb-24 pt-24 text-center">
        <MdVpnKey className="text-5xl" aria-hidden />
        <h2 className="text-xl font-bold">Add your OpenAI key</h2>
        <p className="max-w-xs text-sm text-neutral-500">
          To use the training assistant, add your OpenAI API key in Settings. It's stored on this
          device only and used to answer questions about your training — and can edit your plan on request.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-xl font-bold">Assistant</h2>
        <button
          onClick={() => setTurns([])}
          disabled={turns.length === 0 || loading}
          className="min-h-[44px] rounded-xl bg-surface px-3 text-sm font-medium text-neutral-300 active:bg-surface-2 disabled:opacity-40"
        >
          Clear chat
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 pb-24">
        {turns.length === 0 && !loading && (
          <p className="pt-8 text-center text-sm text-neutral-500">
            Ask about your training, or tell me to tweak your plan — e.g. "add face pulls to pull day"
            or "bump incline bench to 4×5–8".
          </p>
        )}

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

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-surface px-3 py-2 text-sm text-neutral-400">…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 flex gap-2 border-t border-border bg-bg pb-4 pt-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send()
          }}
          placeholder="Ask, or tell me to change your plan…"
          className="min-h-[44px] flex-1 rounded-xl bg-surface px-3 text-base focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          onClick={() => void send()}
          disabled={loading || input.trim().length === 0}
          className="min-h-[44px] rounded-xl bg-accent px-4 font-semibold text-black active:opacity-80 disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  )
}
