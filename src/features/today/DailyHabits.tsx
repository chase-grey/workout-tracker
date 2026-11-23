import { useEffect, useState } from 'react'
import { MdCheck } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import {
  calorieGoalOn,
  caloriePaceFraction,
  dayHelpings,
  foodLogStatus,
  formatClock,
  formatGrams,
  formatHelping,
  macrosForDate,
  totalForDate,
  type Macro,
  type MacroGrams,
} from '../../lib/calories'
import { mondayIndexOf, weekStartOf, parseISODate, toISODate, weekStartISO } from '../../lib/dates'
import {
  MACRO_LABELS,
  derivesCalories,
  formatMacros,
  macroCalories,
  macroGoalOn,
  trackedMacros,
} from '../../lib/macros'
import { calorieAdds, formatAdd, macroAdds } from '../../lib/quickAdds'
import { AmountEditor } from '../../components/AmountEditor'

const DOW = ['m', 't', 'w', 't', 'f', 's', 's']
const ADD_BUTTON = 'min-h-[44px] flex-1 rounded-xl bg-surface-2 text-xs font-semibold active:opacity-80'

type Props = {
  /** A Monday selected from streak history; null keeps following the current week. */
  weekStart: string | null
  onShowCurrentWeek: () => void
  /**
   * The day being logged, when the week calendar above picks it. The card then
   * leaves out its own Mon–Sun strip, which the calendar already is.
   */
  date?: string
  onSelectDate?: (date: string) => void
  /**
   * The page is being edited and this card is open (see
   * components/EditableStack): the amounts its buttons add, in place of the log.
   */
  editing?: boolean
}

/**
 * The daily food log and its editable Mon-Sun timeline. What its buttons add
 * is the person's to set (see lib/quickAdds), by holding the card.
 */
