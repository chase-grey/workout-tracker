import { useMemo, useState } from 'react'
import { useData } from '../../store/DataContext'
import { CARDIO_KINDS, asksDistance } from '../../lib/cardio'
import {
  buildCardioPlan,
  cardioLevelFrom,
  distancePresets,
  earliestTargetDate,
  fmtClock,
  goalTypesFor,
  liftingWeekdays,
  parseClock,
  planActive,
  startingCardioDays,
  suggestTargetDate,
  WEEKDAY_LETTERS,
  type CardioGoal,
  type CardioGoalType,
  type CardioLevel,
} from '../../lib/cardioPlan'
import { parseISODate, toISODate } from '../../lib/dates'
import { trainingDates } from '../../lib/session'
import { currentWeeklyGoals } from '../../lib/weeklyStreak'
import { usePressAction } from '../../lib/usePressAction'

const KINDS = CARDIO_KINDS.filter((k) => k !== 'other')

const GOAL_TYPE_LABELS: Record<CardioGoalType, string> = {
  distance: 'distance',
  time: 'time',
  weekly: 'minutes a week',
}

const fieldClass =
  'mt-1 min-h-[52px] w-full rounded-xl bg-surface-2 px-3 text-center text-xl tabular-nums focus:outline-none focus:ring-2 focus:ring-accent'

const chip = (on: boolean) =>
  `min-h-[44px] rounded-full px-4 font-medium ${on ? 'bg-accent text-on-accent' : 'bg-surface-2 text-neutral-300'}`

function shortDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()
}

/** A number field's text as a positive number, or null. */
function positive(text: string): number | null {
  const n = Number(text)
  return text.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null
}

const round1 = (n: number) => String(Math.round(n * 10) / 10)

/**
 * Setting a cardio goal: what, how far or how fast or how much, where you are
 * now, which days, and by when — then the week-by-week plan to get there (see
 * lib/cardioPlan). Over an active plan it edits it: the weeks already behind
 * are kept, and so are the checkpoints if the goal is the same.
 *
 * Where you are is prefilled from the log when there is one; each field holds
 * what was typed over it, or shows the log's reading until then. The target
 * date works the same way against the suggested one.
 *
 * Just the form, so it can sit in the goal sheet (CardioGoalSheet) or on a
 * page of its own, like the welcome's cardio step.
 */
