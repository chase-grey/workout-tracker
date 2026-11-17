/**
 * A cardio goal and the plan that gets you there.
 *
 * Strength has a starter plan and goals that project and commit; cardio had a
 * log and a days-a-week count. This is cardio's half of that: you say what you
 * want (go a distance, go it in a time, or build to so many minutes a week),
 * where you are now, and by when, and the plan lays out every week between —
 * concrete sessions on the days you picked — ramping gently enough to arrive
 * uninjured. Checkpoints mark the road, and a logged session that meets one
 * marks it hit.
 *
 * The plan is stored whole, week by week, rather than recomputed from its
 * inputs on every read. A week already lived is judged against the sessions it
 * was planned with (they drive the weekly cardio goal, see
 * weeklyStreak.weeklyGoalsFor), so re-planning, editing or ending a plan only
 * ever rewrites the weeks still ahead; the ones behind stay as they were and
 * the streak they were scored into can't move under you.
 *
 * Pure module: no React, no storage, no clock other than the dates passed in.
 */

import { asksDistance, type CardioEntry } from './cardio'
import type { Celebration } from './celebration'
import { daysBetween, parseISODate, toISODate, weekStartISO } from './dates'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CardioGoal =
  /** Go this far in one session, without stopping — "run a 5k". */
  | { type: 'distance'; distanceMi: number }
  /** Go this far inside this many minutes — "5k under 28:00". */
  | { type: 'time'; distanceMi: number; minutes: number }
  /** Build to this many minutes a week. */
  | { type: 'weekly'; minutes: number }

export type CardioGoalType = CardioGoal['type']

/** Where you are: what the plan's first week starts from. */
export type CardioLevel = {
  /** Longest single session lately, in minutes. */
  longestMin: number
  /** Longest single session lately, in miles; 0 when unknown. */
  longestMi: number
  /** Minutes a week lately. */
  weeklyMin: number
  /** What the goal distance takes now, in minutes — a time goal's starting point. */
  timeMin?: number
  /** Easy pace, minutes a mile, when the log or the answers say. */
  paceMinPerMi?: number
}

export type CardioSessionType = 'easy' | 'long' | 'tempo' | 'intervals' | 'goal'

export type CardioPlanSession = {
  /** Day of the week, 0 = Monday … 6 = Sunday. */
  day: number
  type: CardioSessionType
  minutes: number
  distanceMi?: number
  label: string
}

/**
 * `build` climbs, `hold` has reached the goal's volume and keeps it, `lighter`
 * is the easy week every fourth, `taper` and `goal` bring an event in fresh.
 */
export type CardioWeekPhase = 'build' | 'hold' | 'lighter' | 'taper' | 'goal'

export type CardioPlanWeek = {
  /** Monday of the week. */
  start: string
  phase: CardioWeekPhase
  sessions: CardioPlanSession[]
}

/**
 * A marker along the way. Exactly one shape applies: a session this long
 * (`minutes`), this far (`distanceMi`), this far this fast (`distanceMi` +
 * `withinMin`), or a week this big (`weekMin`).
 */
export type CardioCheckpoint = {
  id: string
  minutes?: number
  distanceMi?: number
  withinMin?: number
  weekMin?: number
  /** The goal itself, always last; it can't be removed. */
  goal?: boolean
}

export type CardioPlan = {
  id: string
  kind: string
  goal: CardioGoal
  /** Where you said you were when the plan was made. */
  level: CardioLevel
  /** The days sessions land on, 0 = Monday … 6 = Sunday, ascending. */
  days: number[]
  /** Monday of this plan's first week. Weeks before it were carried over from an earlier plan. */
  startDate: string
  targetDate: string
  weeks: CardioPlanWeek[]
  checkpoints: CardioCheckpoint[]
  /** Date the plan was made; a session logged from then on counts toward its checkpoints. */
  createdAt: string
  /** Date it was last re-planned from where you actually were. */
  replannedAt?: string
  /** Date it was ended. Nothing is planned from that week on. */
  endedAt?: string
}

/** One planned session on a calendar date — what the week views read. */
export type PlannedCardio = {
  date: string // YYYY-MM-DD
  kind: string
  minutes?: number
  distanceMi?: number
  label: string
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export const MI_5K = 3.10686
export const MI_10K = 6.21371
export const MI_HALF = 13.1094
export const MI_MARATHON = 26.2188

/** `iso` moved by `n` days. */
export function plusDays(iso: string, n: number): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

/** Day of the week of `iso`, 0 = Monday … 6 = Sunday. */
export function weekdayOf(iso: string): number {
  return (parseISODate(iso).getDay() + 6) % 7
}

export const WEEKDAY_LETTERS = ['m', 't', 'w', 't', 'f', 's', 's'] as const
export const WEEKDAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

const round1 = (n: number) => Math.round(n * 10) / 10

/** Whether two distances are the same race, to within a logging rounding. */
const sameDistance = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, b * 0.01)

/** "5k", "half marathon", "2.5 mi". */
export function fmtDistance(mi: number): string {
  if (sameDistance(mi, MI_5K)) return '5k'
  if (sameDistance(mi, MI_10K)) return '10k'
  if (sameDistance(mi, MI_HALF)) return 'half marathon'
  if (sameDistance(mi, MI_MARATHON)) return 'marathon'
  return `${Number(mi.toFixed(2))} mi`
}

