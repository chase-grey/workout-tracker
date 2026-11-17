/**
 * Who is using the app, and what they asked it to track.
 *
 * The app was written for one person, and for a long time that person's targets
 * were constants in the source: the weekly goals in lib/weeklyStreak, the
 * calorie target in lib/calories, the goals in lib/goals. A profile is the same
 * information held as data, written by the welcome flow (features/setup) and
 * synced with the rest of Settings.
 *
 * A device with NO profile is the original owner's: every constant above still
 * applies to it exactly as before (see lib/profileStore). Nothing here changes
 * what that device shows until a profile is saved on it.
 */

import type { WeeklyGoalConfig } from './weeklyStreak'
import type { Macro } from './calories'

/** The four things the app can track. A profile switches each on or off. */
export type Pillar = 'strength' | 'flexibility' | 'cardio' | 'diet'

export const PILLARS: Pillar[] = ['strength', 'flexibility', 'cardio', 'diet']

export const PILLAR_LABELS: Record<Pillar, string> = {
  strength: 'strength',
  flexibility: 'flexibility',
  cardio: 'cardio',
  diet: 'diet',
}

/** What a device without a profile tracks: everything the app did before cardio. */
export const LEGACY_PILLARS: Pillar[] = ['strength', 'flexibility', 'diet']

export type Sex = 'male' | 'female' | 'nonbinary'

export const SEX_LABELS: Record<Sex, string> = {
  male: 'man',
  female: 'woman',
  nonbinary: 'non-binary',
}
export type DietDirection = 'lose' | 'maintain' | 'gain'
export type Activity = 'light' | 'moderate' | 'active'
export type Equipment = 'gym' | 'dumbbells' | 'bodyweight'

export const DIET_LABELS: Record<DietDirection, string> = {
  lose: 'lose weight',
  maintain: 'hold steady',
  gain: 'gain weight',
}

/**
 * Asked as a whole week, not a job: the factors these choose (lib/recommend)
 * are the standard ones for days of exercise a week, so a desk worker who plays
 * soccer four nights is 'moderate', not 'light'. Workouts logged here count.
 */
export const ACTIVITY_LABELS: Record<Activity, string> = {
  light: '0–2',
  moderate: '3–5',
  active: '6+',
}

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  gym: 'full gym',
  dumbbells: 'dumbbells',
  bodyweight: 'no equipment',
}

/** The muscle groups the welcome flow offers to prioritise (see lib/planBuilder). */
export type Muscle = 'chest' | 'back' | 'shoulders' | 'arms' | 'glutes' | 'quads' | 'hamstrings' | 'abs' | 'calves'

export const MUSCLES: Muscle[] = ['chest', 'back', 'shoulders', 'arms', 'glutes', 'quads', 'hamstrings', 'abs', 'calves']

export const MUSCLE_LABELS: Record<Muscle, string> = {
  chest: 'chest',
  back: 'back',
  shoulders: 'shoulders',
  arms: 'arms',
  glutes: 'glutes',
  quads: 'quads',
  hamstrings: 'hamstrings',
  abs: 'abs',
  calves: 'calves',
}

/** How long a standard workout they'll do, in minutes. */
export type WorkoutMinutes = 30 | 45 | 60 | 75

export const WORKOUT_MINUTES: WorkoutMinutes[] = [30, 45, 60, 75]

/** Lifting days a week the welcome flow offers. */
export const LIFT_DAYS = [2, 3, 4, 5, 6] as const
export type LiftDays = (typeof LIFT_DAYS)[number]

export type StrengthSetup = {
  daysPerWeek: LiftDays
  equipment: Equipment
  /**
   * The muscles they most want to grow, in the order they were picked — which
   * is also the order they're kept in when the time won't hold them all (see
   * lib/planBuilder). Absent on a profile from before the question, whose plan
   * is the fixed starter template (see config/planTemplates.planFor).
   */
  focus?: Muscle[]
  /** The longest a standard workout should run. Absent: a pre-question profile. */
  minutes?: WorkoutMinutes
  /**
   * The session size a workout starts at (see config/plan.SessionLength).
   * Absent starts short, as every session did before this was asked.
   */
  length?: 'short' | 'full'
}

export type Profile = {
  name: string
  /**
   * Set on the profile the original owner's device makes for itself (see
   * lib/ownerProfile). It keeps what was built around that one person — the
   * bodyweight and six-pack goals, the bulk charts, the measured history —
   * while letting the pillars and weekly goals be edited like anyone's.
   */
  owner?: boolean
  pillars: Pillar[]
  sex?: Sex
  birthYear?: number
  activity?: Activity
  /** Which way the calorie target is a target: eat at least it, or at most. */
  dietDirection?: DietDirection
  targetWeightLbs?: number
  strength?: StrengthSetup
  /**
   * Whether they can weigh themselves, and whether they can read their body fat
   * (a smart scale, calipers, a DEXA). Asked at setup and changed in Settings.
   * Unset is yes: a profile from before the question keeps the weigh-ins and
   * body fat charts it always had. See weighsIn and readsBodyFat.
   */
  scale?: boolean
  bodyFatReading?: boolean
  /**
   * The weekly goals and the Monday each set took effect, oldest first — the
   * same shape as WEEKLY_GOAL_HISTORY, and for the same reason: a changed goal
   * holds the weeks ahead to it without re-scoring the weeks already lived.
   */
  weeklyGoals: { from: string; goals: WeeklyGoalConfig }[]
  /** The daily calorie target and the day each took effect, oldest first. */
  calorieGoals: { from: string; goal: number }[]
  /**
   * A daily protein target in grams they set themselves. Unset, the target is
   * worked out from body weight (see lib/protein).
   */
  proteinGoal?: number
  /**
   * The macros they count on the food card: any of protein, carbs and fat, or
   * none. Unset is protein alone, which is what a profile from before the
   * question always had. Counting all three works the calories out from them
   * (see lib/macros).
   */
  macros?: Macro[]
  /** Daily carbohydrate and fat targets in grams they set themselves; unset, see lib/macros. */
  carbGoal?: number
  fatGoal?: number
  /** ISO timestamp the profile was first saved. */
  createdAt: string
}

