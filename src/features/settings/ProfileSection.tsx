import { useState } from 'react'
import { useData } from '../../store/DataContext'
import { toISODate, weekStartISO } from '../../lib/dates'
import { ownerProfile } from '../../lib/ownerProfile'
import {
  DIET_LABELS,
  PILLARS,
  PILLAR_LABELS,
  maskGoals,
  ownerFlavour,
  profileCalorieGoal,
  withCalorieGoal,
  withWeeklyGoals,
  type DietDirection,
  type Pillar,
  type Profile,
} from '../../lib/profile'
import { recommendWeeklyGoals } from '../../lib/recommend'
import type { WeeklyGoalConfig } from '../../lib/weeklyStreak'
import { PressButton, SETTINGS_BUTTON, SETTINGS_FIELD, SETTINGS_LABEL } from './PressButton'

const GOAL_ROWS: { pillar: Pillar; key: keyof WeeklyGoalConfig; label: string }[] = [
  { pillar: 'strength', key: 'workouts', label: 'workouts' },
  { pillar: 'flexibility', key: 'flex', label: 'stretches' },
  { pillar: 'cardio', key: 'cardio', label: 'cardio days' },
  { pillar: 'diet', key: 'calDays', label: 'calorie days' },
]

const DIRECTIONS: DietDirection[] = ['lose', 'maintain', 'gain']

const goalsInForce = (p: Profile): WeeklyGoalConfig => {
  const g = p.weeklyGoals[p.weeklyGoals.length - 1]?.goals
  return { workouts: g?.workouts ?? 0, flex: g?.flex ?? 0, calDays: g?.calDays ?? 0, cardio: g?.cardio ?? 0 }
}

const sameGoals = (a: WeeklyGoalConfig, b: WeeklyGoalConfig) =>
  a.workouts === b.workouts && a.flex === b.flex && a.calDays === b.calDays && (a.cardio ?? 0) === (b.cardio ?? 0)

export function ProfileSection() {
  const { settings, updateSettings } = useData()
  const [fallback] = useState(() => ownerProfile())
  const profile = settings.profile ?? fallback
  const today = toISODate(new Date())

  const baseGoals = maskGoals(goalsInForce(profile), profile.pillars)
  const baseCalories = profileCalorieGoal(profile, today) ?? 0
  const baseDirection = profile.dietDirection ?? 'gain'

  // Drafts hold only what was touched; an untouched one tracks the saved profile.
  const [pillarsDraft, setPillars] = useState<Pillar[] | null>(null)
  const [goalsDraft, setGoals] = useState<WeeklyGoalConfig | null>(null)
  const [caloriesDraft, setCalories] = useState<string | null>(null)
  const [directionDraft, setDirection] = useState<DietDirection | null>(null)
  const [saved, setSaved] = useState(false)

  const pillars = pillarsDraft ?? profile.pillars
  const goals = goalsDraft ?? goalsInForce(profile)
  const caloriesText = caloriesDraft ?? (baseCalories ? String(baseCalories) : '')
  const direction = directionDraft ?? baseDirection
  const on = (p: Pillar) => pillars.includes(p)

  const calories = Number(caloriesText)
  const caloriesValid = caloriesText.trim() !== '' && Number.isFinite(calories) && calories > 0
  const pillarsChanged =
    pillars.length !== profile.pillars.length || pillars.some((p) => !profile.pillars.includes(p))
  const goalsChanged = !sameGoals(maskGoals(goals, pillars), baseGoals)
  const caloriesChanged = on('diet') && caloriesValid && Math.round(calories) !== baseCalories
  const directionChanged = on('diet') && !ownerFlavour(profile) && direction !== baseDirection
  const changed = pillarsChanged || goalsChanged || caloriesChanged || directionChanged

  const togglePillar = (p: Pillar) => {
    if (!on(p)) {
      setPillars(PILLARS.filter((x) => x === p || on(x)))
      const row = GOAL_ROWS.find((r) => r.pillar === p)
      if (row && (goals[row.key] ?? 0) === 0) {
        setGoals({ ...goals, [row.key]: recommendWeeklyGoals([p])[row.key] })
      }
    } else if (pillars.length > 1) {
      setPillars(pillars.filter((x) => x !== p))
    }
  }

  const bump = (key: keyof WeeklyGoalConfig, by: number) =>
    setGoals({ ...goals, [key]: Math.min(7, Math.max(1, (goals[key] ?? 0) + by)) })

  const save = () => {
    let next: Profile = { ...profile, pillars }
    if (goalsChanged) next = withWeeklyGoals(next, maskGoals(goals, pillars), weekStartISO(today))
    if (caloriesChanged) next = withCalorieGoal(next, Math.round(calories), today)
    if (on('diet') && !ownerFlavour(profile)) next = { ...next, dietDirection: direction }
    void updateSettings({ ...settings, profile: next })
    setPillars(null)
    setGoals(null)
    setCalories(null)
    setDirection(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <section className="flex flex-col gap-2">
      <label className={SETTINGS_LABEL}>tracking</label>
      <div className="grid grid-cols-2 gap-2">
        {PILLARS.map((p) => (
          <PressButton
            key={p}
            onPress={() => togglePillar(p)}
            pressed={on(p)}
            className={`min-h-[56px] rounded-xl text-base font-semibold ${
              on(p) ? 'bg-accent text-on-accent' : 'bg-surface text-neutral-400'
            }`}
          >
            {PILLAR_LABELS[p]}
          </PressButton>
        ))}
      </div>

      {GOAL_ROWS.filter((r) => on(r.pillar)).map((r) => (
        <div key={r.key} className="flex min-h-[44px] items-center gap-3 rounded-xl bg-surface px-3">
          <span className="flex-1 text-sm">{r.label}</span>
          <PressButton
            onPress={() => bump(r.key, -1)}
            label={`fewer ${r.label}`}
            disabled={(goals[r.key] ?? 0) <= 1}
            className="h-11 w-11 rounded-lg bg-surface-2 text-lg font-semibold aria-disabled:text-neutral-600"
          >
            −
          </PressButton>
          <span className="w-6 text-center font-semibold tabular-nums">{goals[r.key] ?? 0}</span>
          <PressButton
            onPress={() => bump(r.key, 1)}
            label={`more ${r.label}`}
            disabled={(goals[r.key] ?? 0) >= 7}
            className="h-11 w-11 rounded-lg bg-surface-2 text-lg font-semibold aria-disabled:text-neutral-600"
          >
            +
          </PressButton>
        </div>
      ))}

      {on('diet') && (
        <>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={caloriesText}
            onChange={(e) => setCalories(e.target.value)}
            placeholder="daily calories"
            aria-label="daily calories"
            className={SETTINGS_FIELD}
          />
          {!ownerFlavour(profile) && (
            <div role="group" aria-label="diet direction" className="flex gap-1 rounded-xl bg-surface p-1">
              {DIRECTIONS.map((d) => (
                <PressButton
                  key={d}
                  onPress={() => setDirection(d)}
                  pressed={direction === d}
                  className={`min-h-[44px] flex-1 rounded-lg px-2 text-sm font-medium ${
                    direction === d ? 'bg-accent text-on-accent' : 'text-neutral-400'
                  }`}
                >
                  {DIET_LABELS[d]}
                </PressButton>
              ))}
            </div>
          )}
        </>
      )}

      <PressButton onPress={save} disabled={!changed} className={SETTINGS_BUTTON}>
        {saved ? 'saved ✓' : 'save'}
      </PressButton>
    </section>
  )
}
