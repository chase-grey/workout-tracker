import { useState } from 'react'
import { cardioDates, cardioSummary, type CardioEntry } from '../../lib/cardio'
import { parseISODate, toISODate, weekStartISO } from '../../lib/dates'
import { CardioLogSheet } from './CardioLogSheet'

export function CardioCard({
  entries,
  goal,
  onLog,
  onDelete,
}: {
  entries: CardioEntry[]
  /** Days of cardio the week is asked for; 0 = no goal, show the count alone. */
  goal: number
  onLog: (entry: Omit<CardioEntry, 'id'>) => void
  onDelete: (id: string) => void
}) {
  const [show, setShow] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const thisWeek = weekStartISO(toISODate(new Date()))
  const week = entries
    .filter((e) => weekStartISO(e.date) === thisWeek)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const days = cardioDates(week).length
  const minutes = Math.round(week.reduce((sum, e) => sum + e.minutes, 0))

  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs tracking-wider text-neutral-500">cardio</p>
          <p className="text-sm text-neutral-400">{goal > 0 ? `${days} / ${goal}` : `${days}`}</p>
          <p className="text-sm text-neutral-400">{minutes} min</p>
        </div>
        <button
          onClick={() => setShow(true)}
          className="min-h-[44px] rounded-xl bg-surface-2 px-5 font-medium active:opacity-80"
        >
          log cardio
        </button>
      </div>
      {week.length > 0 && (
        <ul className="mt-2 flex flex-col">
          {week.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm text-neutral-300">
                {e.kind} · {cardioSummary(e)}
                <span className="text-neutral-500">
                  {' '}
                  · {parseISODate(e.date).toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase()}
                </span>
              </span>
              <button
                onClick={() => {
                  if (confirmId !== e.id) {
                    setConfirmId(e.id)
                    return
                  }
                  setConfirmId(null)
                  onDelete(e.id)
                }}
                onBlur={() => setConfirmId(null)}
                className={`min-h-[44px] shrink-0 rounded-xl px-3 text-sm active:opacity-80 ${
                  confirmId === e.id ? 'text-accent' : 'text-neutral-500'
                }`}
              >
                {confirmId === e.id ? 'tap again to remove' : 'remove'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {show && <CardioLogSheet onSave={onLog} onClose={() => setShow(false)} />}
    </div>
  )
}
