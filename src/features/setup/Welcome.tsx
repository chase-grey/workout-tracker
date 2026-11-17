import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ACTIVITY_LABELS,
  DIET_LABELS,
  EQUIPMENT_LABELS,
  LIFT_DAYS,
  MUSCLES,
  MUSCLE_LABELS,
  PILLARS,
  PILLAR_LABELS,
  WORKOUT_MINUTES,
  type Activity,
  type DietDirection,
  type Equipment,
  type LiftDays,
  type Muscle,
  type Pillar,
  type Profile,
  type Sex,
  SEX_LABELS,
} from '../../lib/profile'
import type { WeeklyGoalConfig } from '../../lib/weeklyStreak'
import { buildPlan, fitStatus } from '../../lib/planBuilder'
import { planFor } from '../../config/planTemplates'
import type { Plan } from '../../config/plan'
import { CompanionSheet } from '../companion/CompanionFlow'
import { CardioGoalForm } from '../today/CardioGoalForm'
import { PROVIDERS, providerOf, type ProviderId } from '../../lib/aiProvider'
import { ACCENTS, MODES, palette } from '../../lib/theme'
import { setTheme, useTheme } from '../../lib/themeStore'
import { usePressAction } from '../../lib/usePressAction'
import { useFieldInView } from '../../lib/useFieldInView'
import { useEnterNext } from '../../lib/useEnterNext'
import { SHELL_PAD_TOP, SHELL_PAD_X, SHELL_WIDTH } from '../../lib/shell'
import { emailOk, loginOk } from '../../lib/login'
import { LoginFields } from './LoginFields'
import { QrScanner } from './QrScanner'
import { signInLink } from '../../lib/signInLink'
import { MdQrCodeScanner } from 'react-icons/md'
import {
  aiPlanEdit,
  aiPlanFor,
  buildProfile,
  derive,
  strengthOf,
  withWorkoutGoal,
  type AiPlanEdit,
  emptyForm,
  invalidSections,
  togglePillar,
  toggleScheduleDay,
  visibleSections,
  withDays,
  withGoal,
  type CoachPath,
  type FormState,
  type SectionId,
} from '../../lib/welcomeForm'
import { PINNABLE, PIN_LABEL, WEEKDAY_SHORT, type CalendarPins } from '../../lib/weekCalendar'

/**
 * Every device belongs to an account: a new one made here, or one signed back
 * into. `signin` takes a pasted sign-in link in the email field too (see
 * lib/signInLink), which is how an iPhone carries a QR's sign-in into the
 * installed app.
 */
export type WelcomeAccount =
  | { kind: 'create'; email: string; password: string }
  | { kind: 'signin'; email: string; password: string }

/** What the form itself answers, with or without an account to go with it. */
export type SetupResult = {
  profile: Profile
  /** The plan as an AI changed it in the strength section; absent, the plan is built from the answers. */
  plan?: Plan
  heightIn: number | null
  weightLbs: number | null
  ai: { provider: ProviderId; key: string } | null
  /** The coach was chosen as copy-and-paste into another AI app: no key. */
  coachPaste: boolean
  /** The weekdays each kind of session falls on, for the week calendar's standing schedule. */
  schedule: CalendarPins
}

export type WelcomeResult = SetupResult & { account: WelcomeAccount }

const FIELD =
  'min-h-[44px] rounded-xl bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent'
const LABEL = 'text-sm font-medium text-neutral-300'

/**
 * A button that fires on release even when the press blurred a field and the
 * keyboard's closing reflowed the page. A disabled one stays in the tab order
 * and swallows the press instead, since a native `disabled` gets no pointer
 * events; `onBlocked` hears that swallowed press.
 */