/** 28 → "28:00", 27.5 → "27:30", 65.25 → "1:05:15". */
export function fmtClock(minutes: number): string {
  const total = Math.round(minutes * 60)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** "28:00" → 28, "1:05:30" → 65.5, "28" → 28. Null for anything else. */
export function parseClock(text: string): number | null {
  const parts = text.trim().split(':')
  if (parts.length === 0 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null
  const nums = parts.map(Number)
  const value =
    nums.length === 1 ? nums[0] : nums.length === 2 ? nums[0] + nums[1] / 60 : nums[0] * 60 + nums[1] + nums[2] / 60
  return value > 0 ? value : null
}

/** The word a session label calls the activity: a bike session is a ride. */
function noun(kind: string): string {
  return kind === 'bike' ? 'ride' : kind
}

/** Easy pace when nothing says otherwise, minutes a mile. */
const DEFAULT_PACE: Record<string, number> = {
  run: 11,
  walk: 18,
  hike: 22,
  bike: 5,
  swim: 35,
  row: 9,
}

/** Easy pace for `kind`, minutes a mile: the level's own, else one off its time, else a typical one. */
export function easyPace(kind: string, level: Pick<CardioLevel, 'paceMinPerMi' | 'timeMin'>, goal?: CardioGoal): number {
  if (level.paceMinPerMi && level.paceMinPerMi > 0) return level.paceMinPerMi
  if (goal?.type === 'time' && level.timeMin) return (level.timeMin / goal.distanceMi) * 1.15
  return DEFAULT_PACE[kind] ?? 12
}

/** Riegel's estimate of the time for `toMi` off a session of `minutes` over `fromMi`. */
export function riegel(minutes: number, fromMi: number, toMi: number): number {
  return minutes * Math.pow(toMi / fromMi, 1.06)
}

/** "run 5k", "run 5k in 28:00", "150 min a week". */
export function goalLabel(kind: string, goal: CardioGoal): string {
  if (goal.type === 'weekly') return `${goal.minutes} min a week`
  const dist = fmtDistance(goal.distanceMi)
  return goal.type === 'time' ? `${noun(kind)} ${dist} in ${fmtClock(goal.minutes)}` : `${noun(kind)} ${dist}`
}

/** Which goal types make sense for a kind: a soccer game has no distance to aim at. */
export function goalTypesFor(kind: string): CardioGoalType[] {
  return asksDistance(kind) ? ['distance', 'time', 'weekly'] : ['weekly']
}

/** Distances offered as chips, by kind. */
export function distancePresets(kind: string): { label: string; mi: number }[] {
  if (kind === 'bike') return [10, 25, 50].map((mi) => ({ label: `${mi} mi`, mi }))
  if (kind === 'swim') return [0.25, 0.5, 1].map((mi) => ({ label: `${mi} mi`, mi }))
  if (kind === 'row') return [{ label: '2k', mi: 1.24274 }, { label: '5k', mi: MI_5K }, { label: '10k', mi: MI_10K }]
  return [
    { label: '1 mi', mi: 1 },
    { label: '5k', mi: MI_5K },
    { label: '10k', mi: MI_10K },
    { label: 'half', mi: MI_HALF },
  ]
}

// ---------------------------------------------------------------------------
// Where you are, read off the log
// ---------------------------------------------------------------------------

/** Whether a logged session counts toward the plan: its own kind, or any cardio at all for a minutes-a-week goal. */
export function countsToward(plan: Pick<CardioPlan, 'kind' | 'goal'>, e: CardioEntry): boolean {
  return plan.goal.type === 'weekly' || e.kind === plan.kind
}

/**
 * Your level at `kind` off the last `lookbackWeeks` of the log: the longest
 * session, the minutes a week (averaged over the complete weeks, any kind of
 * cardio for a minutes-a-week goal), the easy pace and, for a distance, what
 * it would take now. Null with nothing logged in the window.
 */
export function cardioLevelFrom(
  entries: CardioEntry[],
  kind: string,
  goal: CardioGoal | undefined,
  today: string,
  lookbackWeeks = 6,
): CardioLevel | null {
  const thisWeek = weekStartISO(today)
  const from = plusDays(thisWeek, -7 * lookbackWeeks)
  const recent = entries.filter((e) => e.date >= from && e.date <= today)
  const own = recent.filter((e) => e.kind === kind)
  const forWeekly = goal?.type === 'weekly' ? recent : own
  if (forWeekly.length === 0) return null

  let weekTotal = 0
  for (const e of forWeekly) if (e.date < thisWeek) weekTotal += e.minutes
  const completeWeeks = Math.max(1, Math.min(lookbackWeeks, Math.ceil(daysBetween(earliest(forWeekly), thisWeek) / 7)))
  const thisWeekMin = forWeekly.filter((e) => e.date >= thisWeek).reduce((s, e) => s + e.minutes, 0)
  const weeklyMin = Math.round(Math.max(weekTotal / completeWeeks, thisWeekMin))

  const longestMin = own.reduce((m, e) => Math.max(m, e.minutes), 0)
  const longestMi = own.reduce((m, e) => Math.max(m, e.distanceMi ?? 0), 0)
  const paced = own.filter((e) => (e.distanceMi ?? 0) > 0)
  const paces = paced.map((e) => e.minutes / e.distanceMi!).sort((a, b) => a - b)
  const paceMinPerMi = paces.length ? round1(paces[Math.floor(paces.length / 2)]) : undefined

  let timeMin: number | undefined
  if (goal && goal.type !== 'weekly') {
    const usable = paced.filter((e) => e.distanceMi! >= goal.distanceMi * 0.4)
    if (usable.length) {
      timeMin = round1(Math.min(...usable.map((e) => riegel(e.minutes, e.distanceMi!, goal.distanceMi))))
    }
  }

  return {
    longestMin: Math.round(longestMin),
    longestMi: round1(longestMi),
    weeklyMin,
    ...(timeMin != null ? { timeMin } : {}),
    ...(paceMinPerMi != null ? { paceMinPerMi } : {}),
  }
}

function earliest(entries: CardioEntry[]): string {
  return entries.reduce((m, e) => (e.date < m ? e.date : m), entries[0].date)
}

// ---------------------------------------------------------------------------
// Which days
// ---------------------------------------------------------------------------

/**
 * The weekdays you usually lift on: any trained in at least half of the last
 * six weeks. A lift day here isn't scheduled — the plan rotates days — so
 * this reads the habit off the log instead.
 */
export function liftingWeekdays(workoutDates: string[], today: string): number[] {
  const thisWeek = weekStartISO(today)
  const from = plusDays(thisWeek, -42)
  const weeksByDay = new Map<number, Set<string>>()
  for (const d of new Set(workoutDates)) {
    if (d < from || d >= thisWeek) continue
    const day = weekdayOf(d)
    const set = weeksByDay.get(day) ?? new Set<string>()
    set.add(weekStartISO(d))
    weeksByDay.set(day, set)
  }
  return [...weeksByDay].filter(([, weeks]) => weeks.size >= 3).map(([day]) => day).sort((a, b) => a - b)
}

/**
 * `n` days for cardio: clear of the lifting days where the week has room,
 * spread so no two land back to back if they can help it, and holding a
 * weekend day for the long session.
 */
export function defaultCardioDays(n: number, liftDays: number[] = []): number[] {
  const count = Math.max(1, Math.min(6, Math.round(n)))
  const lift = new Set(liftDays)
  let best: number[] = []
  let bestScore = Infinity
  for (let mask = 0; mask < 128; mask++) {
    const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => mask & (1 << d))
    if (days.length !== count) continue
    let score = 0
    for (const d of days) if (lift.has(d)) score += 10
    for (const d of days) if (days.includes((d + 1) % 7)) score += 3
    if (!days.includes(5) && !days.includes(6)) score += 2
    if (score < bestScore) {
      bestScore = score
      best = days
    }
  }
  return best
}

/**
 * The days a new plan starts on when none were chosen: as many as the weekly
 * cardio goal asks for (three when it asks for none), laid out by
 * {@link defaultCardioDays}.
 */
export function startingCardioDays(weeklyCardioGoal: number | undefined, liftDays: number[] = []): number[] {
  return defaultCardioDays(Math.max(1, Math.min(6, weeklyCardioGoal || 3)), liftDays)
}

/** The Monday the plan starts on: this week if every chosen day is still ahead, else next week. */
export function firstPlanWeek(days: number[], today: string): string {
  const monday = weekStartISO(today)
  return Math.min(...days) >= weekdayOf(today) ? monday : plusDays(monday, 7)
}

/** The earliest target date a plan on `days` can take: its first week's Monday, or today if that's later. */
export function earliestTargetDate(days: number[], today: string): string {
  const first = days.length ? firstPlanWeek(days, today) : today
  return first > today ? first : today
}

/**
 * Where a new or edited plan starts from when nobody has said: the log's
 * reading for `kind` toward `goal`, else what the plan being replaced started
 * from, else nothing at all.
 */
export function startingLevel(
  entries: CardioEntry[],
  kind: string,
  goal: CardioGoal,
  today: string,
  fallback?: CardioLevel,
): CardioLevel {
  return cardioLevelFrom(entries, kind, goal, today) ?? fallback ?? { longestMin: 0, longestMi: 0, weeklyMin: 0 }
}

/** `mi` as the race it's within a logging rounding of, so 3.1 reads "5k" and plans to the 5k's own length. */
export function snapDistance(mi: number): number {
  return [MI_5K, MI_10K, MI_HALF, MI_MARATHON].find((race) => sameDistance(mi, race)) ?? mi
}

// ---------------------------------------------------------------------------
// The ramp
// ---------------------------------------------------------------------------

/** Weekly growth of the week's minutes and of the long session. */
export const RAMP = 0.1
/** The least a build week adds, so a ramp off a tiny base still moves. */
export const RAMP_FLOOR_WEEK_MIN = 5
export const RAMP_FLOOR_LONG_MIN = 2
/** A lighter week every this many, at this share of the week before it. */
export const LIGHTER_EVERY = 4
export const LIGHTER_SHARE = 0.8
/** A time goal's speed comes at about this fraction a week. */
export const SPEED_GAIN_PER_WEEK = 0.01

/** Each other session's size against the long one, once the build is done. */
const OTHER_SHARE = 0.5

type RampTargets = {
  n: number
  pace: number
  /** Week's minutes to start at and to reach. */
  v0: number
  vt: number
  /** Long session minutes to start at and to reach. */
  l0: number
  lt: number
  event: boolean
  taperWeeks: number
}

/** How far a long session has to reach for each goal. */
function longTargetMi(goal: Exclude<CardioGoal, { type: 'weekly' }>): number {
  const d = goal.distanceMi
  // Ten miles and up is run in full on the day: the long session tops out short of it.
  if (d >= 10) return Math.min(d * 0.85, 20)
  // A fast short race wants long sessions past its distance.
  if (goal.type === 'time' && d <= MI_10K + 0.1) return d * 1.3
  return d
}

function rampTargets(kind: string, goal: CardioGoal, level: CardioLevel, n: number): RampTargets {
  const pace = easyPace(kind, level, goal)
  const fromLong = Math.max(level.longestMin, level.longestMi * pace, 10)
  if (goal.type === 'weekly') {
    const v0 = Math.max(level.weeklyMin, n * 10)
    const vt = Math.max(goal.minutes, v0)
    const share = n >= 3 ? 0.35 : 1 / n
    return { n, pace, v0, vt, l0: v0 * share, lt: vt * share, event: false, taperWeeks: 0 }
  }
  const lt = Math.max(longTargetMi(goal) * pace, fromLong)
  const v0 = Math.max(level.weeklyMin, n * 10, n === 1 ? fromLong : 0)
  const vt = Math.max(lt * (1 + (n - 1) * OTHER_SHARE), v0)
  const maxShare = n === 1 ? 1 : 0.6
  const l0 = Math.min(fromLong, v0 * maxShare)
  return { n, pace, v0, vt, l0, lt, event: true, taperWeeks: goal.distanceMi >= 10 ? 2 : 1 }
}

type RampWeek = { v: number; l: number; lighter: boolean; reached: boolean }

/**
 * The build: `weeks` weeks of week-minutes and long-session minutes. Each
 * climbs by {@link RAMP} (or its floor) toward its target and then holds; the
 * long session also stays within its share of the week. Every
 * {@link LIGHTER_EVERY}th week drops to {@link LIGHTER_SHARE} and the week
 * after picks up where the one before the drop left off.
 */
function ramp(t: RampTargets, weeks: number): RampWeek[] {
  const maxShare = t.n === 1 ? 1 : 0.6
  const out: RampWeek[] = []
  let v = t.v0
  let l = t.l0
  for (let i = 0; i < weeks; i++) {
    if (i > 0 && (i + 1) % LIGHTER_EVERY !== 0) {
      v = v >= t.vt ? v : Math.min(t.vt, Math.max(v * (1 + RAMP), v + RAMP_FLOOR_WEEK_MIN))
      const nextL = Math.min(t.lt, Math.max(l * (1 + RAMP), l + RAMP_FLOOR_LONG_MIN), v * maxShare)
      l = Math.max(l, nextL)
    }
    const reached = v >= t.vt - 0.5 && l >= t.lt - 0.5
    if ((i + 1) % LIGHTER_EVERY === 0) out.push({ v: v * LIGHTER_SHARE, l: l * LIGHTER_SHARE, lighter: true, reached })
    else out.push({ v, l, lighter: false, reached })
  }
  return out
}

/** Weeks the build needs to reach its targets, lighter weeks included. */
function buildWeeksNeeded(t: RampTargets): number {
  const series = ramp(t, 156)
  const i = series.findIndex((w) => w.reached && !w.lighter)
  return i < 0 ? 156 : i + 1
}

function speedWeeksNeeded(goal: CardioGoal, level: CardioLevel, pace: number): number {
  if (goal.type !== 'time') return 0
  const now = level.timeMin ?? (goal.distanceMi * pace) / 1.15
  if (now <= goal.minutes) return 0
  return Math.ceil((now - goal.minutes) / now / SPEED_GAIN_PER_WEEK)
}

/** A realistic number of weeks for the goal from this level, taper included. */
export function weeksNeeded(kind: string, goal: CardioGoal, level: CardioLevel, n: number): number {
  const t = rampTargets(kind, goal, level, n)
  const build = Math.max(buildWeeksNeeded(t), speedWeeksNeeded(goal, level, t.pace))
  return Math.max(4, build + t.taperWeeks)
}

/**
 * The target date to suggest: the last chosen day of the week the goal is
 * realistically reachable in, starting from the plan's first week.
 */
export function suggestTargetDate(
  kind: string,
  goal: CardioGoal,
  level: CardioLevel,
  days: number[],
  today: string,
): string {
  const first = firstPlanWeek(days, today)
  const weeks = weeksNeeded(kind, goal, level, days.length)
  return plusDays(first, 7 * (weeks - 1) + Math.max(...days))
}

// ---------------------------------------------------------------------------
// Laying the sessions out
// ---------------------------------------------------------------------------

function sessionLabel(type: CardioSessionType, kind: string, minutes: number, distanceMi?: number, goal?: CardioGoal): string {
  const what = noun(kind)
  switch (type) {
    case 'easy':
      return `easy ${what} ${minutes} min`
    case 'long':
      return distanceMi ? `long ${what} ${fmtDistance(distanceMi)}` : `long ${what} ${minutes} min`
    case 'tempo':
      // At the pace the goal is run at.
      return goal?.type === 'time'
        ? `tempo ${what} ${minutes} min · ${fmtClock(goal.minutes / goal.distanceMi)}/mi`
        : `tempo ${what} ${minutes} min`
    case 'intervals':
      return `${what} intervals ${minutes} min`
    case 'goal':
      return goal ? `goal: ${goalLabel(kind, goal)}` : `goal ${what}`
  }
}

/** A long session's distance, rounded to a quarter mile under two and a half above. */
function longDistance(minutes: number, pace: number): number {
  const mi = minutes / pace
  const step = mi < 2 ? 0.25 : 0.5
  return Math.max(step, Math.round(mi / step) * step)
}

/**
 * Which chosen day takes which kind of session: the long one on the latest
 * weekend day (or the last day), the hard one as far from it as the week
 * allows, and easy on the rest.
 */
function dayRoles(days: number[], quality: boolean): { long: number; quality: number | null } {
  const weekend = days.filter((d) => d >= 5)
  const long = weekend.length ? weekend[weekend.length - 1] : days[days.length - 1]
  if (!quality || days.length < 2) return { long, quality: null }
  const rest = days.filter((d) => d !== long)
  const q = rest.reduce((best, d) => (Math.abs(d - long) > Math.abs(best - long) ? d : best), rest[0])
  return { long, quality: q }
}

function layWeek(
  kind: string,
  goal: CardioGoal,
  t: RampTargets,
  days: number[],
  w: { v: number; l: number },
  phase: CardioWeekPhase,
  qualityType: CardioSessionType | null,
): CardioPlanSession[] {
  const n = days.length
  const withDistance = t.event && asksDistance(kind)
  const { long, quality } = dayRoles(days, qualityType != null && phase !== 'lighter')
  const l = Math.round(n === 1 ? w.v : w.l)
  const others = n > 1 ? Math.max(10, Math.round((w.v - l) / (n - 1))) : 0
  return days.map((day) => {
    if (day === long) {
      const type: CardioSessionType = n === 1 && !t.event ? 'easy' : 'long'
      const distanceMi = withDistance ? longDistance(l, t.pace) : undefined
      return { day, type, minutes: l, ...(distanceMi ? { distanceMi } : {}), label: sessionLabel(type, kind, l, distanceMi) }
    }
    const type: CardioSessionType = day === quality && qualityType ? qualityType : 'easy'
    return { day, type, minutes: others, label: sessionLabel(type, kind, others, undefined, goal) }
  })
}

/** The goal week: a couple of short easy sessions, then the goal itself on (or just before) the target date. */
function goalWeek(kind: string, goal: Exclude<CardioGoal, { type: 'weekly' }>, t: RampTargets, days: number[], start: string, targetDate: string): CardioPlanSession[] {
  const inWeek = targetDate >= start && targetDate < plusDays(start, 7)
  const goalDay = inWeek ? weekdayOf(targetDate) : days[days.length - 1]
  const goalMin = Math.round(goal.type === 'time' ? goal.minutes : goal.distanceMi * t.pace)
  const easyMin = Math.max(10, Math.round((t.vt - t.lt) / Math.max(1, t.n - 1) / 2))
  const before = days.filter((d) => d < goalDay).slice(-2)
  return [
    ...before.map((day): CardioPlanSession => ({ day, type: 'easy', minutes: easyMin, label: sessionLabel('easy', kind, easyMin) })),
    { day: goalDay, type: 'goal', minutes: goalMin, distanceMi: goal.distanceMi, label: sessionLabel('goal', kind, goalMin, goal.distanceMi, goal) },
  ]
}

export type PlanInput = {
  kind: string
  goal: CardioGoal
  level: CardioLevel
  /** 0 = Monday … 6 = Sunday. */
  days: number[]
  targetDate: string
}

/**
 * Every week from `firstWeek` through the target date's week: the build (with
 * a lighter week every fourth), then for a distance or a time a taper of a
 * week — two for ten miles and up — ending on the goal session itself.
 */
export function generateWeeks(input: PlanInput & { firstWeek: string }): CardioPlanWeek[] {
  const days = [...new Set(input.days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
  if (days.length === 0) return []
  const { kind, goal, level, firstWeek } = input
  const lastWeek = weekStartISO(input.targetDate)
  const count = Math.max(1, Math.floor(daysBetween(firstWeek, lastWeek) / 7) + 1)
  const t = rampTargets(kind, goal, level, days.length)
  const taper = goal.type === 'weekly' ? 0 : Math.min(t.taperWeeks, count)
  const build = ramp(t, count - taper)
  const timeGoal = goal.type === 'time'

  const weeks: CardioPlanWeek[] = build.map((w, i) => {
    const phase: CardioWeekPhase = w.lighter ? 'lighter' : w.reached ? 'hold' : 'build'
    const quality: CardioSessionType | null = timeGoal ? (i % 2 === 0 ? 'tempo' : 'intervals') : null
    const start = plusDays(firstWeek, 7 * i)
    return { start, phase, sessions: layWeek(kind, goal, t, days, w, phase, quality) }
  })

  if (goal.type !== 'weekly') {
    const peak = build.filter((w) => !w.lighter).at(-1) ?? { v: t.v0, l: t.l0 }
    for (let k = 0; k < taper; k++) {
      const start = plusDays(firstWeek, 7 * (build.length + k))
      const last = k === taper - 1
      weeks.push(
        last
          ? { start, phase: 'goal', sessions: goalWeek(kind, goal, t, days, start, input.targetDate) }
          : { start, phase: 'taper', sessions: layWeek(kind, goal, t, days, { v: peak.v * 0.7, l: peak.l * 0.7 }, 'taper', null) },
      )
    }
  }
  return weeks
}

/** The checkpoints a new plan starts with: a few on the way, then the goal. */
export function autoCheckpoints(kind: string, goal: CardioGoal, level: CardioLevel, weeks: CardioPlanWeek[]): CardioCheckpoint[] {
  const out: CardioCheckpoint[] = []

  if (goal.type === 'weekly') {
    const v0 = Math.max(level.weeklyMin, 0)
    for (const f of [1 / 3, 2 / 3]) {
      const m = Math.floor((v0 + (goal.minutes - v0) * f) / 10) * 10
      if (m > v0 && m < goal.minutes) out.push(checkpoint({ weekMin: m }))
    }
    out.push(checkpoint({ weekMin: goal.minutes, goal: true }))
    return dedupe(out)
  }

  if (level.longestMin < 30 && asksDistance(kind)) {
    const m = Math.ceil((level.longestMin + 1) / 10) * 10
    const reaches = weeks.some((w) => w.sessions.some((s) => s.minutes >= m))
    if (m >= 20 && reaches) out.push(checkpoint({ minutes: m }))
  }

  if (goal.type === 'distance') {
    // A third and two thirds of the way from your longest to the goal, in round miles.
    const from = level.longestMi
    const step = goal.distanceMi < 7 ? 0.5 : 1
    for (const f of [1 / 3, 2 / 3]) {
      const mi = Math.round((from + (goal.distanceMi - from) * f) / step) * step
      if (mi > from && mi < goal.distanceMi * 0.98) out.push(checkpoint({ distanceMi: mi }))
    }
    out.push(checkpoint({ distanceMi: goal.distanceMi, goal: true }))
    return dedupe(out)
  }

  // A time: first the distance itself, if it isn't in you yet, then the clock.
  if (level.longestMi < goal.distanceMi * 0.98) out.push(checkpoint({ distanceMi: goal.distanceMi }))
  const now = level.timeMin
  if (now && now > goal.minutes) {
    for (const f of [1 / 3, 2 / 3]) {
      const within = Math.ceil((now - (now - goal.minutes) * f) * 2) / 2
      if (within < now && within > goal.minutes) out.push(checkpoint({ distanceMi: goal.distanceMi, withinMin: within }))
    }
  }
  out.push(checkpoint({ distanceMi: goal.distanceMi, withinMin: goal.minutes, goal: true }))
  return dedupe(out)
}

function dedupe(cps: CardioCheckpoint[]): CardioCheckpoint[] {
  const seen = new Set<string>()
  return cps.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
}

/** A checkpoint with its id: the id is what it asks for, so the same one can't be added twice. */
export function checkpoint(c: Omit<CardioCheckpoint, 'id'>): CardioCheckpoint {
  const id =
    c.weekMin != null
      ? `week:${c.weekMin}`
      : c.withinMin != null
        ? `time:${round1(c.distanceMi ?? 0)}:${round1(c.withinMin)}`
        : c.distanceMi != null
          ? `dist:${round1(c.distanceMi)}`
          : `min:${c.minutes ?? 0}`
  return { ...c, id }
}

/**
 * A new plan. With `previous`, the weeks of it already behind you are kept in
 * front of the new ones, so an edited or replaced plan leaves the weeks it
 * scored as they were; the checkpoints carry over too when the goal hasn't
 * changed.
 */
export function buildCardioPlan(input: PlanInput, today: string, previous?: CardioPlan, id?: string): CardioPlan {
  const days = [...new Set(input.days)].sort((a, b) => a - b)
  const firstWeek = firstPlanWeek(days, today)
  const fresh = generateWeeks({ ...input, days, firstWeek })
  const sameGoal = previous && !previous.endedAt && previous.kind === input.kind && sameGoalAs(previous.goal, input.goal)
  const built: CardioPlan = {
    id: id ?? (sameGoal ? previous.id : `cp-${today}-${Math.random().toString(36).slice(2, 8)}`),
    kind: input.kind,
    goal: input.goal,
    level: input.level,
    days,
    startDate: sameGoal ? previous.startDate : firstWeek,
    targetDate: input.targetDate,
    weeks: [...keptWeeks(previous, firstWeek), ...fresh],
    checkpoints: sameGoal ? previous.checkpoints : autoCheckpoints(input.kind, input.goal, input.level, fresh),
    createdAt: sameGoal ? previous.createdAt : today,
  }
  return { ...built, checkpoints: orderCheckpoints(built.checkpoints, built) }
}

function sameGoalAs(a: CardioGoal, b: CardioGoal): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** The weeks of `plan` before `from`, as far as it ran. */
function keptWeeks(plan: CardioPlan | undefined, from: string): CardioPlanWeek[] {
  if (!plan) return []
  const ended = plan.endedAt ? weekStartISO(plan.endedAt) : null
  return plan.weeks.filter((w) => w.start < from && (!ended || w.start < ended))
}

/**
 * The plan re-laid from where the log says you are now: same goal, days and
 * date, the weeks behind you untouched, the ones ahead built again off your
 * actual longest session and minutes a week. Falling behind starts the climb
 * lower; getting ahead starts it higher. A plan whose date has gone comes back
 * as it was.
 */
export function replanCardio(plan: CardioPlan, entries: CardioEntry[], today: string): CardioPlan {
  const firstWeek = firstPlanWeek(plan.days, today)
  if (firstWeek > weekStartISO(plan.targetDate)) return plan
  const level = actualLevel(plan, entries, today)
  const fresh = generateWeeks({ kind: plan.kind, goal: plan.goal, level, days: plan.days, targetDate: plan.targetDate, firstWeek })
  return { ...plan, weeks: [...keptWeeks(plan, firstWeek), ...fresh], replannedAt: today }
}

/**
 * Where the log says you are for this plan: your longest session of the last
 * three weeks, the bigger of the last two complete weeks' minutes, and the
 * best time the distance has been run in lately. Anything the log can't say
 * falls back to where the plan started.
 */
export function actualLevel(plan: CardioPlan, entries: CardioEntry[], today: string): CardioLevel {
  const thisWeek = weekStartISO(today)
  const counted = entries.filter((e) => countsToward(plan, e) && e.date >= plan.createdAt && e.date <= today)
  const own = counted.filter((e) => e.kind === plan.kind)
  const since = plusDays(thisWeek, -21)
  const recentOwn = own.filter((e) => e.date >= since)
  const weekMin = (start: string) => counted.filter((e) => weekStartISO(e.date) === start).reduce((s, e) => s + e.minutes, 0)
  const lastTwo = Math.max(weekMin(plusDays(thisWeek, -7)), weekMin(plusDays(thisWeek, -14)), weekMin(thisWeek))
  const fromLog = cardioLevelFrom(own, plan.kind, plan.goal, today, 4)
  return {
    longestMin: recentOwn.length ? Math.round(Math.max(...recentOwn.map((e) => e.minutes))) : plan.level.longestMin,
    longestMi: recentOwn.length ? round1(Math.max(...recentOwn.map((e) => e.distanceMi ?? 0))) : plan.level.longestMi,
    weeklyMin: counted.length ? Math.round(lastTwo) : plan.level.weeklyMin,
    ...(fromLog?.timeMin != null || plan.level.timeMin != null ? { timeMin: fromLog?.timeMin ?? plan.level.timeMin } : {}),
    ...(fromLog?.paceMinPerMi != null || plan.level.paceMinPerMi != null
      ? { paceMinPerMi: fromLog?.paceMinPerMi ?? plan.level.paceMinPerMi }
      : {}),
  }
}

/** The plan ended today: no weeks from this one on, the ones behind kept. */
export function endCardioPlan(plan: CardioPlan, today: string): CardioPlan {
  const thisWeek = weekStartISO(today)
  return { ...plan, weeks: plan.weeks.filter((w) => w.start < thisWeek), endedAt: today }
}

/** Whether the plan is still being followed: not ended, and its goal week not yet behind it. */
export function planActive(plan: CardioPlan | undefined, today: string): plan is CardioPlan {
  return !!plan && !plan.endedAt && weekStartISO(today) <= weekStartISO(plan.targetDate)
}

// ---------------------------------------------------------------------------
// Reading the plan
// ---------------------------------------------------------------------------

function weekOf(plan: CardioPlan | undefined, weekStart: string): CardioPlanWeek | null {
  if (!plan) return null
  const monday = weekStartISO(weekStart)
  if (plan.endedAt && monday >= weekStartISO(plan.endedAt)) return null
  return plan.weeks.find((w) => w.start === monday) ?? null
}

/** The sessions planned for the week starting `weekStart`, each on its date. Empty with no plan or nothing that week. */
export function cardioSessionsForWeek(plan: CardioPlan | undefined, weekStart: string): PlannedCardio[] {
  const week = weekOf(plan, weekStart)
  if (!plan || !week) return []
  return week.sessions.map((s) => ({
    date: plusDays(week.start, s.day),
    kind: plan.kind,
    minutes: s.minutes,
    ...(s.distanceMi != null ? { distanceMi: s.distanceMi } : {}),
    label: s.label,
  }))
}

/**
 * The cardio days the plan asks of the week starting `weekStart`, or null when
 * it has nothing to say about that week — what drives the weekly cardio goal
 * (see weeklyStreak.weeklyGoalsFor).
 */
export function plannedSessionCount(plan: CardioPlan | undefined, weekStart: string): number | null {
  const week = weekOf(plan, weekStart)
  return week ? new Set(week.sessions.map((s) => s.day)).size : null
}

/** What's planned on `date`, if anything. */
export function plannedOn(plan: CardioPlan | undefined, date: string): PlannedCardio | null {
  return cardioSessionsForWeek(plan, weekStartISO(date)).find((s) => s.date === date) ?? null
}

/** Whether `date`'s planned session has been done: something counted logged that day. */
export function plannedDone(plan: CardioPlan, entries: CardioEntry[], date: string): boolean {
  return entries.some((e) => e.date === date && countsToward(plan, e))
}

/** The minutes a plan week asks for. */
export function plannedMinutes(week: CardioPlanWeek): number {
  return week.sessions.reduce((s, x) => s + x.minutes, 0)
}

// ---------------------------------------------------------------------------
// Checkpoints
// ---------------------------------------------------------------------------

/** "20 min without stopping", "2 mi", "5k in 31:00", "120 min in a week". */
export function checkpointLabel(c: CardioCheckpoint): string {
  if (c.weekMin != null) return `${c.weekMin} min in a week`
  if (c.distanceMi != null && c.withinMin != null) return `${fmtDistance(c.distanceMi)} in ${fmtClock(c.withinMin)}`
  if (c.distanceMi != null) return fmtDistance(c.distanceMi)
  return `${c.minutes ?? 0} min without stopping`
}

/** Whether one logged session meets a single-session checkpoint. */
export function sessionMeets(c: CardioCheckpoint, e: Pick<CardioEntry, 'minutes' | 'distanceMi'>): boolean {
  if (c.weekMin != null) return false
  if (c.distanceMi != null) {
    const d = e.distanceMi ?? 0
    if (d <= 0 || d < c.distanceMi * 0.99) return false
    // A longer session meets a time when its pace would have covered the distance in time.
    if (c.withinMin != null) return e.minutes * (c.distanceMi / d) <= c.withinMin + 1 / 120
    return true
  }
  return c.minutes != null && e.minutes >= c.minutes
}

/** The date `c` was first met by a session counted toward the plan, or null. */
export function checkpointHitDate(c: CardioCheckpoint, plan: CardioPlan, entries: CardioEntry[]): string | null {
  const counted = entries
    .filter((e) => countsToward(plan, e) && e.date >= plan.createdAt)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  if (c.weekMin != null) {
    const totals = new Map<string, number>()
    for (const e of counted) {
      const wk = weekStartISO(e.date)
      const total = (totals.get(wk) ?? 0) + e.minutes
      totals.set(wk, total)
      if (total >= c.weekMin) return e.date
    }
    return null
  }
  return counted.find((e) => sessionMeets(c, e))?.date ?? null
}

/** The date the plan expects `c` by: the first planned session (or week) that asks for it. */
export function checkpointDueDate(c: CardioCheckpoint, plan: CardioPlan): string | null {
  if (c.goal) return plan.targetDate
  const own = plan.weeks.filter((w) => w.start >= plan.startDate)
  if (c.weekMin != null) {
    const week = own.find((w) => plannedMinutes(w) >= c.weekMin!)
    return week ? plusDays(week.start, Math.max(...week.sessions.map((s) => s.day))) : null
  }
  if (c.withinMin != null && plan.goal.type === 'time') {
    // Speed comes along a straight line from where you were to the goal time.
    const from = plan.level.timeMin
    if (!from || from <= plan.goal.minutes) return plan.targetDate
    const f = (from - c.withinMin) / (from - plan.goal.minutes)
    const span = daysBetween(plan.startDate, plan.targetDate)
    return plusDays(plan.startDate, Math.max(0, Math.min(span, Math.round(span * f))))
  }
  for (const w of own) {
    for (const s of w.sessions) {
      if (sessionMeets(c, { minutes: s.minutes, distanceMi: s.distanceMi ?? (s.minutes / easyPace(plan.kind, plan.level, plan.goal)) })) {
        return plusDays(w.start, s.day)
      }
    }
  }
  return null
}

export type CheckpointStatus = { checkpoint: CardioCheckpoint; label: string; hit: string | null; due: string | null }

/** Every checkpoint with whether and when it was hit, and when it's due, in plan order. */
export function checkpointStatuses(plan: CardioPlan, entries: CardioEntry[]): CheckpointStatus[] {
  return orderCheckpoints(plan.checkpoints, plan).map((c) => ({
    checkpoint: c,
    label: checkpointLabel(c),
    hit: checkpointHitDate(c, plan, entries),
    due: checkpointDueDate(c, plan),
  }))
}

/** Checkpoints by the date they're due, the goal last. */
export function orderCheckpoints(cps: CardioCheckpoint[], plan: CardioPlan): CardioCheckpoint[] {
  const due = new Map(cps.map((c) => [c.id, checkpointDueDate(c, plan) ?? '9999']))
  return [...cps].sort((a, b) => {
    if (!!a.goal !== !!b.goal) return a.goal ? 1 : -1
    const da = due.get(a.id)!
    const db = due.get(b.id)!
    return da < db ? -1 : da > db ? 1 : 0
  })
}

export function addCheckpoint(plan: CardioPlan, c: Omit<CardioCheckpoint, 'id' | 'goal'>): CardioPlan {
  const cp = checkpoint(c)
  if (plan.checkpoints.some((x) => x.id === cp.id)) return plan
  return { ...plan, checkpoints: orderCheckpoints([...plan.checkpoints, cp], plan) }
}

/** The plan without checkpoint `id`. The goal's own checkpoint stays. */
export function removeCheckpoint(plan: CardioPlan, id: string): CardioPlan {
  return { ...plan, checkpoints: plan.checkpoints.filter((c) => c.id !== id || c.goal) }
}

/** Checkpoint `id` changed to ask for `next` instead. */
export function editCheckpoint(plan: CardioPlan, id: string, next: Omit<CardioCheckpoint, 'id' | 'goal'>): CardioPlan {
  const old = plan.checkpoints.find((c) => c.id === id)
  if (!old || old.goal) return plan
  const cp = checkpoint(next)
  if (cp.id !== id && plan.checkpoints.some((c) => c.id === cp.id)) return plan
  return { ...plan, checkpoints: orderCheckpoints(plan.checkpoints.map((c) => (c.id === id ? cp : c)), plan) }
}

/** Checkpoints `after` has hit that `before` hadn't — what logging a session just earned. */
export function newlyHitCheckpoints(plan: CardioPlan | undefined, before: CardioEntry[], after: CardioEntry[]): CardioCheckpoint[] {
  if (!plan || plan.endedAt) return []
  return plan.checkpoints.filter((c) => !checkpointHitDate(c, plan, before) && checkpointHitDate(c, plan, after))
}

/** The cheer for checkpoints just hit: the goal itself is the loudest thing cardio has. */
export function checkpointCelebration(plan: CardioPlan, hit: CardioCheckpoint[]): Celebration | null {
  if (hit.length === 0) return null
  const goal = hit.find((c) => c.goal)
  if (goal) {
    return { tier: 'epic', title: 'cardio goal reached!', subtitle: goalLabel(plan.kind, plan.goal), icon: 'trophy' }
  }
  return {
    tier: 'large',
    title: hit.length > 1 ? 'checkpoints hit' : 'checkpoint hit',
    subtitle: hit.map(checkpointLabel).join(' · '),
    icon: 'flag',
  }
}

// ---------------------------------------------------------------------------
// Standing
// ---------------------------------------------------------------------------

export type PlanStanding = 'ahead' | 'on' | 'behind'

/**
 * How last week went against the plan: behind when it fell well short of the
 * minutes or missed more than one session, ahead when it went well over the
 * minutes and the long session both. Null when there's no complete plan week
 * to judge yet, or the plan was re-laid since.
 */
export function planStanding(plan: CardioPlan, entries: CardioEntry[], today: string): PlanStanding | null {
  const lastWeek = plusDays(weekStartISO(today), -7)
  if (plan.replannedAt && plan.replannedAt >= weekStartISO(today)) return null
  if (lastWeek < plan.startDate) return null
  const week = plan.weeks.find((w) => w.start === lastWeek)
  if (!week || week.phase === 'goal') return null
  const done = entries.filter((e) => countsToward(plan, e) && weekStartISO(e.date) === lastWeek)
  const minutes = done.reduce((s, e) => s + e.minutes, 0)
  const days = new Set(done.map((e) => e.date)).size
  const planned = plannedMinutes(week)
  const plannedLong = Math.max(...week.sessions.map((s) => s.minutes))
  const longest = done.reduce((m, e) => Math.max(m, e.minutes), 0)
  if (minutes < planned * 0.75 || days < week.sessions.length - 1) return 'behind'
  if (minutes > planned * 1.2 && longest > plannedLong * 1.1) return 'ahead'
  return 'on'
}

// ---------------------------------------------------------------------------
// The chart
// ---------------------------------------------------------------------------

export type CardioChartRow = {
  /** Monday of the week. */
  week: string
  /** What the plan asked: the long session's distance, the goal-distance time, or the week's minutes. */
  planned?: number
  /** What was done, for weeks already begun. */
  actual?: number
}

/** What the plan's chart plots, and in what unit. */
export function chartMetric(plan: CardioPlan): { unit: 'mi' | 'min' | 'time'; target: number; lowerIsBetter: boolean } {
  if (plan.goal.type === 'distance') return { unit: 'mi', target: plan.goal.distanceMi, lowerIsBetter: false }
  if (plan.goal.type === 'time') return { unit: 'time', target: plan.goal.minutes, lowerIsBetter: true }
  return { unit: 'min', target: plan.goal.minutes, lowerIsBetter: false }
}

/**
 * Week by week from the plan's start to its end: what was planned and what
 * was done, in the goal's own terms — the longest session for a distance, the
 * time the distance would take for a time, the week's minutes for a weekly
 * goal. A week with nothing done has no actual; a week not yet begun has none
 * either.
 */
export function planChartRows(plan: CardioPlan, entries: CardioEntry[], today: string): CardioChartRow[] {
  const thisWeek = weekStartISO(today)
  const weeks = plan.weeks.filter((w) => w.start >= plan.startDate)
  const counted = entries.filter((e) => countsToward(plan, e) && e.date >= plan.createdAt && e.date <= today)
  const byWeek = new Map<string, CardioEntry[]>()
  for (const e of counted) {
    const wk = weekStartISO(e.date)
    byWeek.set(wk, [...(byWeek.get(wk) ?? []), e])
  }
  const goal = plan.goal
  const startTime = plan.level.timeMin
  const span = Math.max(1, weeks.length - 1)

  return weeks.map((w, i) => {
    const done = w.start <= thisWeek ? byWeek.get(w.start) ?? [] : []
    let planned: number | undefined
    let actual: number | undefined
    if (goal.type === 'weekly') {
      planned = plannedMinutes(w)
      if (done.length) actual = Math.round(done.reduce((s, e) => s + e.minutes, 0))
    } else if (goal.type === 'distance') {
      const pace = easyPace(plan.kind, plan.level, goal)
      planned = round1(Math.max(...w.sessions.map((s) => s.distanceMi ?? s.minutes / pace)))
      const far = done.map((e) => e.distanceMi ?? 0).filter((d) => d > 0)
      if (far.length) actual = round1(Math.max(...far))
    } else {
      if (startTime && startTime > goal.minutes) planned = round1(startTime - ((startTime - goal.minutes) * i) / span)
      else planned = goal.minutes
      const times = done
        .filter((e) => (e.distanceMi ?? 0) >= goal.distanceMi * 0.4)
        .map((e) => riegel(e.minutes, e.distanceMi!, goal.distanceMi))
      if (times.length) actual = round1(Math.min(...times))
    }
    return { week: w.start, ...(planned != null ? { planned } : {}), ...(actual != null ? { actual } : {}) }
  })
}

// ---------------------------------------------------------------------------
// For the coach
// ---------------------------------------------------------------------------

/** The plan as the coach reads it: goal, standing, this week and next, and every checkpoint. */
export function describeCardioPlan(plan: CardioPlan, entries: CardioEntry[], today: string): string[] {
  const thisWeek = weekStartISO(today)
  const lines = [
    `Goal: ${goalLabel(plan.kind, plan.goal)} by ${plan.targetDate} (plan started ${plan.startDate}, on ${plan.days.map((d) => WEEKDAY_NAMES[d]).join('/')})`,
  ]
  const standing = planStanding(plan, entries, today)
  if (standing) lines.push(`Last week: ${standing === 'on' ? 'on plan' : `${standing} of plan`}`)
  const say = (label: string, week: string) => {
    const sessions = cardioSessionsForWeek(plan, week)
    if (sessions.length === 0) return
    const marks = sessions.map((s) => `${WEEKDAY_NAMES[weekdayOf(s.date)]} ${s.label}${s.date <= today && plannedDone(plan, entries, s.date) ? ' (done)' : ''}`)
    lines.push(`${label}: ${marks.join('; ')}`)
  }
  say('This week', thisWeek)
  say('Next week', plusDays(thisWeek, 7))
  const statuses = checkpointStatuses(plan, entries)
  lines.push(
    `Checkpoints: ${statuses
      .map((s) => `${s.label}${s.checkpoint.goal ? ' (goal)' : ''} — ${s.hit ? `hit ${s.hit}` : s.due ? `due ${s.due}` : 'open'}`)
      .join('; ')}`,
  )
  return lines
}
