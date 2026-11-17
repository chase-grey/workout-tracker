/**
 * The welcome form's state and rules, kept out of the component so they can be
 * tested: what each section needs before the form can be submitted, what the
 * suggested numbers are, and how a finished form becomes (or amends) a Profile.
 *
 * The same form runs three ways: first setup, "update goals" from Settings
 * (prefilled, no account), and a restart (blank, no account).
 */

import {
  maskGoals,
  profileCalorieGoal,
  readsBodyFat,
  weighsIn,
  withCalorieGoal,
  withWeeklyGoals,
  type Activity,
  type DietDirection,
  type Equipment,
  type LiftDays,
  type Muscle,
  type Pillar,
  type Profile,
  type Sex,
  type StrengthSetup,
  type WorkoutMinutes,
} from './profile'
import { recommendCalories, recommendWeeklyGoals } from './recommend'
import type { WeeklyGoalConfig } from './weeklyStreak'
import { toISODate, weekStartISO } from './dates'
import { starterDays } from '../config/planTemplates'
import { PROVIDERS, type ProviderId } from './aiProvider'
import { DEFAULT_MINUTES } from './planBuilder'
import type { Plan } from '../config/plan'
import { PINNABLE, toggleWeekday, type CalendarPins, type PinnablePillar } from './weekCalendar'

/** The form's sections, top to bottom. */
export type SectionId =
  | 'you'
  | 'track'
  | 'about'
  | 'strength'
  | 'cardio'
  | 'diet'
  | 'goals'
  | 'schedule'
  | 'theme'
  | 'coach'
  | 'account'

export const SECTION_ORDER: SectionId[] = [
  'you',
  'track',
  'about',
  'strength',
  'cardio',
  'diet',
  'goals',
  'schedule',
  'theme',
  'coach',
  'account',
]

export type CoachPath = 'key' | 'paste'

export type FormState = {
  name: string
  pillars: Pillar[]
  sex: Sex | null
  birthYear: string
  feet: string
  inches: string
  weight: string
  scale: boolean | null
  bodyFat: boolean | null
  days: LiftDays
  equipment: Equipment
  minutes: WorkoutMinutes
  /** The muscles to grow, in the order picked. */
  focus: Muscle[]
  direction: DietDirection
  activity: Activity
  targetWeight: string
  /** Null until typed by hand; until then the field shows the suggestion. */
  calorieText: string | null
  /** Null until a goal is nudged by hand; until then the goals follow the suggestion. */
  goalEdits: WeeklyGoalConfig | null
  /**
   * The weekdays picked for each kind of session. Null, or a pillar left out,
   * is no days: the week is planned only by someone who wants it planned.
   */
  scheduleEdits: CalendarPins | null
  /** Null until answered. */
  wantCoach: boolean | null
  coachPath: CoachPath | null
  provider: ProviderId
  aiKey: string
}

export function emptyForm(): FormState {
  return {
    name: '',
    pillars: [],
    sex: null,
    birthYear: '',
    feet: '',
    inches: '',
    weight: '',
    scale: null,
    bodyFat: null,
    days: 3,
    equipment: 'gym',
    // What the welcome flow has always opened on; a saved profile without an answer reads as DEFAULT_MINUTES.
    minutes: 45,
    focus: [],
    direction: 'lose',
    activity: 'moderate',
    targetWeight: '',
    calorieText: null,
    goalEdits: null,
    scheduleEdits: null,
    wantCoach: null,
    coachPath: null,
    provider: PROVIDERS[0].id,
    aiKey: '',
  }
}

export const BIRTH_LO = 1920
export const birthHi = (now: Date) => now.getFullYear() - 10