/**
 * Whether the app should show what was built for its original owner: true on a
 * device with no profile at all, and on one whose profile says so.
 */
export function ownerFlavour(profile: Profile | null | undefined): boolean {
  return !profile || profile.owner === true
}

export function hasPillar(profile: Profile | null | undefined, pillar: Pillar): boolean {
  return (profile ? profile.pillars : LEGACY_PILLARS).includes(pillar)
}

/**
 * Whether to offer weigh-ins: the weight on Today, its log field, the body
 * weight chart and any target weight goal. Only an explicit no turns it off.
 */
export function weighsIn(profile: Profile | null | undefined): boolean {
  return profile?.scale !== false
}

/** Whether to offer body fat: its log field, its reading on Today, and its charts. */
export function readsBodyFat(profile: Profile | null | undefined): boolean {
  return profile?.bodyFatReading !== false
}

/** Age in whole years on `today`, or null when the birth year isn't known. */
export function ageOf(profile: Pick<Profile, 'birthYear'>, today: Date = new Date()): number | null {
  if (!profile.birthYear) return null
  return Math.max(0, today.getFullYear() - profile.birthYear)
}

const NO_GOALS: WeeklyGoalConfig = { workouts: 0, flex: 0, calDays: 0, cardio: 0 }

/**
 * The weekly goals a profile holds the week starting Monday `week` to. A week
 * from before the profile's first entry is held to that first entry: the
 * history a device already had when it took a profile on is still a run of
 * weeks that met the bar or didn't. Judging it against nothing instead scored
 * every one of them full, and a phone with a year of stretches behind it woke
 * up on a fifty-week streak.
 *
 * Read from the history alone, never through today's pillars: switching a
 * pillar off writes a new entry with that goal at 0 (see maskGoals), which
 * holds from this week on. Masking here instead would zero the goal in every
 * week already lived and hand back a streak those weeks didn't earn.
 */
export function profileWeeklyGoals(profile: Profile, week: string): WeeklyGoalConfig {
  let goals = profile.weeklyGoals[0]?.goals ?? NO_GOALS
  for (const g of profile.weeklyGoals) if (g.from <= week) goals = g.goals
  return { ...goals, cardio: goals.cardio ?? 0 }
}

/** Zero the goals of every pillar that is switched off — what a new history entry stores. */
export function maskGoals(goals: WeeklyGoalConfig, pillars: Pillar[]): WeeklyGoalConfig {
  return {
    workouts: pillars.includes('strength') ? goals.workouts : 0,
    flex: pillars.includes('flexibility') ? goals.flex : 0,
    calDays: pillars.includes('diet') ? goals.calDays : 0,
    cardio: pillars.includes('cardio') ? goals.cardio ?? 0 : 0,
  }
}

/** The calorie target a profile set for `date`, or null before it set one. */
export function profileCalorieGoal(profile: Profile, date: string): number | null {
  let goal: number | null = profile.calorieGoals[0]?.goal ?? null
  for (const g of profile.calorieGoals) if (g.from <= date) goal = g.goal
  return goal
}

/**
 * `profile` with new weekly goals taking effect from Monday `week`. A second
 * change inside the same week replaces that week's entry rather than stacking
 * a history nobody lived.
 */
export function withWeeklyGoals(profile: Profile, goals: WeeklyGoalConfig, week: string): Profile {
  const kept = profile.weeklyGoals.filter((g) => g.from < week)
  return { ...profile, weeklyGoals: [...kept, { from: week, goals }] }
}

/** `profile` with a new calorie target taking effect on `date`. */
export function withCalorieGoal(profile: Profile, goal: number, date: string): Profile {
  const kept = profile.calorieGoals.filter((g) => g.from < date)
  return { ...profile, calorieGoals: [...kept, { from: date, goal }] }
}

/** Whether a day's calorie total counts as hitting the target, by direction. */
export function calorieDayHit(total: number, goal: number, direction: DietDirection = 'gain'): boolean {
  if (direction === 'gain') return total >= goal
  // An unlogged day is not a day under budget.
  if (total <= 0) return false
  if (direction === 'lose') return total <= goal
  return total >= goal * 0.9 && total <= goal * 1.1
}

/** The weekly goal each pillar is counted against. */
export const PILLAR_GOAL_KEY: Record<Pillar, keyof WeeklyGoalConfig> = {
  strength: 'workouts',
  flexibility: 'flex',
  cardio: 'cardio',
  diet: 'calDays',
}

/**
 * `profile` with `pillar` switched on at `goal` a week, or off, from Monday
 * `week` on. The last pillar can't be switched off — a profile tracking
 * nothing has nothing to show — so that comes back unchanged.
 */
export function withPillar(profile: Profile, pillar: Pillar, on: boolean, goal: number, week: string): Profile {
  const has = profile.pillars.includes(pillar)
  if (!on && has && profile.pillars.length === 1) return profile
  const pillars = on ? PILLARS.filter((p) => p === pillar || profile.pillars.includes(p)) : profile.pillars.filter((p) => p !== pillar)
  const current = profileWeeklyGoals(profile, week)
  const goals = maskGoals({ ...current, ...(on ? { [PILLAR_GOAL_KEY[pillar]]: goal } : {}) }, pillars)
  return withWeeklyGoals({ ...profile, pillars }, goals, week)
}
