/**
 * The plan a new lifter starts on, built from what the welcome flow asked:
 * days a week, equipment, the muscles they most want to grow, and how long a
 * workout they'll do.
 *
 * Volume is counted in hard sets a week per muscle, the measure the
 * hypertrophy literature doses in. A muscle they picked is trained on every
 * lifting day (two or three exposures a week) toward {@link GROW_SETS} sets,
 * never below {@link GROW_FLOOR_SETS}; the rest get maintenance volume, toward
 * {@link KEEP_SETS} and no lower than {@link KEEP_FLOOR_SETS} while there is time
 * for it. A compound counts in full for the muscle it's chosen for and in half
 * for the ones it trains on the way (a press for the triceps, a squat for the
 * glutes) — the fractional count the volume meta-analyses use — so the arms of
 * someone pressing and rowing twice a week are already being maintained and
 * get no direct work until they're asked for.
 *
 * Every day is priced the way a session prices itself on day one (see
 * {@link priceDay}) and has to come in at or under the chosen length. When the
 * picks won't fit, the build gives ground in a fixed order — maintenance down
 * to its floor, then the picked muscles' volume down to theirs, then whichever
 * picks still won't fit, later picks first — and says what it gave up
 * ({@link PlanBuild}).
 * Only when nothing is picked and the maintenance floor still won't fit are the
 * days trimmed from the end. It never hands back a day longer than the time it
 * was given.
 *
 * Pure and deterministic: the same answers always build the same plan.
 */

import type { DayType } from '../types'
import { DAY_TYPES, type DayPlan, type Plan, type PlannedExercise } from '../config/plan'
import type { Equipment, Muscle, StrengthSetup, WorkoutMinutes } from './profile'
import { MUSCLES, MUSCLE_LABELS, WORKOUT_MINUTES } from './profile'
import { WORK_PER_SET_SEC } from './estimate'
import { restBeforeNextSet } from './rest'
import { buildSetOrder } from './circuit'

/** Weekly hard sets a picked muscle is built toward, and the least it's left with. */
export const GROW_SETS = 12
export const GROW_FLOOR_SETS = 10
/** Weekly sets every other muscle is held at, and the least that still maintains it. */
export const KEEP_SETS = 6
export const KEEP_FLOOR_SETS = 4
/** The most direct sets one muscle gets in one session; past it is junk volume. */
const MAX_SETS_PER_SESSION = 8
/** The most sets one row carries; more than this becomes a second movement. */
const MAX_SETS_PER_ROW = 4
/** The fewest sets one exposure of a muscle gets. */
const MIN_SETS_PER_EXPOSURE = 2

/** The length a pre-question profile is built for. */
export const DEFAULT_MINUTES: WorkoutMinutes = 60

type Option = {
  key: string
  name: string
  repMin: number
  repMax: number
  restSec: number
  group: string
  compound: boolean
  /** Fractional credit to other muscles, per set. */
  credit?: Partial<Record<Muscle, number>>
  extra?: Partial<PlannedExercise>
}

/** Loaded with a dumbbell in each hand; the logged weight is the pair's total. */
const PAIR = { increment: 10, dumbbellPair: true } as const
/** Machine, barbell and single-dumbbell loads step in 5s. */
const PLATE = { increment: 5 } as const
/** No load at all: the weight field is hidden and the reps are the progression. */
const REPS = { bodyweight: true, repsOnly: true } as const
/** A hold, in seconds. Its group is kept off `core` so the seconds aren't summed as reps. */
const HOLD = { timed: true, bodyweight: true, repsOnly: true } as const

function c(
  key: string, name: string, group: string, repMin: number, repMax: number, restSec: number,
  extra: Partial<PlannedExercise>, credit?: Partial<Record<Muscle, number>>,
): Option {
  return { key, name, group, repMin, repMax, restSec, compound: true, extra, credit }
}
function i(
  key: string, name: string, group: string, repMin: number, repMax: number, restSec: number,
  extra: Partial<PlannedExercise>, credit?: Partial<Record<Muscle, number>>,
): Option {
  return { key, name, group, repMin, repMax, restSec, compound: false, extra, credit }
}