export function num(s: string): number | null {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function inRange(n: number | null, lo: number, hi: number): n is number {
  return n !== null && n >= lo && n <= hi
}

const trimNum = (n: number) => String(Math.round(n * 10) / 10)

/** The goals in force on a profile, as plain numbers. */
export function goalsInForce(p: Profile): WeeklyGoalConfig {
  const g = p.weeklyGoals[p.weeklyGoals.length - 1]?.goals
  return { workouts: g?.workouts ?? 0, flex: g?.flex ?? 0, calDays: g?.calDays ?? 0, cardio: g?.cardio ?? 0 }
}

/** A form holding what `profile` says now, for editing. */
export function formFromProfile(
  profile: Profile,
  extra: { heightIn?: number | null; weightLbs?: number | null; today?: string; pins?: CalendarPins } = {},
): FormState {
  const f = emptyForm()
  const today = extra.today ?? toISODate(new Date())
  const calories = profileCalorieGoal(profile, today)
  const heightIn = extra.heightIn ?? null
  return {
    ...f,
    name: profile.name,
    pillars: [...profile.pillars],
    sex: profile.sex ?? null,
    birthYear: profile.birthYear ? String(profile.birthYear) : '',
    feet: heightIn ? String(Math.floor(heightIn / 12)) : '',
    inches: heightIn ? trimNum(heightIn % 12) : '',
    weight: extra.weightLbs ? trimNum(extra.weightLbs) : '',
    scale: weighsIn(profile),
    bodyFat: readsBodyFat(profile),
    days: profile.strength?.daysPerWeek ?? f.days,
    equipment: profile.strength?.equipment ?? f.equipment,
    minutes: profile.strength?.minutes ?? DEFAULT_MINUTES,
    focus: profile.strength?.focus ? [...profile.strength.focus] : [],
    direction: profile.dietDirection ?? f.direction,
    activity: profile.activity ?? f.activity,
    targetWeight: profile.targetWeightLbs ? trimNum(profile.targetWeightLbs) : '',
    calorieText: calories ? String(calories) : null,
    goalEdits: goalsInForce(profile),
    scheduleEdits: extra.pins ?? null,
  }
}


export type Derived = {
  heightFt: number | null
  heightIn: number | null
  heightOk: boolean
  weightLbs: number | null
  birth: number | null
  suggestedCalories: number | null
  /** What the calorie field shows: the typed figure, else the suggestion. */
  calories: string
  calorieNum: number | null
  goals: WeeklyGoalConfig
  /** The weekdays picked for each tracked kind of session; empty where none were. */
  schedule: CalendarPins
}

/** Everything the form shows or checks that is worked out from what was typed. */
export function derive(f: FormState, now: Date = new Date()): Derived {
  const strengthOn = f.pillars.includes('strength')
  const dietOn = f.pillars.includes('diet')
  const heightFt = num(f.feet)
  const heightIn = heightFt === null ? null : heightFt * 12 + (num(f.inches) ?? 0)
  const heightOk =
    heightIn === null ? f.feet.trim() === '' : inRange(heightFt, 3, 8) && inRange(num(f.inches) ?? 0, 0, 11)
  const weightLbs = num(f.weight)
  const birth = num(f.birthYear)
  const age = birth === null ? null : now.getFullYear() - birth

  const suggestedCalories =
    dietOn && f.sex && age !== null && inRange(birth, BIRTH_LO, birthHi(now)) && heightIn !== null && heightOk && inRange(weightLbs, 50, 700)
      ? recommendCalories({
          sex: f.sex,
          age,
          heightIn,
          weightLbs,
          activity: f.activity,
          direction: f.direction,
        })
      : null
  const calories = f.calorieText ?? (suggestedCalories === null ? '' : String(suggestedCalories))

  const suggested = recommendWeeklyGoals(f.pillars, strengthOn ? { daysPerWeek: f.days, equipment: f.equipment } : undefined)
  // A pillar switched on after the goals were edited has no edit to keep.
  const goals = maskGoals(
    {
      workouts: f.goalEdits?.workouts || suggested.workouts,
      flex: f.goalEdits?.flex || suggested.flex,
      calDays: f.goalEdits?.calDays || suggested.calDays,
      cardio: f.goalEdits?.cardio || suggested.cardio,
    },
    f.pillars,
  )
  const schedule: CalendarPins = {}
  for (const p of PINNABLE) {
    if (f.pillars.includes(p)) schedule[p] = f.scheduleEdits?.[p] ?? []
  }
  return {
    heightFt,
    heightIn,
    heightOk,
    weightLbs,
    birth,
    suggestedCalories,
    calories,
    calorieNum: num(calories),
    goals,
    schedule,
  }
}

/** Switch a pillar on or off, keeping the pillars in their fixed order. */
export function togglePillar(pillars: Pillar[], p: Pillar, order: readonly Pillar[]): Pillar[] {
  return pillars.includes(p) ? pillars.filter((x) => x !== p) : order.filter((x) => x === p || pillars.includes(x))
}

/** Choosing lifting days sets the workout goal to match; any other goal edit stays. */
export function withDays(f: FormState, days: LiftDays): FormState {
  return {
    ...f,
    days,
    goalEdits: f.goalEdits ? { ...f.goalEdits, workouts: days } : null,
  }
}

/** Set one weekly goal by hand; the others stay as they stand. */
export function withGoal(f: FormState, key: keyof WeeklyGoalConfig, n: number, now: Date = new Date()): FormState {
  return { ...f, goalEdits: { ...derive(f, now).goals, [key]: n } }
}

/**
 * Tap a weekday on or off for one kind of session. The days are a plan laid
 * over the weekly goal, not a second way of setting it: someone can aim for
 * four lifts and fix only the two they always make, or fix none.
 */
export function toggleScheduleDay(f: FormState, pillar: PinnablePillar, weekday: number): FormState {
  const next = toggleWeekday(f.scheduleEdits?.[pillar] ?? [], weekday).sort((a, b) => a - b)
  return { ...f, scheduleEdits: { ...f.scheduleEdits, [pillar]: next } }
}

/** Which sections the form shows for these answers. */
export function visibleSections(f: FormState, opts: { account: boolean; coach?: boolean }): SectionId[] {
  return SECTION_ORDER.filter((s) => {
    if (s === 'strength') return f.pillars.includes('strength')
    if (s === 'cardio') return f.pillars.includes('cardio')
    if (s === 'diet') return f.pillars.includes('diet')
    if (s === 'goals') return f.pillars.length > 0
    if (s === 'schedule') return PINNABLE.some((p) => f.pillars.includes(p))
    if (s === 'coach') return opts.coach ?? true
    if (s === 'account') return opts.account
    return true
  })
}

/**
 * The visible sections that aren't filled in properly yet, top to bottom. The
 * form submits when this is empty.
 */
export function invalidSections(
  f: FormState,
  opts: { account: boolean; accountOk?: boolean; coach?: boolean },
  now: Date = new Date(),
): SectionId[] {
  const d = derive(f, now)
  const dietOn = f.pillars.includes('diet')
  const measuresOk = f.scale !== null && f.bodyFat !== null
  const birthOk = inRange(d.birth, BIRTH_LO, birthHi(now))
  const weightOk = inRange(d.weightLbs, 50, 700)
  const aboutOk =
    measuresOk &&
    (dietOn
      ? f.sex !== null && birthOk && d.heightOk && d.heightIn !== null && weightOk
      : d.heightOk && (f.weight.trim() === '' || weightOk) && (f.birthYear.trim() === '' || birthOk))
  const dietOk =
    !dietOn ||
    (inRange(d.calorieNum, 800, 6000) && (!f.scale || f.targetWeight.trim() === '' || inRange(num(f.targetWeight), 50, 700)))

  const ok: Record<SectionId, boolean> = {
    you: f.name.trim() !== '',
    track: f.pillars.length > 0,
    about: aboutOk,
    strength: true,
    cardio: true,
    diet: dietOk,
    goals: true,
    schedule: true,
    theme: true,
    coach: true,
    account: opts.accountOk ?? true,
  }
  return visibleSections(f, opts).filter((s) => !ok[s])
}

/**
 * The strength answers a form holds, as the profile stores them: the plan was
 * built to the length they gave, so a session opens at its full size.
 */
export function strengthOf(f: FormState): StrengthSetup {
  return { daysPerWeek: f.days, equipment: f.equipment, focus: f.focus, minutes: f.minutes, length: 'full' }
}

/** The profile a finished form describes, as a first setup writes it. */
export function buildProfile(f: FormState, now: Date = new Date()): Profile {
  const d = derive(f, now)
  const strengthOn = f.pillars.includes('strength')
  const dietOn = f.pillars.includes('diet')
  const target = num(f.targetWeight)
  return {
    name: f.name.trim(),
    pillars: f.pillars,
    ...(f.sex ? { sex: f.sex } : {}),
    ...(inRange(d.birth, BIRTH_LO, birthHi(now)) ? { birthYear: d.birth } : {}),
    ...(dietOn ? { activity: f.activity, dietDirection: f.direction } : {}),
    ...(dietOn && f.scale && inRange(target, 50, 700) ? { targetWeightLbs: target } : {}),
    scale: f.scale ?? true,
    bodyFatReading: f.bodyFat ?? true,
    ...(strengthOn ? { strength: strengthOf(f) } : {}),
    weeklyGoals: [{ from: weekStartISO(toISODate(now)), goals: d.goals }],
    calorieGoals: dietOn && d.calorieNum !== null ? [{ from: toISODate(now), goal: d.calorieNum }] : [],
    createdAt: now.toISOString(),
  }
}

/**
 * The strength answers after an update. The session size is a preference set
 * elsewhere, so the saved one stays. A profile from before the plan questions
 * that leaves length and focus at their defaults stays as it was: its plan is
 * the fixed template, and giving it answers would make it read as a built one.
 */
function mergeStrength(before: StrengthSetup | undefined, form: StrengthSetup): StrengthSetup {
  const untouched =
    before != null &&
    before.minutes == null &&
    before.focus == null &&
    form.minutes === DEFAULT_MINUTES &&
    (form.focus ?? []).length === 0
  const { minutes, focus, length: _formLength, ...core } = form
  const length = before ? before.length : form.length
  return {
    ...(untouched ? core : { ...core, minutes, focus }),
    ...(length ? { length } : {}),
  }
}

/**
 * `existing` with the answers of an "update goals" form folded in. Nothing the
 * form doesn't ask is touched, and a changed goal or calorie target is written
 * as a new entry taking effect now rather than rewriting the weeks already
 * lived (see withWeeklyGoals).
 */
export function mergeSetup(existing: Profile, fresh: Profile, now: Date = new Date()): Profile {
  const today = toISODate(now)
  const dietOn = fresh.pillars.includes('diet')
  let out: Profile = {
    ...existing,
    name: fresh.name,
    pillars: fresh.pillars,
    scale: fresh.scale,
    bodyFatReading: fresh.bodyFatReading,
    ...(fresh.sex ? { sex: fresh.sex } : {}),
    ...(fresh.birthYear ? { birthYear: fresh.birthYear } : {}),
    ...(fresh.strength ? { strength: mergeStrength(existing.strength, fresh.strength) } : {}),
    ...(dietOn ? { activity: fresh.activity, dietDirection: fresh.dietDirection } : {}),
  }
  if (dietOn) {
    // The form owns the target weight while diet is on: blank means none.
    if (fresh.targetWeightLbs) out.targetWeightLbs = fresh.targetWeightLbs
    else delete out.targetWeightLbs
  }

  const now_ = goalsInForce(existing)
  const next = fresh.weeklyGoals[0]?.goals
  if (next) {
    const masked = maskGoals(next, out.pillars)
    const same =
      masked.workouts === now_.workouts &&
      masked.flex === now_.flex &&
      masked.calDays === now_.calDays &&
      (masked.cardio ?? 0) === (now_.cardio ?? 0)
    if (!same) out = withWeeklyGoals(out, masked, weekStartISO(today))
  }
  const calories = fresh.calorieGoals[0]?.goal
  if (dietOn && calories != null && calories !== profileCalorieGoal(existing, today)) {
    out = withCalorieGoal(out, calories, today)
  }
  return out
}

/**
 * Whether saving a form should offer to rebuild the workout plan: only when an
 * answer the plan is built from moved. Days past three don't count: the three
 * days just come round again. A profile from before the focus and length
 * questions is read as their defaults, so asking them unanswered changes
 * nothing.
 */
export function planNeedsReplacing(before: StrengthSetup | undefined, after: StrengthSetup | undefined): boolean {
  if (!after) return false
  if (!before) return true
  const focus = (s: StrengthSetup) => (s.focus ?? []).join(',')
  return (
    before.equipment !== after.equipment ||
    starterDays(before.daysPerWeek) !== starterDays(after.daysPerWeek) ||
    (before.minutes ?? DEFAULT_MINUTES) !== (after.minutes ?? DEFAULT_MINUTES) ||
    focus(before) !== focus(after)
  )
}

/**
 * A plan an AI changed on top of the one a form's answers build, with the
 * answers it was built on. It is the plan only while those answers stand.
 */
export type AiPlanEdit = { answers: string; plan: Plan }

/** The answers a built plan comes from, as one comparable string. */
export function planAnswersKey(f: FormState): string {
  return JSON.stringify(strengthOf(f))
}

/** `plan` as an AI edit of the plan this form's answers build. */
export function aiPlanEdit(f: FormState, plan: Plan): AiPlanEdit {
  return { answers: planAnswersKey(f), plan }
}

/**
 * The AI's plan, if it still belongs to this form: strength is tracked and no
 * answer the plan is built from has moved since. Otherwise null, and the plan
 * is built from the answers again.
 */
export function aiPlanFor(f: FormState, edit: AiPlanEdit | null): Plan | null {
  if (!edit || !f.pillars.includes('strength')) return null
  return edit.answers === planAnswersKey(f) ? edit.plan : null
}

/** The form with the weekly workouts goal an AI's reply set, the other goals as they stand. */
export function withWorkoutGoal(f: FormState, workouts: number | null, now: Date = new Date()): FormState {
  const goals = derive(f, now).goals
  if (workouts == null || workouts < 1 || workouts === goals.workouts) return f
  return withGoal(f, 'workouts', Math.min(7, Math.round(workouts)), now)
}
