import { useEffect, useState } from 'react'
import { MdCheckCircle } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import {
  CALORIE_GOAL,
  caloriePaceFraction,
  formatClock,
  formatElapsed,
  isFoodLogStale,
  lastLoggedAt,
  totalForDate,
} from '../../lib/calories'
import { mondayOf, toISODate } from '../../lib/dates'

const DOW = ['m', 't', 'w', 't', 'f', 's', 's']
const QUICK_ADDS = [100, 500, 4000]

export function CalorieLogger() {
  const { calorieEntries, logCalories } = useData()
  // Ticks so the "2h ago" since the last log ages on screen instead of freezing
  // at whatever it read when the card mounted — the card is left open all day.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const today = toISODate(now)
  const [selDate, setSelDate] = useState(today)

  const monday = mondayOf(now)
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return toISODate(d)
  })

  const selTotal = totalForDate(calorieEntries, selDate)
  const pct = Math.min(selTotal / CALORIE_GOAL, 1) * 100
  const selLabel = selDate === today ? 'today' : `${selDate.slice(5)}`

  // Pace marker: where you should be eating constantly across the 9am–9pm window.
  const isToday = selDate === today
  const pace = isToday ? caloriePaceFraction(now) : null

  // When this day was last logged, so a skipped meal is visible at a glance.
  // A day can have a total but no timestamp — logged before the field existed,
  // or only ever backfilled — and then there's nothing honest to say, so the
  // line is dropped. An empty today is the one exception: no total AND no
  // timestamp is itself the answer.
  const loggedAt = lastLoggedAt(calorieEntries, selDate)
  const untouchedToday = isToday && !loggedAt && selTotal === 0
  const stale = isToday && (loggedAt != null || untouchedToday) && isFoodLogStale(loggedAt, now)
  const logLine = loggedAt
    ? `logged ${formatClock(loggedAt)}${isToday ? ` · ${formatElapsed(loggedAt, now)}` : ''}`
    : untouchedToday
      ? 'nothing logged yet'
      : null

  const add = (cal: number) => {
    if (cal === 0) return
    void logCalories(cal, selDate)
  }

  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-xs tracking-wider text-neutral-500">
            calories · {selLabel}
          </p>
          {logLine && (
            <p className={`mt-0.5 text-[11px] ${stale ? 'text-amber-400' : 'text-neutral-600'}`}>
              {logLine}
            </p>
          )}
        </div>
        <p className="text-sm tabular-nums text-neutral-400">
          <span className={`text-lg font-bold ${selTotal >= CALORIE_GOAL ? 'text-accent-2' : 'text-neutral-100'}`}>
            {selTotal}
          </span>{' '}
          / {CALORIE_GOAL}
        </p>
      </div>
      <div className="relative mt-2">
        <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        {pace != null && pace > 0 && pace < 1 && (
          <div
            className="absolute -top-0.5 h-3.5 w-0.5 -translate-x-1/2 rounded bg-white"
            style={{ left: `${pace * 100}%` }}
            title="on-pace target for now"
          />
        )}
      </div>

      {/* Mon–Sun week: tap a day to view/verify/backfill it. */}
      <div className="mt-3 flex gap-1">
        {week.map((d, i) => {
          const total = totalForDate(calorieEntries, d)
          const met = total >= CALORIE_GOAL
          const isSel = d === selDate
          const isToday = d === today
          return (
            <button
              key={d}
              onClick={() => setSelDate(d)}
              className={`flex flex-1 flex-col items-center rounded-lg py-1 ${
                isSel ? 'bg-surface-2 ring-1 ring-accent' : ''
              }`}
            >
              <span className={`text-[10px] ${isToday ? 'text-accent' : 'text-neutral-500'}`}>{DOW[i]}</span>
              {met ? (
                <MdCheckCircle className="text-accent-2" aria-hidden />
              ) : (
                <span className="text-[10px] tabular-nums text-neutral-500">{total || '·'}</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex gap-2">
        {QUICK_ADDS.map((cal) => (
          <button
            key={cal}
            onClick={() => add(cal)}
            className="min-h-[44px] flex-1 rounded-xl bg-surface-2 text-sm font-semibold active:opacity-80"
          >
            +{cal}
          </button>
        ))}
        <button
          onClick={() => add(-100)}
          className="min-h-[44px] flex-1 rounded-xl bg-surface-2 text-sm font-semibold active:opacity-80"
        >
          −100
        </button>
      </div>
    </div>
  )
}
