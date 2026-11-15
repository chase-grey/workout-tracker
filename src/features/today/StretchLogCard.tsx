import { useState } from 'react'
import type { FlexEntry } from '../../lib/flex'
import { parseISODate, toISODate, weekStartISO } from '../../lib/dates'
import { useBackGuard } from '../../lib/useBackGuard'
import { usePressAction } from '../../lib/usePressAction'

/**
 * Flexibility for someone who counts stretch sessions rather than trains a skill
 * (see lib/flexSkills): the days this week, and a sheet that logs a day. Lighter
 * than cardio's — a day is all a session is here — and it files the same flex
 * entry a guided routine does, so the weekly goal and streak count it unchanged.
 */
export function StretchLogCard({
  entries,
  goal,
  onLog,
}: {
  entries: FlexEntry[]
  /** Stretch days the week is asked for; 0 = no goal, show the count alone. */
  goal: number
  onLog: (date: string) => void
}) {
  const [show, setShow] = useState(false)
  const thisWeek = weekStartISO(toISODate(new Date()))
  const days = [...new Set(entries.map((e) => e.date))].filter((d) => weekStartISO(d) === thisWeek).sort()

  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs tracking-wider text-neutral-500">stretching</p>
          <p className="text-sm text-neutral-400">{goal > 0 ? `${days.length} / ${goal}` : `${days.length}`}</p>
          {days.length > 0 && (
            <p className="text-sm text-neutral-500">
              {days
                .map((d) => parseISODate(d).toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase())
                .join(' · ')}
            </p>
          )}
        </div>
        <button
          onClick={() => setShow(true)}
          className="min-h-[44px] rounded-xl bg-surface-2 px-5 font-medium active:opacity-80"
        >
          log stretch
        </button>
      </div>
      {show && <StretchLogSheet onSave={onLog} onClose={() => setShow(false)} />}
    </div>
  )
}

function StretchLogSheet({ onSave, onClose }: { onSave: (date: string) => void; onClose: () => void }) {
  const today = toISODate(new Date())
  const [date, setDate] = useState(today)
  useBackGuard(true, onClose)

  const valid = date !== '' && date <= today
  const savePress = usePressAction(() => {
    if (!valid) return
    onSave(date)
    onClose()
  })

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl bg-surface p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >
        <h2 className="mb-4 text-lg font-bold">log stretch</h2>
        <label className="block text-xs text-neutral-400">
          date
          <input
            type="date"
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={!valid}
            className="mt-1 min-h-[52px] w-full rounded-xl bg-surface-2 px-3 text-lg focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <button
          {...savePress}
          disabled={!valid}
          className="mt-4 min-h-[52px] w-full rounded-2xl bg-accent text-lg font-bold text-on-accent disabled:opacity-30"
        >
          save
        </button>
      </div>
    </div>
  )
}
