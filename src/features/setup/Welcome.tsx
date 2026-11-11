import { useState, type ReactNode } from 'react'
import {
  ACTIVITY_LABELS,
  DIET_LABELS,
  EQUIPMENT_LABELS,
  PILLARS,
  PILLAR_LABELS,
  maskGoals,
  type Activity,
  type DietDirection,
  type Equipment,
  type Pillar,
  type Profile,
  type Sex,
} from '../../lib/profile'
import { recommendCalories, recommendWeeklyGoals } from '../../lib/recommend'
import type { WeeklyGoalConfig } from '../../lib/weeklyStreak'
import { PROVIDERS, providerOf, type ProviderId } from '../../lib/aiProvider'
import { toISODate, weekStartISO } from '../../lib/dates'
import { ACCENTS, MODES, palette } from '../../lib/theme'
import { setTheme, useTheme } from '../../lib/themeStore'
import { usePressAction } from '../../lib/usePressAction'
import { SHELL_PAD_TOP, SHELL_PAD_X, SHELL_WIDTH } from '../../lib/shell'

export type WelcomeAccount =
  | { kind: 'invite'; code: string }
  | { kind: 'key'; token: string }
  | { kind: 'local' }

export type WelcomeResult = {
  profile: Profile
  heightIn: number | null
  weightLbs: number | null
  ai: { provider: ProviderId; key: string } | null
  account: WelcomeAccount
}

const FIELD =
  'min-h-[44px] rounded-xl bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent'
const LABEL = 'text-sm font-medium text-neutral-300'
const STEPS = 6

/**
 * A button that fires on release even when the press blurred a field and the
 * keyboard's closing reflowed the page. A disabled one stays in the tab order
 * and swallows the press instead, since a native `disabled` gets no pointer events.
 */