const HALF_ARMS = { arms: 0.5 } as const
const HALF_GLUTES = { glutes: 0.5 } as const
const HALF_QUADS = { quads: 0.5 } as const

const ABS_GYM = [
  i('cable_crunch', 'cable crunch', 'abs', 10, 15, 60, PLATE),
  i('deadbug', 'dead bug', 'abs', 8, 12, 60, REPS),
  i('plank', 'plank', 'core hold', 30, 60, 60, HOLD),
]
const ABS_FLOOR = [
  i('deadbug', 'dead bug', 'abs', 8, 12, 60, REPS),
  i('floor_crunch', 'crunch', 'abs', 12, 20, 60, REPS),
  i('plank', 'plank', 'core hold', 30, 60, 60, HOLD),
]

/**
 * The movements each muscle is trained with, by equipment: compounds first,
 * then isolation. Keys a shipped movement already has are reused, which is what
 * earns them a ladder and a place on the muscle avatar. Nothing here is trained
 * one side at a time, so nothing needs a left/right pair (see lib/pairedSides).
 */
const LIBRARY: Record<Equipment, Record<Muscle, Option[]>> = {
  gym: {
    quads: [
      c('barbell_squat', 'barbell squat', 'quads', 6, 10, 120, PLATE, HALF_GLUTES),
      c('leg_press', 'leg press', 'quads', 8, 12, 120, PLATE, HALF_GLUTES),
      i('leg_extension', 'leg extension', 'quads', 10, 15, 60, PLATE),
    ],
    hamstrings: [
      c('romanian_deadlift', 'romanian deadlift', 'hamstrings', 8, 12, 120, PLATE, HALF_GLUTES),
      i('hamstring_curl', 'hamstring curl', 'hamstrings', 10, 15, 60, PLATE),
    ],
    chest: [
      c('flat_bench', 'flat bench press', 'chest', 6, 10, 120, PLATE, HALF_ARMS),
      c('incline_bench', 'incline bench press', 'chest', 8, 12, 120, PAIR, HALF_ARMS),
      i('cable_fly', 'cable fly', 'chest', 10, 15, 60, PLATE),
    ],
    back: [
      c('cable_pulldown', 'lat pulldown', 'back', 8, 12, 90, PLATE, HALF_ARMS),
      c('seated_row', 'seated cable row', 'back', 8, 12, 90, PLATE, HALF_ARMS),
      c('barbell_row', 'barbell row', 'back', 8, 12, 120, PLATE, HALF_ARMS),
    ],
    shoulders: [
      c('machine_overhead_press', 'machine overhead press', 'shoulders', 8, 12, 90, PLATE, HALF_ARMS),
      i('db_lateral_raise', 'dumbbell lateral raise', 'shoulders', 12, 20, 60, PAIR),
    ],
    glutes: [
      c('hip_thrust', 'barbell hip thrust', 'glutes', 8, 12, 90, PLATE),
      c('db_reverse_lunge', 'dumbbell reverse lunge', 'glutes', 8, 12, 90, PAIR, HALF_QUADS),
    ],
    arms: [
      i('incline_db_curl', 'incline dumbbell curl', 'biceps', 8, 12, 60, PAIR),
      i('tricep_pushdown', 'tricep pushdown', 'triceps', 10, 15, 60, PLATE),
      i('hammer_curl', 'hammer curl', 'biceps', 10, 15, 60, PAIR),
      i('cable_overhead_extension', 'cable overhead tricep extension', 'triceps', 10, 15, 60, PLATE),
    ],
    calves: [i('calf_raise', 'calf raise', 'calves', 10, 15, 60, PLATE)],
    abs: ABS_GYM,
  },
  dumbbells: {
    quads: [
      c('goblet_squat', 'goblet squat', 'quads', 8, 12, 120, PLATE, HALF_GLUTES),
      c('db_split_squat', 'dumbbell split squat', 'quads', 8, 12, 90, PAIR, HALF_GLUTES),
    ],
    hamstrings: [
      c('db_romanian_deadlift', 'dumbbell romanian deadlift', 'hamstrings', 8, 12, 120, PAIR, HALF_GLUTES),
    ],
    chest: [
      c('flat_bench', 'flat bench press', 'chest', 8, 12, 120, PAIR, HALF_ARMS),
      c('incline_bench', 'incline bench press', 'chest', 8, 12, 120, PAIR, HALF_ARMS),
      i('db_fly', 'dumbbell fly', 'chest', 10, 15, 60, PAIR),
    ],
    back: [
      c('db_bent_row', 'bent-over dumbbell row', 'back', 8, 12, 90, PAIR, HALF_ARMS),
      c('one_arm_db_row', 'one-arm dumbbell row', 'back', 8, 12, 90, PLATE, HALF_ARMS),
    ],
    shoulders: [
      c('db_overhead_press', 'dumbbell overhead press', 'shoulders', 8, 12, 90, PAIR, HALF_ARMS),
      i('db_lateral_raise', 'dumbbell lateral raise', 'shoulders', 12, 20, 60, PAIR),
    ],
    glutes: [
      c('db_hip_thrust', 'dumbbell hip thrust', 'glutes', 8, 12, 90, PLATE),
      c('db_reverse_lunge', 'dumbbell reverse lunge', 'glutes', 8, 12, 90, PAIR, HALF_QUADS),
    ],
    arms: [
      i('hammer_curl', 'hammer curl', 'biceps', 10, 15, 60, PAIR),
      i('db_tricep_extension', 'dumbbell overhead tricep extension', 'triceps', 10, 15, 60, PLATE),
      i('incline_db_curl', 'incline dumbbell curl', 'biceps', 8, 12, 60, PAIR),
    ],
    calves: [i('db_calf_raise', 'dumbbell calf raise', 'calves', 12, 20, 60, PLATE)],
    abs: ABS_FLOOR,
  },
  bodyweight: {
    quads: [
      c('bodyweight_squat', 'bodyweight squat', 'quads', 12, 20, 90, REPS, HALF_GLUTES),
      c('reverse_lunge', 'reverse lunge', 'quads', 8, 12, 90, REPS, HALF_GLUTES),
    ],
    hamstrings: [i('slider_leg_curl', 'slider leg curl', 'hamstrings', 8, 12, 60, REPS)],
    chest: [
      c('pushup', 'push-up', 'chest', 8, 15, 90, REPS, HALF_ARMS),
      c('decline_pushup', 'decline push-up', 'chest', 6, 12, 90, REPS, HALF_ARMS),
    ],
    back: [
      i('reverse_snow_angel', 'reverse snow angel', 'back', 10, 15, 60, REPS),
      i('superman', 'superman', 'back', 10, 15, 60, REPS),
      i('prone_swimmer', 'prone swimmer', 'back', 10, 15, 60, REPS),
    ],
    shoulders: [c('pike_pushup', 'pike push-up', 'shoulders', 6, 12, 90, REPS, HALF_ARMS)],
    glutes: [
      i('glute_bridge', 'glute bridge', 'glutes', 12, 20, 60, REPS),
      i('single_leg_glute_bridge', 'single-leg glute bridge', 'glutes', 8, 15, 60, REPS),
    ],
    arms: [
      i('diamond_pushup', 'diamond push-up', 'triceps', 6, 12, 60, REPS),
      i('chair_dip', 'chair dip', 'triceps', 8, 15, 60, REPS),
    ],
    calves: [i('bw_calf_raise', 'bodyweight calf raise', 'calves', 15, 25, 60, REPS)],
    abs: ABS_FLOOR,
  },
}

