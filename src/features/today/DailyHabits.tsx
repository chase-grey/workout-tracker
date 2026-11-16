import { useEffect, useState } from 'react'
import { MdCheck } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import {
  calorieGoalOn,
  caloriePaceFraction,
  dayHelpings,
  foodLogStatus,
  formatClock,
  formatHelping,
  formatProtein,
  proteinForDate,
  totalForDate,
} from '../../lib/calories'
import { mondayOf, parseISODate, toISODate, weekStartISO } from '../../lib/dates'
import { proteinGoalOn } from '../../lib/protein'
import { commonMeals } from '../../lib/commonMeals'

const DOW = ['m', 't', 'w', 't', 'f', 's', 's']
const QUICK_ADDS = [100, 500]
const PROTEIN_ADDS = [10, 25]
const ADD_BUTTON = 'min-h-[44px] flex-1 rounded-xl bg-surface-2 text-xs font-semibold active:opacity-80'
/** The card's own buttons, which a meal button would only repeat. */
const BUTTON_MEALS = [
  ...QUICK_ADDS.map((calories) => ({ calories, protein: 0 })),
  ...PROTEIN_ADDS.map((protein) => ({ calories: 0, protein })),
]

type Props = {
  /** A Monday selected from streak history; null keeps following the current week. */
  weekStart: string | null
  onShowCurrentWeek: () => void
}

/** The daily food log and its editable Mon-Sun timeline. */
export function DailyHabits({ weekStart, onShowCurrentWeek }: Props) {
  const { calorieEntries, logCalories, bodyWeights, settings } = useData()

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
  const selGoal = calorieGoalOn(selDate)
  const pct = Math.min(selTotal / selGoal, 1) * 100
  const { label: selLabel } = foodLogStatus(calorieEntries, selDate, now)
  const pace = selDate === today ? caloriePaceFraction(now) : null
  const helpings = dayHelpings(calorieEntries, selDate)
  const [showHelpings, setShowHelpings] = useState(false)
  useEffect(() => setShowHelpings(false), [selDate])

  const selProtein = proteinForDate(calorieEntries, selDate)
  const proteinGoal = proteinGoalOn(selDate, bodyWeights, settings.profile ?? null)
  const proteinPct = proteinGoal ? Math.min(selProtein / proteinGoal, 1) * 100 : 0

  const meals = commonMeals(calorieEntries, { now, exclude: BUTTON_MEALS })

  const addFood = (calories: number, protein = 0) => {
    if (calories !== 0 || protein !== 0) void logCalories(calories, selDate, protein)
  }

  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs tracking-wider text-neutral-500">
          {historical
            ? `week of ${monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
            : 'daily calories'}
          {selLabel && (
            <>
              {' · '}
              {helpings.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowHelpings((v) => !v)}
                  aria-expanded={showHelpings}
                  className="underline decoration-neutral-700 underline-offset-2 active:opacity-70"
                >
                  {selLabel}
                </button>
              ) : (
                selLabel
              )}
            </>
          )}
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
              className={`text-lg font-bold ${selTotal >= selGoal ? 'text-accent-2' : 'text-neutral-100'}`}
            >
              {selTotal}
            </span>{' '}
            / {selGoal}
          </p>
        </div>
      </div>

      <div className="relative mt-1.5">
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        {pace != null && pace > 0 && pace < 1 && (
          <div
            className="absolute -top-0.5 h-3 w-0.5 -translate-x-1/2 rounded bg-neutral-50"
            style={{ left: `${pace * 100}%` }}
            title="on-pace target for now"
          />
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs tracking-wider text-neutral-500">protein</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          {proteinGoal != null && (
            <div className="h-full bg-accent transition-all" style={{ width: `${proteinPct}%` }} />
          )}
        </div>
        <p className="text-xs tabular-nums text-neutral-400">
          <span
            className={`font-semibold ${
              proteinGoal != null && selProtein >= proteinGoal ? 'text-accent-2' : 'text-neutral-100'
            }`}
          >
            {formatProtein(selProtein)}
          </span>
          {proteinGoal != null && ` / ${formatProtein(proteinGoal)}`}
        </p>
      </div>

      {showHelpings && helpings.length > 0 && (
        <ul className="mt-2 space-y-0.5 rounded-xl bg-surface-2 px-3 py-2 text-xs tabular-nums">
          {helpings.map((h) => (
            <li key={h.at} className="flex justify-between">
              <span className="text-neutral-400">{formatClock(new Date(h.at))}</span>
              <span className={h.amount < 0 ? 'text-neutral-500' : 'text-neutral-100'}>
                {[h.amount !== 0 && formatHelping(h.amount), h.protein && formatProtein(h.protein)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex gap-1">
        {week.map((date, i) => {
          const hit = totalForDate(calorieEntries, date) >= calorieGoalOn(date)
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
              <MdCheck
                className={`text-sm ${hit ? 'text-accent' : date > today ? 'text-neutral-800' : 'text-neutral-700'}`}
                aria-hidden
              />
            </button>
          )
        })}
      </div>

      {meals.length > 0 && (
        <div className="mt-2 flex gap-1.5">
          {meals.map((m) => (
            <button
              key={`${m.calories}|${m.protein}`}
              onClick={() => addFood(m.calories, m.protein)}
              className={`${ADD_BUTTON} tabular-nums`}
            >
              {[m.calories !== 0 && formatHelping(m.calories), m.protein !== 0 && formatProtein(m.protein)]
                .filter(Boolean)
                .join(' · ')}
            </button>
          ))}
        </div>
      )}

      <div className={`${meals.length > 0 ? 'mt-1.5' : 'mt-2'} flex gap-1.5`}>
        {QUICK_ADDS.map((calories) => (
          <button key={calories} onClick={() => addFood(calories)} className={ADD_BUTTON}>
            +{calories}
          </button>
        ))}
        {selDate < today && (
          <button onClick={() => addFood(selGoal)} className={ADD_BUTTON}>
            +{selGoal}
          </button>
        )}
        <button onClick={() => addFood(-100)} className={ADD_BUTTON}>
          −100
        </button>
      </div>

      <div className="mt-1.5 flex gap-1.5">
        {PROTEIN_ADDS.map((grams) => (
          <button key={grams} onClick={() => addFood(0, grams)} className={ADD_BUTTON}>
            +{formatProtein(grams)}
          </button>
        ))}
        <button
          onClick={() => addFood(0, -10)}
          disabled={selProtein <= 0}
          className={`${ADD_BUTTON} disabled:text-neutral-600`}
        >
          −{formatProtein(10)}
        </button>
      </div>
    </div>
  )
}
