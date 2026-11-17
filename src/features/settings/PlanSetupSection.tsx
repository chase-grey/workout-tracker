import { useMemo, useState } from 'react'
import { useData } from '../../store/DataContext'
import {
  EQUIPMENT_LABELS,
  LIFT_DAYS,
  MUSCLES,
  MUSCLE_LABELS,
  WORKOUT_MINUTES,
  hasPillar,
  ownerFlavour,
  type Equipment,
  type Muscle,
  type StrengthSetup,
  type WorkoutMinutes,
} from '../../lib/profile'
import { DEFAULT_STRENGTH, rebuildPlan } from '../../config/planTemplates'
import { DEFAULT_MINUTES, buildPlan, fitStatus } from '../../lib/planBuilder'
import { PressButton, SETTINGS_BUTTON, SETTINGS_LABEL } from './PressButton'

const SIZES: { value: 'full' | 'short'; label: string }[] = [
  { value: 'full', label: 'full' },
  { value: 'short', label: 'short' },
]

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-xl bg-surface p-1">
      {options.map((o) => (
        <PressButton
          key={String(o.value)}
          onPress={() => onChange(o.value)}
          pressed={value === o.value}
          className={`min-h-[44px] flex-1 rounded-lg px-2 text-sm font-medium ${
            value === o.value ? 'bg-accent text-on-accent' : 'text-neutral-400'
          }`}
        >
          {o.label}
        </PressButton>
      ))}
    </div>
  )
}

/**
 * The plan questions from the welcome flow, kept with the profile: what the
 * plan was built from, the size a workout opens at, and a way to build it
 * again from changed answers. Rebuilding replaces the plan — what was added to
 * it by hand stays (see planTemplates.rebuildPlan) — so it waits on a confirm.
 * Only for someone else's profile: the owner's plan is their own programme.
 */
export function PlanSetupSection() {
  const { settings, updateSettings, plan, updatePlan } = useData()
  const profile = settings.profile
  const saved: StrengthSetup = profile?.strength ?? DEFAULT_STRENGTH
  const [draft, setDraft] = useState<StrengthSetup | null>(null)

  const answers: StrengthSetup = draft ?? {
    ...saved,
    focus: saved.focus ?? [],
    minutes: saved.minutes ?? DEFAULT_MINUTES,
  }
  const status = useMemo(() => {
    if (!draft) return null
    const build = buildPlan(draft)
    return { unfitted: build.unfitted, text: fitStatus(draft, build) }
  }, [draft])

  if (!profile || ownerFlavour(profile) || !hasPillar(profile, 'strength')) return null

  const size = saved.length ?? 'short'
  const setSize = (length: 'full' | 'short') =>
    void updateSettings({ ...settings, profile: { ...profile, strength: { ...saved, length } } })

  const edit = (patch: Partial<StrengthSetup>) => setDraft({ ...answers, ...patch })
  const toggleFocus = (m: Muscle) => {
    const focus = answers.focus ?? []
    edit({ focus: focus.includes(m) ? focus.filter((x) => x !== m) : [...focus, m] })
  }

  const replace = () => {
    if (!draft) return
    const next: StrengthSetup = { ...draft, length: saved.length ?? 'full' }
    updatePlan(rebuildPlan(plan, profile.strength, next))
    void updateSettings({ ...settings, profile: { ...profile, strength: next } })
    setDraft(null)
  }

  const summary = [
    `${saved.daysPerWeek} days`,
    EQUIPMENT_LABELS[saved.equipment],
    ...(saved.minutes ? [`${saved.minutes} min`] : []),
  ].join(' · ')

  if (!draft) {
    return (
      <section className="flex flex-col gap-2">
        <label className={SETTINGS_LABEL}>plan</label>
        <div className="flex min-h-[56px] items-center gap-3 rounded-xl bg-surface pl-3 pr-1">
          <span className="flex-1 text-base font-semibold">{summary}</span>
          <PressButton
            onPress={() => setDraft(answers)}
            label="rebuild my plan"
            className="min-h-[44px] rounded-lg bg-surface-2 px-4 text-sm font-medium active:opacity-60"
          >
            rebuild
          </PressButton>
        </div>
        <label className={SETTINGS_LABEL}>workout size</label>
        <Choice label="workout size" value={size} options={SIZES} onChange={setSize} />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-2">
      <label className={SETTINGS_LABEL}>lifting days a week</label>
      <Choice
        label="lifting days a week"
        value={answers.daysPerWeek}
        options={LIFT_DAYS.map((n) => ({ value: n, label: String(n) }))}
        onChange={(daysPerWeek) => edit({ daysPerWeek })}
      />
      <label className={SETTINGS_LABEL}>equipment</label>
      <Choice
        label="equipment"
        value={answers.equipment}
        options={(Object.keys(EQUIPMENT_LABELS) as Equipment[]).map((v) => ({ value: v, label: EQUIPMENT_LABELS[v] }))}
        onChange={(equipment) => edit({ equipment })}
      />
      <label className={SETTINGS_LABEL}>workout length</label>
      <Choice
        label="workout length"
        value={answers.minutes ?? DEFAULT_MINUTES}
        options={WORKOUT_MINUTES.map((m) => ({ value: m, label: `${m} min` }))}
        onChange={(minutes: WorkoutMinutes) => edit({ minutes })}
      />
      <label className={SETTINGS_LABEL}>muscles to grow</label>
      <div role="group" aria-label="muscles to grow" className="grid grid-cols-3 gap-2">
        {MUSCLES.map((m) => {
          const picked = answers.focus?.includes(m) ?? false
          const left = picked && (status?.unfitted.includes(m) ?? false)
          return (
            <PressButton
              key={m}
              onPress={() => toggleFocus(m)}
              pressed={picked}
              className={`min-h-[44px] rounded-xl px-1 text-sm font-medium ${
                picked ? 'bg-accent text-on-accent' : 'bg-surface text-neutral-400'
              } ${left ? 'line-through opacity-60' : ''}`}
            >
              {MUSCLE_LABELS[m]}
            </PressButton>
          )
        })}
      </div>
      {status && (
        <p role="status" className="text-sm text-neutral-300">
          {status.text}
        </p>
      )}
      <div className="flex gap-2">
        <PressButton onPress={() => setDraft(null)} className={`${SETTINGS_BUTTON} flex-1`}>
          cancel
        </PressButton>
        <PressButton onPress={replace} className={`${SETTINGS_BUTTON} flex-1`}>
          replace plan
        </PressButton>
      </div>
    </section>
  )
}