export function CardioGoalForm({ onSaved }: { onSaved: () => void }) {
  const { settings, cardioEntries, workouts, updateSettings } = useData()
  const today = toISODate(new Date())
  const existing = planActive(settings.cardioPlan, today) ? settings.cardioPlan : undefined

  const [kind, setKind] = useState<string>(existing?.kind ?? 'run')
  const [goalType, setGoalType] = useState<CardioGoalType>(existing?.goal.type ?? 'distance')
  const presetsFor = distancePresets(kind)
  const existingMi = existing && existing.goal.type !== 'weekly' ? existing.goal.distanceMi : null
  const [distanceMi, setDistanceMi] = useState<number | null>(existingMi ?? presetsFor[1]?.mi ?? null)
  const [customMi, setCustomMi] = useState(
    existingMi != null && !presetsFor.some((p) => p.mi === existingMi) ? round1(existingMi) : '',
  )
  const [goalTime, setGoalTime] = useState(existing?.goal.type === 'time' ? fmtClock(existing.goal.minutes) : '')
  const [goalWeekly, setGoalWeekly] = useState(existing?.goal.type === 'weekly' ? String(existing.goal.minutes) : '150')

  const liftDays = useMemo(() => liftingWeekdays(trainingDates(workouts), today), [workouts, today])
  const [days, setDays] = useState<number[]>(
    () => existing?.days ?? startingCardioDays(currentWeeklyGoals().cardio, liftDays),
  )

  // Fields left untouched show the log's reading; typing over one keeps what was typed.
  const [longestMiText, setLongestMiText] = useState<string | null>(null)
  const [longestMinText, setLongestMinText] = useState<string | null>(null)
  const [weeklyText, setWeeklyText] = useState<string | null>(null)
  const [timeText, setTimeText] = useState<string | null>(null)
  const [dateText, setDateText] = useState<string | null>(existing?.targetDate ?? null)

  const types = goalTypesFor(kind)
  const type: CardioGoalType = types.includes(goalType) ? goalType : 'weekly'
  const presets = distancePresets(kind)
  const mi = customMi.trim() !== '' ? positive(customMi) : distanceMi

  const goal: CardioGoal | null = useMemo(() => {
    if (type === 'weekly') {
      const m = positive(goalWeekly)
      return m ? { type, minutes: Math.round(m) } : null
    }
    if (!mi) return null
    if (type === 'distance') return { type, distanceMi: mi }
    const t = parseClock(goalTime)
    return t ? { type, distanceMi: mi, minutes: t } : null
  }, [type, mi, goalTime, goalWeekly])

  const fromLog = useMemo(
    () => cardioLevelFrom(cardioEntries, kind, goal ?? undefined, today),
    [cardioEntries, kind, goal, today],
  )

  const shown = {
    longestMi: longestMiText ?? (fromLog?.longestMi ? round1(fromLog.longestMi) : ''),
    longestMin: longestMinText ?? (fromLog?.longestMin ? String(fromLog.longestMin) : ''),
    weekly: weeklyText ?? (fromLog ? String(fromLog.weeklyMin) : ''),
    time: timeText ?? (fromLog?.timeMin ? fmtClock(fromLog.timeMin) : ''),
  }

  const level: CardioLevel = {
    longestMi: positive(shown.longestMi) ?? 0,
    longestMin: Math.round(positive(shown.longestMin) ?? 0),
    weeklyMin: Math.round(positive(shown.weekly) ?? 0),
    ...(type === 'time' && parseClock(shown.time) ? { timeMin: parseClock(shown.time)! } : {}),
    ...(fromLog?.paceMinPerMi ? { paceMinPerMi: fromLog.paceMinPerMi } : {}),
  }

  const suggested = goal && days.length ? suggestTargetDate(kind, goal, level, days, today) : null
  const targetDate = dateText ?? suggested ?? ''
  const earliest = earliestTargetDate(days, today)
  const valid = !!goal && days.length > 0 && targetDate >= earliest

  const save = () => {
    if (!valid || !goal) return
    const plan = buildCardioPlan({ kind, goal, level, days, targetDate }, today, settings.cardioPlan)
    updateSettings({ ...settings, cardioPlan: plan })
    onSaved()
  }
  const savePress = usePressAction(save)

  // Each kind has its own distances, so a new kind starts on its own usual one.
  const pickKind = (k: string) => {
    if (k === kind) return
    setKind(k)
    setDistanceMi(distancePresets(k)[1]?.mi ?? null)
    setCustomMi('')
  }

  const toggleDay = (d: number) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)))

  const goalDistanceName = mi ? presets.find((p) => p.mi === mi)?.label ?? `${round1(mi)} mi` : 'distance'

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button key={k} onClick={() => pickKind(k)} aria-pressed={kind === k} className={chip(kind === k)}>
            {k}
          </button>
        ))}
      </div>

      <h3 className="mb-2 text-xs tracking-wider text-neutral-500">goal</h3>
      <div className="mb-3 flex flex-wrap gap-2">
        {types.map((t) => (
          <button key={t} onClick={() => setGoalType(t)} aria-pressed={type === t} className={chip(type === t)}>
            {GOAL_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {type !== 'weekly' && asksDistance(kind) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {presets.map((p) => {
            const on = customMi.trim() === '' && distanceMi === p.mi
            return (
              <button
                key={p.label}
                onClick={() => {
                  setDistanceMi(p.mi)
                  setCustomMi('')
                }}
                aria-pressed={on}
                className={chip(on)}
              >
                {p.label}
              </button>
            )
          })}
          <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-neutral-400">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={customMi}
              onChange={(e) => setCustomMi(e.target.value)}
              aria-label="other distance in miles"
              className="min-h-[44px] w-20 min-w-0 rounded-xl bg-surface-2 px-2 text-center text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
            />
            mi
          </label>
        </div>
      )}

      {type === 'time' && (
        <label className="mb-3 block text-xs text-neutral-400">
          {goalDistanceName} in
          <input
            inputMode="numeric"
            placeholder="mm:ss"
            value={goalTime}
            onChange={(e) => setGoalTime(e.target.value)}
            aria-invalid={goalTime !== '' && parseClock(goalTime) == null}
            className={fieldClass}
          />
        </label>
      )}

      {type === 'weekly' && (
        <label className="mb-3 block text-xs text-neutral-400">
          minutes a week
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={goalWeekly}
            onChange={(e) => setGoalWeekly(e.target.value)}
            className={fieldClass}
          />
        </label>
      )}

      <h3 className="mb-2 mt-4 text-xs tracking-wider text-neutral-500">now</h3>
      <div className="grid grid-cols-2 gap-3">
        {type === 'time' && (
          <label className="min-w-0 text-xs text-neutral-400">
            {goalDistanceName} now
            <input
              inputMode="numeric"
              placeholder="mm:ss"
              value={shown.time}
              onChange={(e) => setTimeText(e.target.value)}
              className={fieldClass}
            />
          </label>
        )}
        {type !== 'weekly' ? (
          <label className="min-w-0 text-xs text-neutral-400">
            longest (mi)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={shown.longestMi}
              onChange={(e) => setLongestMiText(e.target.value)}
              className={fieldClass}
            />
          </label>
        ) : (
          <label className="min-w-0 text-xs text-neutral-400">
            longest (min)
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={shown.longestMin}
              onChange={(e) => setLongestMinText(e.target.value)}
              className={fieldClass}
            />
          </label>
        )}
        <label className="min-w-0 text-xs text-neutral-400">
          min a week
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={shown.weekly}
            onChange={(e) => setWeeklyText(e.target.value)}
            className={fieldClass}
          />
        </label>
      </div>

      <h3 className="mb-2 mt-4 text-xs tracking-wider text-neutral-500">days</h3>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LETTERS.map((letter, d) => (
          <button
            key={d}
            onClick={() => toggleDay(d)}
            aria-pressed={days.includes(d)}
            className={`min-h-[44px] rounded-xl font-medium ${
              days.includes(d) ? 'bg-accent text-on-accent' : 'bg-surface-2 text-neutral-400'
            }`}
          >
            {letter}
          </button>
        ))}
      </div>

      <label className="mt-4 block text-xs text-neutral-400">
        by
        <input
          type="date"
          min={earliest}
          value={targetDate}
          onChange={(e) => setDateText(e.target.value || null)}
          aria-invalid={!valid && !!goal && days.length > 0}
          className="mt-1 min-h-[52px] w-full rounded-xl bg-surface-2 px-3 text-lg focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </label>
      {suggested && targetDate !== suggested && (
        <button
          onClick={() => setDateText(null)}
          className="mt-2 min-h-[44px] rounded-xl px-1 text-sm text-accent"
        >
          suggested {shortDate(suggested)}
        </button>
      )}

      <button
        {...savePress}
        disabled={!valid}
        className="mt-4 min-h-[52px] w-full rounded-2xl bg-accent text-lg font-bold text-on-accent disabled:opacity-30"
      >
        {existing ? 'save plan' : 'build plan'}
      </button>
    </div>
  )
}
