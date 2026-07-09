import { useEffect, useRef, useState } from 'react'
import { useData } from '../../store/DataContext'
import { buildSystemPrompt } from '../../lib/chatPrompt'
import { chatComplete, type ChatMessage } from '../../services/openai'

type Turn = { role: 'user' | 'assistant'; content: string; error?: boolean }

export function ChatTab() {
  const { workouts, bodyWeights, streaks, settings } = useData()
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
    const nextTurns: Turn[] = [...priorTurns, { role: 'user', content: text }]
    setTurns(nextTurns)
    setInput('')
    setLoading(true)

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: buildSystemPrompt({ today: new Date(), workouts, bodyWeights, streaks }),
      },
      ...priorTurns.map((t) => ({ role: t.role, content: t.content }) as ChatMessage),
      { role: 'user', content: text },
    ]

    try {
      const reply = await chatComplete(settings.openAiKey, messages)
      setTurns([...nextTurns, { role: 'assistant', content: reply }])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.'
      setTurns([...nextTurns, { role: 'assistant', content: msg, error: true }])
    } finally {
      setLoading(false)
    }
  }

  if (!hasKey) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 pb-24 pt-24 text-center">
        <span className="text-5xl">🔑</span>
        <h2 className="text-xl font-bold">Add your OpenAI key</h2>
        <p className="max-w-xs text-sm text-neutral-500">
          To use the training assistant, add your OpenAI API key in Settings. It's stored on this
          device only and used to answer questions about your last 90 days of workouts, body
          weight, and streaks.
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
            Ask about your training — progress, what to lift next, or how your streak is doing.
          </p>
        )}

        {turns.map((t, i) => (
          <div
            key={i}
            className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
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
        ))}

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
          placeholder="Ask about your training…"
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
