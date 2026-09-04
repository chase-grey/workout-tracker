import { useEffect, useState } from 'react'
import { MdLocalFireDepartment } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { CALORIE_GOAL, caloriePaceFraction, foodLogStatus, totalForDate } from '../../lib/calories'
import { mondayOf, parseISODate, toISODate, weekStartISO } from '../../lib/dates'

const DOW = ['m', 't', 'w', 't', 'f', 's', 's']
const QUICK_ADDS = [100, 500]
const BACKFILL = CALORIE_GOAL

type Props = {
  /** A Monday selected from streak history; null keeps following the current week. */
  weekStart: string | null
  onShowCurrentWeek: () => void
}

/** The daily food log and its editable Mon-Sun timeline. */
export function DailyHabits({ weekStart, onShowCurrentWeek }: Props) {
  const { calorieEntries, logCalories } = useData()

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const today = toISODate(now)
  const [selDate, setSelDate] = useState(today)
  const currentWeek = weekStartISO(today)
  const historical = weekStart != null && weekStart !== currentWeek
  const monday = weekStart ? parseISODate(weekStart) : mondayOf(now)
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return toISODate(d)
  })

  useEffect(() => {
    if (historical && weekStart) {
      const sunday = parseISODate(weekStart)
      sunday.setDate(sunday.getDate() + 6)
      setSelDate(toISODate(sunday))
    } else {
      setSelDate(today)
    }
  }, [weekStart, historical, today])

  const selTotal = totalForDate(calorieEntries, selDate)
  const pct = Math.min(selTotal / CALORIE_GOAL, 1) * 100
  const { label: selLabel } = foodLogStatus(calorieEntries, selDate, now)
  const pace = selDate === today ? caloriePaceFraction(now) : null

  const addCalories = (calories: number) => {
    if (calories !== 0) void logCalories(calories, selDate)
  }

  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs tracking-wider text-neutral-500">
          {historical
            ? `week of ${monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
            : 'daily calories'}
          {selLabel && <> · {selLabel}</>}
        </p>
        <div className="flex shrink-0 items-baseline gap-2">
          {historical && (
            <button
              type="button"
              onClick={onShowCurrentWeek}
              className="rounded-lg bg-surface-2 px-2 py-1 text-xs font-medium text-neutral-300 active:opacity-70"
            >
              this week
            </button>
          )}
          <p className="text-sm tabular-nums text-neutral-400">
            <span
              className={`text-lg font-bold ${selTotal >= CALORIE_GOAL ? 'text-accent-2' : 'text-neutral-100'}`}
            >
              {selTotal}
            </span>{' '}
            / {CALORIE_GOAL}
          </p>
        </div>
      </div>

      <div className="relative mt-1.5">
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        {pace != null && pace > 0 && pace < 1 && (
          <div
            className="absolute -top-0.5 h-3 w-0.5 -translate-x-1/2 rounded bg-white"
            style={{ left: `${pace * 100}%` }}
            title="on-pace target for now"
          />
        )}
      </div>

      <div className="mt-2 flex gap-1">
        {week.map((date, i) => {
          const hit = totalForDate(calorieEntries, date) >= CALORIE_GOAL
          return (
            <button
              key={date}
              onClick={() => setSelDate(date)}
              aria-label={date}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 ${
                date === selDate ? 'bg-surface-2 ring-1 ring-accent' : ''
              }`}
            >
              <span className={`text-[10px] leading-none ${date === today ? 'text-accent' : 'text-neutral-500'}`}>
                {DOW[i]}
              </span>
              <MdLocalFireDepartment
                className={`text-sm ${hit ? 'text-accent' : date > today ? 'text-neutral-800' : 'text-neutral-700'}`}
                aria-hidden
              />
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex gap-1.5">
        {QUICK_ADDS.map((calories) => (
          <button
            key={calories}
            onClick={() => addCalories(calories)}
            className="min-h-[44px] flex-1 rounded-xl bg-surface-2 text-xs font-semibold active:opacity-80"
          >
            +{calories}
          </button>
        ))}
        {selDate < today && (
          <button
            onClick={() => addCalories(BACKFILL)}
            className="min-h-[44px] flex-1 rounded-xl bg-surface-2 text-xs font-semibold active:opacity-80"
          >
            +{BACKFILL}
          </button>
        )}
        <button
          onClick={() => addCalories(-100)}
          className="min-h-[44px] flex-1 rounded-xl bg-surface-2 text-xs font-semibold active:opacity-80"
        >
          −100
        </button>
      </div>
    </div>
  )
}