/**
 * The order muscles are scheduled in: the big compound movers first, so the
 * muscles they train on the way (glutes, arms) are credited before their own
 * direct work is sized.
 */
const SCHEDULE: Muscle[] = ['quads', 'hamstrings', 'chest', 'back', 'shoulders', 'glutes', 'arms', 'calves', 'abs']

/** How much of each kind of work a build asks for. */
type Level = { grow: number; keep: number }

/**
 * What the build gives up, in order, when the time won't hold it all. The
 * maintenance floor is never among them: a pick is given up before the rest of
 * the body goes untrained, or five leg picks at 45 minutes would build a week
 * with no upper body in it.
 */
const LEVELS: Level[] = [
  { grow: GROW_SETS, keep: KEEP_SETS },
  { grow: GROW_SETS, keep: KEEP_FLOOR_SETS },
  { grow: GROW_FLOOR_SETS, keep: KEEP_FLOOR_SETS },
]

type Row = { muscle: Muscle; option: Option; sets: number }

export type PlanBuild = {
  plan: Plan
  /** The picked muscles the plan grows, and the ones the time couldn't hold. */
  fitted: Muscle[]
  unfitted: Muscle[]
  /** Muscles not picked and left under maintenance volume. */
  unmaintained: Muscle[]
  /** Weekly hard sets per muscle, compounds' fractional credit included. */
  weekly: Record<Muscle, number>
  /** Each lifting day's priced length in seconds, in day order. */
  daySecs: number[]
  /** The length every day was held to, in seconds. */
  budgetSec: number
}