function PressButton({
  onPress,
  onBlocked,
  disabled,
  className,
  pressed,
  label,
  children,
}: {
  onPress: () => void
  onBlocked?: () => void
  disabled?: boolean
  className: string
  pressed?: boolean
  label?: string
  children: ReactNode
}) {
  const press = usePressAction(() => {
    if (disabled) onBlocked?.()
    else onPress()
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

function Segmented<T extends string | number | boolean>({
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

const YES_NO: { value: boolean; label: string }[] = [
  { value: true, label: 'yes' },
  { value: false, label: 'no' },
]

const GOAL_ROWS: { pillar: Pillar; key: keyof WeeklyGoalConfig; label: string }[] = [
  { pillar: 'strength', key: 'workouts', label: 'workouts' },
  { pillar: 'flexibility', key: 'flex', label: 'stretches' },
  { pillar: 'cardio', key: 'cardio', label: 'cardio days' },
  { pillar: 'diet', key: 'calDays', label: 'days on calorie target' },
]

const SECTION_TITLES: Record<SectionId, string> = {
  you: 'you',
  track: 'what to track',
  about: 'about you',
  strength: 'strength plan',
  cardio: 'cardio goal',
  diet: 'diet',
  goals: 'weekly goals',
  schedule: 'set days (optional)',
  theme: 'theme',
  coach: 'ai coach',
  account: 'account',
}

/** What the in-app coach can really do, from its prompt and tools (lib/chatPrompt, features/chat). */
const COACH_CAN = [
  'reads your plan, workouts, weight and streaks',
  'builds and edits your workout plan, once you approve each change',
  'edits your stretch routines',
  'answers from your own history',
  'notes when a joint felt off',
]

function Section({
  id,
  bad,
  children,
}: {
  id: SectionId
  bad: boolean
  children: ReactNode
}) {
  return (
    <section
      data-section={id}
      className={`-m-3 flex scroll-mt-4 flex-col gap-4 rounded-2xl p-3 ${bad ? 'ring-1 ring-red-400/70' : ''}`}
    >
      <h2 className={`text-lg font-bold ${bad ? 'text-red-400' : ''}`}>{SECTION_TITLES[id]}</h2>
      {children}
    </section>
  )
}

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
      <p className="text-xs text-neutral-500">you can change these later in settings</p>
    </div>
  )
}

function CoachStep({ f, set }: { f: FormState; set: (patch: Partial<FormState>) => void }) {
  const pick = (path: CoachPath) =>
    set({ coachPath: path, ...(path === 'paste' ? { aiKey: '' } : {}) })
  return (
    <>
      <Segmented
        label="want an ai coach?"
        value={f.wantCoach}
        options={[
          { value: true, label: 'yes' },
          { value: false, label: 'not now' },
        ]}
        onChange={(v) => set({ wantCoach: v })}
      />
      {f.wantCoach === false && <p className="text-xs text-neutral-500">you can set one up any time in settings</p>}
      {f.wantCoach && (
        <div className="flex flex-col gap-3">
          <PressButton
            onPress={() => pick('key')}
            pressed={f.coachPath === 'key'}
            className={`flex flex-col gap-2 rounded-xl p-3 text-left ${
              f.coachPath === 'key' ? 'bg-surface ring-2 ring-accent' : 'bg-surface'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="text-base font-semibold">use my own api key</span>
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">recommended</span>
            </span>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-neutral-300">
              {COACH_CAN.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </PressButton>
          {f.coachPath === 'key' && (
            <>
              <label className="flex flex-col gap-2">
                <span className={LABEL}>ai provider</span>
                <select
                  value={f.provider}
                  onChange={(e) => set({ provider: providerOf(e.target.value).id })}
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
                  value={f.aiKey}
                  onChange={(e) => set({ aiKey: e.target.value })}
                  placeholder={providerOf(f.provider).keyHint}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className={FIELD}
                />
              </label>
            </>
          )}
          <PressButton
            onPress={() => pick('paste')}
            pressed={f.coachPath === 'paste'}
            className={`flex flex-col gap-1 rounded-xl p-3 text-left ${
              f.coachPath === 'paste' ? 'bg-surface ring-2 ring-accent' : 'bg-surface'
            }`}
          >
            <span className="text-base font-semibold">copy & paste into another ai app</span>
            <span className="text-sm text-neutral-300">no key needed</span>
          </PressButton>
        </div>
      )}
    </>
  )
}

/**
 * The whole setup, one scrolling page. `account` is whether it ends in an
 * account (first run) or not (update goals, restart); `coach` whether the coach
 * is asked about. Submitting with something missing scrolls to and marks the
 * first section that needs it.
 */
function SetupForm({
  initial,
  account,
  coach,
  heading,
  submitLabel,
  pendingLabel,
  onSubmit,
  onCancel,
}: {
  initial: FormState
  account: boolean
  coach: boolean
  heading: string
  submitLabel: string
  pendingLabel: string
  onSubmit: (result: SetupResult, account: WelcomeAccount | null) => Promise<void>
  onCancel?: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  useFieldInView(rootRef)
  const onKeyDown = useEnterNext(rootRef)

  const [f, setF] = useState<FormState>(initial)
  const set = (patch: Partial<FormState>) => setF((cur) => ({ ...cur, ...patch }))

  const [view, setView] = useState<'form' | 'signin'>('form')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [scanning, setScanning] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Sections are marked only once a submit has been tried.
  const [tried, setTried] = useState(false)
  const [serverBad, setServerBad] = useState(false)

  const signingIn = view === 'signin'
  const on = (p: Pillar) => f.pillars.includes(p)
  const d = derive(f)
  // The plan builder's own verdict on the answers so far, so a pick that won't fit shows before it's a surprise.
  const { days, equipment, focus, minutes } = f
  const fit = useMemo(() => {
    const setup = { daysPerWeek: days, equipment, focus, minutes }
    const build = buildPlan(setup)
    return { unfitted: build.unfitted, status: fitStatus(setup, build) }
  }, [days, equipment, focus, minutes])
  const toggleFocus = (m: Muscle) =>
    set({ focus: f.focus.includes(m) ? f.focus.filter((x) => x !== m) : [...f.focus, m] })

  // A plan an AI changed on top of the built one, offered on first setup only.
  // It holds while the answers it was built on do (see lib/welcomeForm aiPlanFor).
  const [aiEdit, setAiEdit] = useState<AiPlanEdit | null>(null)
  const aiPlan = account ? aiPlanFor(f, aiEdit) : null
  const [aiOpen, setAiOpen] = useState(false)
  const [aiToday] = useState(() => new Date())

  const accountOk = signingIn
    ? /^https?:\/\//i.test(email.trim()) || (emailOk(email) && password !== '')
    : loginOk(email, password)
  const problems = signingIn
    ? accountOk
      ? []
      : (['account'] as SectionId[])
    : invalidSections(f, { account, accountOk, coach })
  const bad = (id: SectionId) => (tried && problems.includes(id)) || (id === 'account' && serverBad)

  const scrollTo = (id: SectionId) =>
    rootRef.current
      ?.querySelector(`[data-section="${id}"]`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' })

  const bumpGoal = (key: keyof WeeklyGoalConfig, by: number) => {
    const next = Math.min(7, Math.max(1, (d.goals[key] ?? 0) + by))
    setF((cur) => withGoal(cur, key, next))
  }

  const run = async (acct: WelcomeAccount | null, form: FormState = f) => {
    const fd = derive(form)
    const key = form.aiKey.trim()
    setPending(true)
    setError(null)
    setServerBad(false)
    try {
      await onSubmit(
        {
          profile: buildProfile(form),
          ...(form === f && aiPlan ? { plan: aiPlan } : {}),
          heightIn: fd.heightIn !== null && fd.heightOk ? fd.heightIn : null,
          weightLbs: fd.weightLbs !== null && fd.weightLbs >= 50 && fd.weightLbs <= 700 ? fd.weightLbs : null,
          ai: coach && form.wantCoach && form.coachPath === 'key' && key ? { provider: form.provider, key } : null,
          coachPaste: coach && form.wantCoach === true && form.coachPath === 'paste',
          schedule: fd.schedule,
        },
        acct,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'something went wrong')
      setServerBad(true)
      if (account) requestAnimationFrame(() => scrollTo('account'))
    } finally {
      setPending(false)
    }
  }

  const submit = () => {
    if (pending) return
    if (problems.length > 0) {
      setTried(true)
      scrollTo(problems[0])
      return
    }
    if (signingIn) void run({ kind: 'signin', email: email.trim(), password }, emptyForm())
    else void run(account ? { kind: 'create', email: email.trim(), password } : null)
  }

  const label = signingIn ? (pending ? 'signing in…' : 'sign in') : pending ? pendingLabel : submitLabel
  const showAccount = account && !signingIn
  const sections = visibleSections(f, { account: false, coach })

  const submitBar = (
    <div className="sticky bottom-0 mt-6 flex flex-col gap-2 bg-bg pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <PressButton
        onPress={submit}
        onBlocked={submit}
        disabled={problems.length > 0 || pending}
        className="min-h-[48px] w-full rounded-xl bg-accent font-semibold text-on-accent aria-disabled:opacity-50"
      >
        {label}
      </PressButton>
    </div>
  )

  const scanner = scanning && (
    <QrScanner
      onCredential={(cred) => {
        setScanning(false)
        void run({ kind: 'signin', email: signInLink(location.href, cred), password: '' }, emptyForm())
      }}
      onClose={() => setScanning(false)}
    />
  )

  const rootClass = `flex min-h-full flex-col bg-bg ${SHELL_WIDTH} w-full ${SHELL_PAD_X} ${SHELL_PAD_TOP}`

  if (signingIn) {
    return (
      <div ref={rootRef} onKeyDown={onKeyDown} className={rootClass}>
        <div className="flex min-h-[44px] items-center">
          <PressButton
            onPress={() => {
              if (pending) return
              setView('form')
              setError(null)
            }}
            className="min-h-[44px] pr-4 text-sm font-medium text-neutral-400"
          >
            back
          </PressButton>
        </div>
        <h1 className="mb-6 mt-2 text-2xl font-bold">sign in</h1>
        <div className="flex flex-1 flex-col gap-5" data-section="account">
          <LoginFields
            email={email}
            password={password}
            onEmail={setEmail}
            onPassword={setPassword}
            fresh={false}
            fieldClass={FIELD}
            labelClass={LABEL}
          />
          <PressButton
            onPress={() => {
              if (pending) return
              setError(null)
              setScanning(true)
            }}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-surface font-semibold active:bg-surface-2"
          >
            <MdQrCodeScanner className="text-xl" aria-hidden />
            scan QR code
          </PressButton>
          {scanner}
        </div>
        {submitBar}
      </div>
    )
  }

  return (
    <div ref={rootRef} onKeyDown={onKeyDown} className={rootClass}>
      <div className="flex min-h-[44px] items-center">
        {onCancel && (
          <PressButton
            onPress={() => !pending && onCancel()}
            className="min-h-[44px] pr-4 text-sm font-medium text-neutral-400"
          >
            cancel
          </PressButton>
        )}
      </div>
      <h1 className="mb-6 mt-2 text-2xl font-bold">{heading}</h1>

      {account && (
        <PressButton
          onPress={() => {
            setError(null)
            setView('signin')
          }}
          className="mb-8 min-h-[48px] w-full rounded-xl bg-surface font-semibold active:bg-surface-2"
        >
          i already have an account
        </PressButton>
      )}

      <div className="flex flex-1 flex-col gap-10">
        {sections.map((id) => (
          <Section key={id} id={id} bad={bad(id)}>
            {id === 'you' && (
              <label className="flex flex-col gap-2">
                <span className={LABEL}>name</span>
                <input
                  value={f.name}
                  onChange={(e) => set({ name: e.target.value })}
                  autoComplete="given-name"
                  className={FIELD}
                />
              </label>
            )}

            {id === 'track' && (
              <div role="group" aria-label="track" className="grid grid-cols-2 gap-2">
                {PILLARS.map((p) => (
                  <PressButton
                    key={p}
                    onPress={() => set({ pillars: togglePillar(f.pillars, p, PILLARS) })}
                    pressed={on(p)}
                    className={`min-h-[72px] rounded-xl text-base font-semibold ${
                      on(p) ? 'bg-accent text-on-accent' : 'bg-surface text-neutral-400'
                    }`}
                  >
                    {PILLAR_LABELS[p]}
                  </PressButton>
                ))}
              </div>
            )}

            {id === 'about' && (
              <>
                <Segmented
                  label="sex"
                  value={f.sex}
                  options={(Object.keys(SEX_LABELS) as Sex[]).map((v) => ({ value: v, label: SEX_LABELS[v] }))}
                  onChange={(v) => set({ sex: v })}
                />
                <div className="flex gap-3">
                  <NumberField label="birth year" value={f.birthYear} onChange={(v) => set({ birthYear: v })} placeholder="1990" />
                </div>
                <div className="flex gap-3">
                  <NumberField label="height (ft)" value={f.feet} onChange={(v) => set({ feet: v })} />
                  <NumberField label="height (in)" value={f.inches} onChange={(v) => set({ inches: v })} />
                </div>
                <div className="flex gap-3">
                  <NumberField label="weight (lbs)" value={f.weight} onChange={(v) => set({ weight: v })} decimal />
                </div>
                <Segmented
                  label="do you have a scale?"
                  value={f.scale}
                  options={YES_NO}
                  onChange={(v) => set({ scale: v })}
                />
                <Segmented
                  label="can you measure body fat %, like with a smart scale?"
                  value={f.bodyFat}
                  options={YES_NO}
                  onChange={(v) => set({ bodyFat: v })}
                />
              </>
            )}

            {id === 'strength' && (
              <>
                <Segmented<LiftDays>
                  label="lifting days a week"
                  value={f.days}
                  options={LIFT_DAYS.map((n) => ({ value: n, label: String(n) }))}
                  onChange={(v) => setF((cur) => withDays(cur, v))}
                />
                <Segmented
                  label="equipment"
                  value={f.equipment}
                  options={(Object.keys(EQUIPMENT_LABELS) as Equipment[]).map((v) => ({
                    value: v,
                    label: EQUIPMENT_LABELS[v],
                  }))}
                  onChange={(v) => set({ equipment: v })}
                />
                <Segmented
                  label="workout length"
                  value={f.minutes}
                  options={WORKOUT_MINUTES.map((m) => ({ value: m, label: `${m} min` }))}
                  onChange={(v) => set({ minutes: v })}
                />
                <div role="group" aria-label="muscles to grow" className="flex flex-col gap-2">
                  <span className={LABEL}>muscles to grow</span>
                  <div className="grid grid-cols-3 gap-2">
                    {MUSCLES.map((m) => {
                      const picked = f.focus.includes(m)
                      const left = picked && fit.unfitted.includes(m)
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
                  <p role="status" className="text-sm text-neutral-300">
                    {fit.status}
                  </p>
                </div>
                {account &&
                  (aiPlan ? (
                    <div className="flex min-h-[44px] items-center gap-2 rounded-xl bg-surface pl-3 pr-1">
                      <span className="flex-1 text-sm font-medium">built with your AI</span>
                      <PressButton
                        onPress={() => setAiOpen(true)}
                        className="min-h-[44px] rounded-lg px-3 text-sm font-medium text-neutral-300"
                      >
                        edit
                      </PressButton>
                      <PressButton
                        onPress={() => setAiEdit(null)}
                        className="min-h-[44px] rounded-lg px-3 text-sm font-medium text-neutral-300"
                      >
                        undo
                      </PressButton>
                    </div>
                  ) : (
                    <PressButton
                      onPress={() => setAiOpen(true)}
                      className="min-h-[44px] rounded-xl bg-surface px-3 text-sm font-semibold active:bg-surface-2"
                    >
                      build with your AI
                    </PressButton>
                  ))}
                {aiOpen && (
                  <CompanionSheet
                    state={{ plan: aiPlan ?? planFor(strengthOf(f)), weeklyWorkouts: d.goals.workouts || null }}
                    today={aiToday}
                    profile={buildProfile(f, aiToday)}
                    heightIn={d.heightIn !== null && d.heightOk ? d.heightIn : undefined}
                    workouts={[]}
                    onApply={(next) => {
                      setAiEdit(aiPlanEdit(f, next.plan))
                      setF((cur) => withWorkoutGoal(cur, next.weeklyWorkouts))
                    }}
                    onClose={() => setAiOpen(false)}
                  />
                )}
              </>
            )}

            {id === 'cardio' && <CardioGoalForm onSaved={() => {}} daysPerWeek={d.goals.cardio || undefined} />}

            {id === 'diet' && (
              <>
                <Segmented
                  label="goal"
                  value={f.direction}
                  options={(Object.keys(DIET_LABELS) as DietDirection[]).map((v) => ({
                    value: v,
                    label: DIET_LABELS[v],
                  }))}
                  onChange={(v) => set({ direction: v })}
                />
                <Segmented
                  label="active days a week"
                  value={f.activity}
                  options={(Object.keys(ACTIVITY_LABELS) as Activity[]).map((v) => ({
                    value: v,
                    label: ACTIVITY_LABELS[v],
                  }))}
                  onChange={(v) => set({ activity: v })}
                />
                <div className="flex gap-3">
                  {f.scale && (
                    <NumberField
                      label="target weight (lbs)"
                      value={f.targetWeight}
                      onChange={(v) => set({ targetWeight: v })}
                      decimal
                    />
                  )}
                  <NumberField
                    label="target calories"
                    value={d.calories}
                    onChange={(v) => set({ calorieText: v })}
                  />
                </div>
                {d.suggestedCalories !== null && (
                  <div className="flex items-center gap-3">
                    <p className="flex-1 text-xs text-neutral-400">
                      suggested {d.suggestedCalories} a day, from your height, weight, age, activity & goal
                    </p>
                    {f.calorieText !== null && f.calorieText !== String(d.suggestedCalories) && (
                      <PressButton
                        onPress={() => set({ calorieText: null })}
                        className="min-h-[44px] shrink-0 rounded-lg bg-surface px-3 text-sm font-medium"
                      >
                        use {d.suggestedCalories}
                      </PressButton>
                    )}
                  </div>
                )}
              </>
            )}

            {id === 'goals' &&
              GOAL_ROWS.filter((r) => on(r.pillar)).map((r) => (
                <div key={r.key} className="flex min-h-[44px] items-center gap-3 rounded-xl bg-surface px-3">
                  <span className="flex-1 text-sm">{r.label}</span>
                  <PressButton
                    onPress={() => bumpGoal(r.key, -1)}
                    label={`fewer ${r.label}`}
                    disabled={(d.goals[r.key] ?? 0) <= 1}
                    className="h-11 w-11 rounded-lg bg-surface-2 text-lg font-semibold aria-disabled:text-neutral-600"
                  >
                    −
                  </PressButton>
                  <span className="w-6 text-center font-semibold tabular-nums">{d.goals[r.key] ?? 0}</span>
                  <PressButton
                    onPress={() => bumpGoal(r.key, 1)}
                    label={`more ${r.label}`}
                    disabled={(d.goals[r.key] ?? 0) >= 7}
                    className="h-11 w-11 rounded-lg bg-surface-2 text-lg font-semibold aria-disabled:text-neutral-600"
                  >
                    +
                  </PressButton>
                </div>
              ))}

            {id === 'schedule' &&
              PINNABLE.filter(on).map((p) => (
                <div key={p} role="group" aria-label={PIN_LABEL[p]} className="flex flex-col gap-2">
                  <span className={LABEL}>{PIN_LABEL[p]}</span>
                  <div className="grid grid-cols-7 gap-1">
                    {WEEKDAY_SHORT.map((name, w) => {
                      const picked = d.schedule[p]?.includes(w) ?? false
                      return (
                        <PressButton
                          key={w}
                          onPress={() => setF((cur) => toggleScheduleDay(cur, p, w))}
                          pressed={picked}
                          label={name}
                          className={`min-h-[44px] rounded-xl text-sm font-medium ${
                            picked ? 'bg-accent text-on-accent' : 'bg-surface text-neutral-400'
                          }`}
                        >
                          {name[0]}
                        </PressButton>
                      )
                    })}
                  </div>
                </div>
              ))}

            {id === 'theme' && <ThemeStep />}

            {id === 'coach' && <CoachStep f={f} set={set} />}
          </Section>
        ))}

        {showAccount && (
          <Section id="account" bad={bad('account')}>
            <LoginFields
              email={email}
              password={password}
              onEmail={setEmail}
              onPassword={setPassword}
              fresh
              fieldClass={FIELD}
              labelClass={LABEL}
            />
          </Section>
        )}
      </div>

      {submitBar}
    </div>
  )
}

/** First setup: the form, then an account made or signed into. */
export function Welcome({ onFinish }: { onFinish: (result: WelcomeResult) => Promise<void> }) {
  return (
    <SetupForm
      initial={emptyForm()}
      account
      coach
      heading="welcome"
      submitLabel="start"
      pendingLabel="starting…"
      onSubmit={(r, account) => onFinish({ ...r, account: account! })}
    />
  )
}

/**
 * The same form for an account that already exists: prefilled to amend it
 * ("update goals") or blank to begin again ("restart"). It has no account
 * section, and no coach section either — that lives in Settings.
 */
export function SetupEditor({
  initial,
  heading,
  submitLabel,
  onFinish,
  onCancel,
}: {
  initial: FormState
  heading: string
  submitLabel: string
  onFinish: (result: SetupResult) => Promise<void>
  onCancel: () => void
}) {
  return (
    <SetupForm
      initial={initial}
      account={false}
      coach={false}
      heading={heading}
      submitLabel={submitLabel}
      pendingLabel="saving…"
      onSubmit={(r) => onFinish(r)}
      onCancel={onCancel}
    />
  )
}