export function DailyHabits({ weekStart, onShowCurrentWeek, date, onSelectDate, editing }: Props) {
  const { calorieEntries, logCalories, bodyWeights, settings, updateSettings } = useData()

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const today = toISODate(now)
  const [ownDate, setOwnDate] = useState(today)
  const picked = date !== undefined
  const selDate = date ?? ownDate
  const setSelDate = onSelectDate ?? setOwnDate
  const currentWeek = weekStartISO(today)
  const historical = weekStart != null && weekStart !== currentWeek
  const monday = weekStart ? parseISODate(weekStart) : weekStartOf(now)
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return toISODate(d)
  })

  useEffect(() => {
    if (historical && weekStart) {
      const sunday = parseISODate(weekStart)
      sunday.setDate(sunday.getDate() + 6)
      setOwnDate(toISODate(sunday))
    } else {
      setOwnDate(today)
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

  const profile = settings.profile ?? null
  const tracked = trackedMacros(profile)
  // Counting all three macros makes the calories their sum: each gram logs the
  // calories it brings, and the calorie buttons would only be the same food twice.
  const derived = derivesCalories(tracked)
  const selMacros = macrosForDate(calorieEntries, selDate)

  const addFood = (calories: number, macros: MacroGrams = {}) => {
    if (calories !== 0 || Object.values(macros).some((g) => g !== 0)) void logCalories(calories, selDate, macros)
  }
  const addMacro = (macro: Macro, grams: number) => {
    // A minus takes off no more than the day has, in grams or in the calories they stood for.
    const delta = Math.max(-selMacros[macro], grams)
    addFood(derived ? macroCalories({ [macro]: delta }) : 0, { [macro]: delta })
  }
  /** A helping as the card writes it; the calories go unsaid when the macros already say them. */
  const describe = (calories: number, macros: MacroGrams) => {
    const grams = formatMacros(macros, tracked)
    const showCalories = calories !== 0 && (!derived || grams === '')
    return [showCalories && formatHelping(calories), grams].filter(Boolean).join(' · ')
  }

  const quickAdds = calorieAdds(settings.calorieAdds)

  if (editing) {
    return (
      <div className="flex flex-col gap-4">
        {!derived && (
          <AmountEditor
            label="calories"
            values={quickAdds}
            onChange={(next) => updateSettings({ ...settings, calorieAdds: next })}
          />
        )}
        {tracked.map((macro) => (
          <AmountEditor
            key={macro}
            label={MACRO_LABELS[macro]}
            unit="g"
            values={macroAdds(settings.macroAdds, macro)}
            onChange={(next) => updateSettings({ ...settings, macroAdds: { ...settings.macroAdds, [macro]: next } })}
          />
        ))}
      </div>
    )
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

      {showHelpings && helpings.length > 0 && (
        <ul className="mt-2 space-y-0.5 rounded-xl bg-surface-2 px-3 py-2 text-xs tabular-nums">
          {helpings.map((h) => (
            <li key={h.at} className="flex justify-between">
              <span className="text-neutral-400">{formatClock(new Date(h.at))}</span>
              <span className={h.amount < 0 ? 'text-neutral-500' : 'text-neutral-100'}>
                {describe(h.amount, h)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!picked && (
        <div className="mt-2 flex gap-1">
          {week.map((day) => {
            const hit = totalForDate(calorieEntries, day) >= calorieGoalOn(day)
            return (
              <button
                key={day}
                onClick={() => setSelDate(day)}
                aria-label={day}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 ${
                  day === selDate ? 'bg-surface-2 ring-1 ring-accent' : ''
                }`}
              >
                <span className={`text-[10px] leading-none ${day === today ? 'text-accent' : 'text-neutral-500'}`}>
                  {DOW[mondayIndexOf(day)]}
                </span>
                <MdCheck
                  className={`text-sm ${hit ? 'text-accent' : day > today ? 'text-neutral-800' : 'text-neutral-700'}`}
                  aria-hidden
                />
              </button>
            )
          })}
        </div>
      )}

      {!derived && (
        <div className="mt-2 flex gap-1.5">
          {quickAdds
            .filter((calories) => calories > 0)
            .map((calories) => (
              <button key={calories} onClick={() => addFood(calories)} className={ADD_BUTTON}>
                {formatAdd(calories)}
              </button>
            ))}
          {selDate < today && (
            <button onClick={() => addFood(selGoal)} className={ADD_BUTTON}>
              +{selGoal}
            </button>
          )}
          {quickAdds
            .filter((calories) => calories < 0)
            .map((calories) => (
              <button key={calories} onClick={() => addFood(calories)} className={ADD_BUTTON}>
                {formatAdd(calories)}
              </button>
            ))}
        </div>
      )}

      {tracked.map((macro) => {
        const grams = selMacros[macro]
        const goal = macroGoalOn(macro, selDate, bodyWeights, profile, selGoal)
        const adds = macroAdds(settings.macroAdds, macro)
        return (
          <div key={macro} role="group" aria-label={MACRO_LABELS[macro]} className="mt-3">
            <div className="flex items-center gap-2">
              <span className="text-xs tracking-wider text-neutral-500">{MACRO_LABELS[macro]}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                {goal != null && (
                  <div
                    className="h-full bg-accent transition-all"
                    style={{ width: `${Math.min(grams / goal, 1) * 100}%` }}
                  />
                )}
              </div>
              <p className="text-xs tabular-nums text-neutral-400">
                <span
                  className={`font-semibold ${goal != null && grams >= goal ? 'text-accent-2' : 'text-neutral-100'}`}
                >
                  {formatGrams(grams)}
                </span>
                {goal != null && ` / ${formatGrams(goal)}`}
              </p>
            </div>
            <div className="mt-1.5 flex gap-1.5">
              {/* The ones that add, then the ones that take back, whatever order they were made in. */}
              {[...adds.filter((g) => g > 0), ...adds.filter((g) => g < 0)].map((g) => (
                <button
                  key={g}
                  onClick={() => addMacro(macro, g)}
                  disabled={g < 0 && grams <= 0}
                  className={`${ADD_BUTTON} disabled:text-neutral-600`}
                >
                  {formatAdd(g, 'g')}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