/**
 * A day's length in seconds, priced the way a session prices itself before it
 * has any history (see ActiveSession's priceFlow): each set costs the assumed
 * working time — a hold its prescribed seconds — plus the rest the flow will
 * actually prescribe after it, which is the exercise's own rest between its
 * sets, the next movement's rest (capped) on the way to it, and nothing after
 * the last set. The session's own time-left clock therefore opens on the same
 * number this budgets against.
 */
export function priceDay(exercises: PlannedExercise[]): number {
  const order = buildSetOrder(exercises, exercises.map((e) => e.sets))
  let total = 0
  order.forEach((slot, n) => {
    const e = exercises[slot.exIndex]
    const nextSlot = order[n + 1]
    const next = nextSlot ? exercises[nextSlot.exIndex] : null
    const sameCircuit = !!next && !!e.circuit && next.circuit === e.circuit
    total += e.timed ? Math.max(WORK_PER_SET_SEC, e.repMax) : WORK_PER_SET_SEC
    total += restBeforeNextSet({
      currentRestSec: e.restSec,
      sameExercise: !!next && next.key === e.key,
      nextRestSec: next ? next.restSec : null,
      sameCircuit,
      newCircuitRound: sameCircuit && nextSlot.setIndex > slot.setIndex,
      circuitRestSec: e.circuitRestSec,
      circuitRoundRestSec: e.circuitRoundRestSec,
      roundScreen: e.roundScreen,
    })
  })
  return total
}

/** The movement row `k` of `muscle` takes on day `d` that isn't on the day already. */
function pickOption(options: Option[], day: Row[], d: number, k: number, rowsToday: number): Option {
  const compounds = options.filter((o) => o.compound)
  const isos = options.filter((o) => !o.compound)
  const taken = new Set(day.map((r) => r.option.key))
  // The first row of a muscle that has a compound is a compound, rotating by day.
  const ordered =
    k === 0 && compounds.length
      ? rotate(compounds, d)
      : rotate(isos.length ? isos : compounds, d * rowsToday + k - (compounds.length && isos.length ? 1 : 0))
  return ordered.find((o) => !taken.has(o.key)) ?? [...ordered, ...options].find((o) => !taken.has(o.key)) ?? ordered[0]
}

function rotate<T>(list: T[], by: number): T[] {
  const n = list.length
  const s = ((by % n) + n) % n
  return [...list.slice(s), ...list.slice(0, s)]
}

/** `sets` split into rows of at most {@link MAX_SETS_PER_ROW}. */
function splitSets(sets: number): number[] {
  if (sets <= MAX_SETS_PER_ROW) return [sets]
  return [Math.ceil(sets / 2), Math.floor(sets / 2)]
}

function emptyWeekly(): Record<Muscle, number> {
  return Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>
}

type Draft = { days: Row[][]; weekly: Record<Muscle, number> }

function credit(weekly: Record<Muscle, number>, row: Row, sets: number) {
  weekly[row.muscle] += sets
  for (const [m, f] of Object.entries(row.option.credit ?? {})) weekly[m as Muscle] += sets * (f ?? 0)
}