function PressButton({
  onPress,
  disabled,
  className,
  pressed,
  label,
  children,
}: {
  onPress: () => void
  disabled?: boolean
  className: string
  pressed?: boolean
  label?: string
  children: ReactNode
}) {
  const press = usePressAction(() => {
    if (!disabled) onPress()
  })
  return (
    <button
      type="button"
      {...press}
      aria-disabled={disabled || undefined}
      aria-pressed={pressed}
      aria-label={label}
      className={className}
    >
      {children}
    </button>
  )
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T | null
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      <span className={LABEL}>{label}</span>
      <div className="flex gap-1 rounded-xl bg-surface p-1">
        {options.map((o) => (
          <PressButton
            key={o.value}
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
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  decimal,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  decimal?: boolean
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-2">
      <span className={LABEL}>{label}</span>
      <input
        type="number"
        inputMode={decimal ? 'decimal' : 'numeric'}
        min="0"
        step={decimal ? 'any' : '1'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={FIELD}
      />
    </label>
  )
}

function num(s: string): number | null {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function inRange(n: number | null, lo: number, hi: number): n is number {
  return n !== null && n >= lo && n <= hi
}

const THIS_YEAR = new Date().getFullYear()
const BIRTH_LO = 1920
const BIRTH_HI = THIS_YEAR - 10

const GOAL_ROWS: { pillar: Pillar; key: keyof WeeklyGoalConfig; label: string }[] = [
  { pillar: 'strength', key: 'workouts', label: 'workouts' },
  { pillar: 'flexibility', key: 'flex', label: 'stretches' },
  { pillar: 'cardio', key: 'cardio', label: 'cardio days' },
  { pillar: 'diet', key: 'calDays', label: 'calorie days' },
]

function ThemeStep() {
  const { theme } = useTheme()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        {ACCENTS.map((a) => (
          <PressButton
            key={a}
            onPress={() => setTheme({ ...theme, accent: a })}
            label={a}
            pressed={theme.accent === a}
            className={`h-11 w-11 rounded-full ring-offset-2 ring-offset-bg ${
              theme.accent === a ? 'ring-2 ring-neutral-100' : ''
            }`}
          >
            <span
              className="block h-full w-full rounded-full"
              style={{ background: palette({ ...theme, accent: a }).scale[600] }}
            />
          </PressButton>
        ))}
      </div>
      <div className="flex gap-1 rounded-xl bg-surface p-1">
        {MODES.map((m) => (
          <PressButton
            key={m}
            onPress={() => setTheme({ ...theme, mode: m })}
            pressed={theme.mode === m}
            className={`min-h-[44px] flex-1 rounded-lg px-2 text-sm font-medium ${
              theme.mode === m ? 'bg-accent text-on-accent' : 'text-neutral-400'
            }`}
          >
            {m}
          </PressButton>
        ))}
      </div>
    </div>
  )
}

export function Welcome({
  initialInvite,
  onFinish,
}: {
  initialInvite?: string
  onFinish: (result: WelcomeResult) => Promise<void>
}) {
  const [step, setStep] = useState(0)
  // Set when the account step was reached straight from the first one.
  const [skipped, setSkipped] = useState(false)

  // 1 - you and what to track
  const [name, setName] = useState('')
  const [pillars, setPillars] = useState<Pillar[]>([...PILLARS])

  // 2 - about you
  const [sex, setSex] = useState<Sex | null>(null)
  const [birthYear, setBirthYear] = useState('')
  const [feet, setFeet] = useState('')
  const [inches, setInches] = useState('')
  const [weight, setWeight] = useState('')

  // 3 - plan
  const [days, setDays] = useState<2 | 3>(3)
  const [equipment, setEquipment] = useState<Equipment>('gym')
  const [direction, setDirection] = useState<DietDirection>('lose')
  const [activity, setActivity] = useState<Activity>('moderate')
  const [targetWeight, setTargetWeight] = useState('')
  // Null until typed by hand; until then the field shows the suggestion.
  const [calorieText, setCalorieText] = useState<string | null>(null)
  const [goalEdits, setGoalEdits] = useState<WeeklyGoalConfig | null>(null)

  // 5 - coach
  const [provider, setProvider] = useState<ProviderId>(PROVIDERS[0].id)
  const [aiKey, setAiKey] = useState('')

  // 6 - account
  const [mode, setMode] = useState<WelcomeAccount['kind']>('invite')
  const [code, setCode] = useState((initialInvite ?? '').toUpperCase())
  const [token, setToken] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const on = (p: Pillar) => pillars.includes(p)
  const strengthOn = on('strength')
  const dietOn = on('diet')

  const heightFt = num(feet)
  const heightIn = heightFt === null ? null : heightFt * 12 + (num(inches) ?? 0)
  const weightLbs = num(weight)
  const birth = num(birthYear)

  const suggestedCalories =
    dietOn && sex && inRange(birth, BIRTH_LO, BIRTH_HI) && heightIn !== null && weightLbs !== null
      ? recommendCalories({
          sex,
          age: THIS_YEAR - birth,
          heightIn,
          weightLbs,
          activity,
          direction,
        })
      : null
  const calories = calorieText ?? (suggestedCalories === null ? '' : String(suggestedCalories))

  const suggestedGoals = recommendWeeklyGoals(pillars, strengthOn ? { daysPerWeek: days, equipment } : undefined)
  // A pillar switched on after the goals were edited has no edit to keep.
  const goals = maskGoals(
    {
      workouts: goalEdits?.workouts || suggestedGoals.workouts,
      flex: goalEdits?.flex || suggestedGoals.flex,
      calDays: goalEdits?.calDays || suggestedGoals.calDays,
      cardio: goalEdits?.cardio || suggestedGoals.cardio,
    },
    pillars,
  )

  const bumpGoal = (key: keyof WeeklyGoalConfig, by: number) => {
    const next = Math.min(7, Math.max(1, (goals[key] ?? 0) + by))
    setGoalEdits({ ...goals, [key]: next })
  }

  const togglePillar = (p: Pillar) =>
    setPillars((cur) => {
      if (!cur.includes(p)) return PILLARS.filter((x) => x === p || cur.includes(x))
      return cur.length > 1 ? cur.filter((x) => x !== p) : cur
    })

  const heightOk = heightIn === null ? feet.trim() === '' : inRange(heightFt, 3, 8) && inRange(num(inches) ?? 0, 0, 11)
  const aboutOk = dietOn
    ? sex !== null &&
      inRange(birth, BIRTH_LO, BIRTH_HI) &&
      heightOk &&
      heightIn !== null &&
      inRange(weightLbs, 50, 700)
    : heightOk && (weight.trim() === '' || inRange(weightLbs, 50, 700)) && (birthYear.trim() === '' || inRange(birth, BIRTH_LO, BIRTH_HI))

  const calorieNum = num(calories)
  const planOk =
    !dietOn || (inRange(calorieNum, 800, 6000) && (targetWeight.trim() === '' || inRange(num(targetWeight), 50, 700)))

  const accountOk =
    mode === 'local' || (mode === 'invite' ? code.trim() !== '' : token.trim() !== '')

  const valid = [name.trim() !== '', aboutOk, planOk, true, true, accountOk][step]

  const finish = async () => {
    const now = new Date()
    const profile: Profile = {
      name: name.trim(),
      pillars,
      ...(sex ? { sex } : {}),
      ...(inRange(birth, BIRTH_LO, BIRTH_HI) ? { birthYear: birth } : {}),
      ...(dietOn ? { activity, dietDirection: direction } : {}),
      ...(dietOn && inRange(num(targetWeight), 50, 700) ? { targetWeightLbs: num(targetWeight)! } : {}),
      ...(strengthOn ? { strength: { daysPerWeek: days, equipment } } : {}),
      weeklyGoals: [{ from: weekStartISO(toISODate(now)), goals }],
      calorieGoals: dietOn && calorieNum !== null ? [{ from: toISODate(now), goal: calorieNum }] : [],
      createdAt: now.toISOString(),
    }
    const key = aiKey.trim()
    const account: WelcomeAccount =
      mode === 'invite'
        ? { kind: 'invite', code: code.trim() }
        : mode === 'key'
          ? { kind: 'key', token: token.trim() }
          : { kind: 'local' }
    setPending(true)
    setError(null)
    try {
      await onFinish({
        profile,
        heightIn: heightIn !== null && heightOk ? heightIn : null,
        weightLbs: inRange(weightLbs, 50, 700) ? weightLbs : null,
        ai: key ? { provider, key } : null,
        account,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'something went wrong')
    } finally {
      setPending(false)
    }
  }

  const last = step === STEPS - 1
  const next = () => {
    if (pending || !valid) return
    if (last) void finish()
    else setStep(step + 1)
  }
  const nextLabel = last ? (pending ? 'starting…' : 'start') : step === 4 && !aiKey.trim() ? 'skip' : 'next'

  const heading = ['welcome', 'about you', 'your plan', 'theme', 'coach', 'account'][step]

  return (
    <div className={`flex min-h-full flex-col bg-bg ${SHELL_WIDTH} w-full ${SHELL_PAD_X} ${SHELL_PAD_TOP}`}>
      <div className="flex min-h-[44px] items-center justify-between">
        {step > 0 ? (
          <PressButton
            onPress={() => {
              if (pending) return
              if (skipped) {
                setSkipped(false)
                setStep(0)
              } else setStep(step - 1)
            }}
            className="min-h-[44px] pr-4 text-sm font-medium text-neutral-400"
          >
            back
          </PressButton>
        ) : (
          <span />
        )}
        <div className="flex gap-1.5" role="img" aria-label={`step ${step + 1} of ${STEPS}`}>
          {Array.from({ length: STEPS }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full ${i === step ? 'bg-accent' : 'bg-surface-2'}`}
            />
          ))}
        </div>
      </div>

      <h1 className="mb-6 mt-2 text-2xl font-bold">{heading}</h1>

      <div className="flex flex-1 flex-col gap-5">
        {step === 0 && (
          <>
            <label className="flex flex-col gap-2">
              <span className={LABEL}>name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="given-name"
                className={FIELD}
              />
            </label>
            <div role="group" aria-label="track" className="flex flex-col gap-2">
              <span className={LABEL}>track</span>
              <div className="grid grid-cols-2 gap-2">
                {PILLARS.map((p) => (
                  <PressButton
                    key={p}
                    onPress={() => togglePillar(p)}
                    pressed={on(p)}
                    className={`min-h-[72px] rounded-xl text-base font-semibold ${
                      on(p) ? 'bg-accent text-on-accent' : 'bg-surface text-neutral-400'
                    }`}
                  >
                    {PILLAR_LABELS[p]}
                  </PressButton>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <Segmented
              label="sex"
              value={sex}
              options={[
                { value: 'male' as Sex, label: 'male' },
                { value: 'female' as Sex, label: 'female' },
              ]}
              onChange={setSex}
            />
            <div className="flex gap-3">
              <NumberField label="birth year" value={birthYear} onChange={setBirthYear} placeholder="1990" />
            </div>
            <div className="flex gap-3">
              <NumberField label="height (ft)" value={feet} onChange={setFeet} />
              <NumberField label="height (in)" value={inches} onChange={setInches} />
            </div>
            <div className="flex gap-3">
              <NumberField label="weight (lbs)" value={weight} onChange={setWeight} decimal />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            {strengthOn && (
              <>
                <Segmented
                  label="lifting days a week"
                  value={days}
                  options={[
                    { value: 2 as 2 | 3, label: '2' },
                    { value: 3 as 2 | 3, label: '3' },
                  ]}
                  onChange={setDays}
                />
                <Segmented
                  label="equipment"
                  value={equipment}
                  options={(Object.keys(EQUIPMENT_LABELS) as Equipment[]).map((v) => ({
                    value: v,
                    label: EQUIPMENT_LABELS[v],
                  }))}
                  onChange={setEquipment}
                />
              </>
            )}
            {dietOn && (
              <>
                <Segmented
                  label="goal"
                  value={direction}
                  options={(Object.keys(DIET_LABELS) as DietDirection[]).map((v) => ({
                    value: v,
                    label: DIET_LABELS[v],
                  }))}
                  onChange={setDirection}
                />
                <Segmented
                  label="activity"
                  value={activity}
                  options={(Object.keys(ACTIVITY_LABELS) as Activity[]).map((v) => ({
                    value: v,
                    label: ACTIVITY_LABELS[v],
                  }))}
                  onChange={setActivity}
                />
                <div className="flex gap-3">
                  <NumberField label="target weight (lbs)" value={targetWeight} onChange={setTargetWeight} decimal />
                  <NumberField
                    label="calories a day"
                    value={calories}
                    onChange={setCalorieText}
                  />
                </div>
              </>
            )}
            <div role="group" aria-label="weekly goals" className="flex flex-col gap-2">
              <span className={LABEL}>weekly goals</span>
              {GOAL_ROWS.filter((r) => on(r.pillar)).map((r) => (
                <div key={r.key} className="flex min-h-[44px] items-center gap-3 rounded-xl bg-surface px-3">
                  <span className="flex-1 text-sm">{r.label}</span>
                  <PressButton
                    onPress={() => bumpGoal(r.key, -1)}
                    label={`fewer ${r.label}`}
                    disabled={(goals[r.key] ?? 0) <= 1}
                    className="h-11 w-11 rounded-lg bg-surface-2 text-lg font-semibold aria-disabled:text-neutral-600"
                  >
                    −
                  </PressButton>
                  <span className="w-6 text-center font-semibold tabular-nums">{goals[r.key] ?? 0}</span>
                  <PressButton
                    onPress={() => bumpGoal(r.key, 1)}
                    label={`more ${r.label}`}
                    disabled={(goals[r.key] ?? 0) >= 7}
                    className="h-11 w-11 rounded-lg bg-surface-2 text-lg font-semibold aria-disabled:text-neutral-600"
                  >
                    +
                  </PressButton>
                </div>
              ))}
            </div>
          </>
        )}

        {step === 3 && <ThemeStep />}

        {step === 4 && (
          <>
            <label className="flex flex-col gap-2">
              <span className={LABEL}>ai provider</span>
              <select
                value={provider}
                onChange={(e) => setProvider(providerOf(e.target.value).id)}
                className={FIELD}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className={LABEL}>api key</span>
              <input
                type="password"
                value={aiKey}
                onChange={(e) => setAiKey(e.target.value)}
                placeholder={providerOf(provider).keyHint}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className={FIELD}
              />
            </label>
          </>
        )}

        {step === 5 && (
          <>
            <Segmented
              label="account"
              value={mode}
              options={[
                { value: 'invite' as WelcomeAccount['kind'], label: 'invite code' },
                { value: 'key' as WelcomeAccount['kind'], label: 'account key' },
                { value: 'local' as WelcomeAccount['kind'], label: 'this phone' },
              ]}
              onChange={(m) => {
                setMode(m)
                setError(null)
              }}
            />
            {mode === 'invite' && (
              <label className="flex flex-col gap-2">
                <span className={LABEL}>invite code</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className={`${FIELD} font-mono uppercase`}
                />
              </label>
            )}
            {mode === 'key' && (
              <label className="flex flex-col gap-2">
                <span className={LABEL}>account key</span>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className={FIELD}
                />
              </label>
            )}
          </>
        )}
      </div>

      <div className="sticky bottom-0 mt-6 flex flex-col gap-2 bg-bg pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">
        {error && last && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <PressButton
          onPress={next}
          disabled={!valid || pending}
          className="min-h-[48px] w-full rounded-xl bg-accent font-semibold text-on-accent aria-disabled:opacity-50"
        >
          {nextLabel}
        </PressButton>
        {step === 0 && (
          <PressButton
            onPress={() => {
              setMode('key')
              setError(null)
              setSkipped(true)
              setStep(STEPS - 1)
            }}
            className="min-h-[44px] w-full rounded-xl text-sm font-medium text-neutral-400"
          >
            i already have an account
          </PressButton>
        )}
      </div>
    </div>
  )
}
