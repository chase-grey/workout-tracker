import { useState } from 'react'
import { MdCheckCircle } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { CALORIE_GOAL, totalForDate } from '../../lib/calories'
import { mondayOf, toISODate } from '../../lib/dates'

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const QUICK_ADDS = [100, 500, 1000]

export function CalorieLogger() {
  const { calorieEntries, logCalories } = useData()
  const today = toISODate(new Date())
  const [selDate, setSelDate] = useState(today)
  const [flash, setFlash] = useState<string | null>(null)

  const monday = mondayOf(new Date())
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return toISODate(d)
  })

  const selTotal = totalForDate(calorieEntries, selDate)
  const pct = Math.min(selTotal / CALORIE_GOAL, 1) * 100
  const selLabel = selDate === today ? 'today' : `${selDate.slice(5)}`

  const flashMsg = (m: string) => {
    setFlash(m)
    setTimeout(() => setFlash(null), 1400)
  }
  const add = (cal: number, label: string) => {
    if (cal <= 0) return
    void logCalories(cal, label, selDate)
    flashMsg(`+${cal} cal → ${selLabel}`)
  }
  const topUp = () => add(Math.max(0, CALORIE_GOAL - selTotal), 'Top up to goal')

  return (
    <div className="rounded-2xl bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-wider text-neutral-500">
          Calories · {selLabel}
        </p>
        <p className="text-sm tabular-nums text-neutral-400">
          <span className={`text-lg font-bold ${selTotal >= CALORIE_GOAL ? 'text-accent-2' : 'text-neutral-100'}`}>
            {selTotal}
          </span>{' '}
          / {CALORIE_GOAL}
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
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

      <div className="mt-3 flex gap-2">
        {QUICK_ADDS.map((cal) => (
          <button
            key={cal}
            onClick={() => add(cal, `+${cal}`)}
            className="min-h-[48px] flex-1 rounded-xl bg-surface-2 text-base font-semibold active:opacity-80"
          >
            +{cal}
          </button>
        ))}
      </div>

      {selTotal < CALORIE_GOAL && (
        <button
          onClick={topUp}
          className="mt-2 min-h-[40px] w-full rounded-xl bg-surface-2 text-sm font-medium text-neutral-300 active:opacity-80"
        >
          Mark {selLabel} met (top up to {CALORIE_GOAL})
        </button>
      )}

      {flash && <p className="mt-2 text-center text-sm text-accent-2">{flash}</p>}
    </div>
  )
}