function draft(setup: StrengthSetup, grow: Muscle[], level: Level): Draft {
  const library = LIBRARY[setup.equipment] ?? LIBRARY.gym
  // Past three days the plan has no more slots to hold: the three come round again.
  const dayCount = Math.min(SLOTS.length, setup.daysPerWeek)
  const days: Row[][] = Array.from({ length: dayCount }, () => [])
  const weekly = emptyWeekly()
  const load = (d: number) => days[d].reduce((n, r) => n + r.sets, 0)

  const add = (muscle: Muscle, d: number, sets: number) => {
    const parts = splitSets(sets)
    parts.forEach((s, k) => {
      const option = pickOption(library[muscle], days[d], d, k, parts.length)
      const existing = days[d].find((r) => r.option.key === option.key)
      if (existing) {
        existing.sets += s
        credit(weekly, existing, s)
      } else {
        const row = { muscle, option, sets: s }
        days[d].push(row)
        credit(weekly, row, s)
      }
    })
  }

  for (const muscle of SCHEDULE) {
    const growing = grow.includes(muscle)
    const target = growing ? level.grow : level.keep
    const deficit = Math.ceil(target - weekly[muscle] - 1e-9)
    if (growing) {
      // Every lifting day, so a picked muscle is trained at least twice a week.
      const perDay = Math.min(MAX_SETS_PER_SESSION, Math.max(MIN_SETS_PER_EXPOSURE, Math.ceil(deficit / dayCount)))
      for (let d = 0; d < dayCount; d++) add(muscle, d, perDay)
    } else if (deficit > 0) {
      const exposures = deficit >= 2 * MIN_SETS_PER_EXPOSURE ? Math.min(2, dayCount) : 1
      const perDay = Math.max(MIN_SETS_PER_EXPOSURE, Math.ceil(deficit / exposures))
      // On the lightest days, so the week stays even.
      const chosen = Array.from({ length: dayCount }, (_, d) => d)
        .sort((a, b) => load(a) - load(b) || a - b)
        .slice(0, exposures)
        .sort((a, b) => a - b)
      for (const d of chosen) add(muscle, d, perDay)
    }
  }

  // Compounds first, big movers before small, the ab work last.
  for (const day of days) {
    day.sort(
      (a, b) =>
        Number(b.option.compound) - Number(a.option.compound) ||
        SCHEDULE.indexOf(a.muscle) - SCHEDULE.indexOf(b.muscle),
    )
  }
  return { days, weekly }
}

/**
 * A row as a plan exercise. Its short form drops a set from anything of three
 * or more — fewer sets first — and the day's last accessory leaves the short day
 * altogether, so small is fewer sets, then fewer movements, and never fewer days.
 */
function toExercise(row: Row, lastAccessory: boolean): PlannedExercise {
  const o = row.option
  const shortSets = lastAccessory ? 0 : row.sets >= 3 ? row.sets - 1 : row.sets
  return {
    key: o.key,
    name: o.name,
    sets: row.sets,
    shortSets,
    repMin: o.repMin,
    repMax: o.repMax,
    restSec: o.restSec,
    group: o.group,
    ...o.extra,
  }
}

function dayExercises(rows: Row[]): PlannedExercise[] {
  let last = -1
  rows.forEach((r, n) => {
    if (!r.option.compound) last = n
  })
  // A day of compounds alone keeps every movement and trims sets only.
  return rows.map((r, n) => toExercise(r, n === last && rows.length > 2))
}

/** Take sets off the end of the day — accessories before compounds — until it fits. */
function trimToFit(days: Row[][], weekly: Record<Muscle, number>, budgetSec: number) {
  for (const day of days) {
    while (day.length && priceDay(dayExercises(day)) > budgetSec) {
      const row = day[day.length - 1]
      row.sets -= 1
      credit(weekly, row, -1)
      if (row.sets <= 0) day.pop()
    }
  }
}

const SLOTS: DayType[] = ['push', 'pull', 'fullbody']
const LETTERS = ['a', 'b', 'c']

function toPlan(days: Row[][]): Plan {
  const plan = {} as Plan
  SLOTS.forEach((type, n) => {
    const rows = days[n]
    const day: DayPlan = {
      type,
      label: rows ? `full body ${LETTERS[n]}` : 'full body',
      required: true,
      exercises: rows ? dayExercises(rows) : [],
      order: DAY_TYPES.indexOf(type),
      custom: true,
    }
    plan[type] = day
  })
  return plan
}

function fits(d: Draft, budgetSec: number): boolean {
  return d.days.every((rows) => priceDay(dayExercises(rows)) <= budgetSec)
}

/** The picked muscles, deduplicated and in pick order, without anything unknown. */
function focusOf(setup: StrengthSetup): Muscle[] {
  const seen = new Set<Muscle>()
  for (const m of setup.focus ?? []) if (MUSCLES.includes(m)) seen.add(m)
  return [...seen]
}

/**
 * The plan for `setup` and an honest account of it.
 *
 * At each of the {@link LEVELS}, from the most generous down, the picks are
 * taken in the order they were made and each one kept if the days still fit
 * with it, so a pick that won't fit doesn't cost the cheaper ones after it.
 * Whichever level keeps the most picks wins, the more generous one on a tie.
 * If even the maintenance floor with no picks won't fit, the days are trimmed
 * from the end until they do.
 */
export function buildPlan(setup: StrengthSetup): PlanBuild {
  const budgetSec = (setup.minutes ?? DEFAULT_MINUTES) * 60
  const focus = focusOf(setup)
  let chosen: Draft | null = null
  let fitted: Muscle[] = []
  for (const level of LEVELS) {
    let kept: Muscle[] = []
    let best = draft(setup, kept, level)
    if (!fits(best, budgetSec)) continue
    for (const m of focus) {
      const d = draft(setup, [...kept, m], level)
      if (fits(d, budgetSec)) {
        kept = [...kept, m]
        best = d
      }
    }
    if (!chosen || kept.length > fitted.length) {
      chosen = best
      fitted = kept
    }
    if (kept.length === focus.length) break
  }
  if (!chosen) {
    chosen = draft(setup, [], LEVELS[LEVELS.length - 1])
    trimToFit(chosen.days, chosen.weekly, budgetSec)
  }
  const weekly = Object.fromEntries(
    MUSCLES.map((m) => [m, Math.round(chosen!.weekly[m] * 10) / 10]),
  ) as Record<Muscle, number>
  const plan = toPlan(chosen.days)
  return {
    plan,
    fitted,
    unfitted: focus.filter((m) => !fitted.includes(m)),
    unmaintained: MUSCLES.filter((m) => !fitted.includes(m) && weekly[m] < KEEP_FLOOR_SETS),
    weekly,
    daySecs: SLOTS.slice(0, Math.min(SLOTS.length, setup.daysPerWeek)).map((t) => priceDay(plan[t].exercises)),
    budgetSec,
  }
}

/** Whether `b` grows more picks — or maintains more of the rest — than `a`. */
function better(a: PlanBuild, b: PlanBuild): boolean {
  return b.fitted.length > a.fitted.length || (b.fitted.length === a.fitted.length && b.unmaintained.length < a.unmaintained.length)
}

/**
 * The one-line status the plan questions show: how long a session runs when it
 * all fits, and otherwise what doesn't, with the change that would help — a
 * third day, a longer workout, or both. Picking fewer muscles always helps, and
 * goes unsaid.
 */
export function fitStatus(setup: StrengthSetup, build: PlanBuild = buildPlan(setup)): string {
  const focus = focusOf(setup)
  const short = build.unfitted.length > 0 || build.unmaintained.length > 0
  if (!short) {
    const longest = Math.max(0, ...build.daySecs)
    return `about ${Math.round(longest / 60)} min a session`
  }
  const moreDays = setup.daysPerWeek < 3 && better(build, buildPlan({ ...setup, daysPerWeek: 3 }))
  const longer = WORKOUT_MINUTES.find((m) => m > (setup.minutes ?? DEFAULT_MINUTES))
  const moreTime = longer != null && better(build, buildPlan({ ...setup, minutes: longer }))
  const help = moreDays && moreTime ? ' — add a day or time' : moreDays ? ' — add a day' : moreTime ? ' — add time' : ''
  if (build.unfitted.length > 0) {
    return `fits ${build.fitted.length} of your ${focus.length} focus muscles${help}`
  }
  return `no time left for ${build.unmaintained.map((m) => MUSCLE_LABELS[m]).join(', ')}${help}`
}
