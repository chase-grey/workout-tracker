/**
 * Starter plans for people who are not the person the app was written for.
 *
 * DEFAULT_PLAN is one lifter's programme, built around one gym's machines, so a
 * new user can't start from it. These are small full-body programmes picked by
 * the two answers the welcome flow asks: days per week and what equipment there
 * is. Every day they write is {@link DayPlan.custom}, so withPlanDefaults leaves
 * them exactly as stored instead of splicing the original's exercises in.
 *
 * Movements that are genuinely the same as one the shipped plan has reuse its key
 * (`flat_bench`, `leg_press`, ...), which is what earns them a strength ladder and
 * a place on the muscle avatar (see lib/strengthStandards.EXERCISE_SOURCES). The
 * rest are new keys, named in {@link STARTER_EXERCISE_NAMES}.
 *
 * Nothing here carries the original's gym-specific fields (weight caps, numbered
 * stacks, A/B variants, circuits, sides): a starter exercise is a plain row.
 *
 * These fixed programmes are what a profile from before the welcome flow asked
 * about focus muscles and workout length still has; a profile that answered
 * those is built by lib/planBuilder instead (see {@link planFor}).
 */

import type { DayType } from '../types'
import type { StrengthSetup } from '../lib/profile'
import { DAY_TYPES, type DayPlan, type Plan, type PlannedExercise } from './plan'
import { buildPlan } from '../lib/planBuilder'

type Equipment = StrengthSetup['equipment']

/** Names of the movements this file introduces, by key. */
export const STARTER_EXERCISE_NAMES: Record<string, string> = {
  seated_chest_press: 'seated chest press',
  seated_row: 'seated cable row',
  romanian_deadlift: 'romanian deadlift',
  barbell_row: 'barbell row',
  plank: 'plank',
  goblet_squat: 'goblet squat',
  one_arm_db_row: 'one-arm dumbbell row',
  db_romanian_deadlift: 'dumbbell romanian deadlift',
  db_bent_row: 'bent-over dumbbell row',
  db_lateral_raise: 'dumbbell lateral raise',
  db_calf_raise: 'dumbbell calf raise',
  db_split_squat: 'dumbbell split squat',
  db_floor_press: 'dumbbell floor press',
  floor_crunch: 'crunch',
  pushup: 'push-up',
  pike_pushup: 'pike push-up',
  diamond_pushup: 'diamond push-up',
  superman: 'superman',
  reverse_snow_angel: 'reverse snow angel',
  prone_swimmer: 'prone swimmer',
  bodyweight_squat: 'bodyweight squat',
  reverse_lunge: 'reverse lunge',
  sumo_squat: 'sumo squat',
  glute_bridge: 'glute bridge',
  single_leg_glute_bridge: 'single-leg glute bridge',
  bw_calf_raise: 'bodyweight calf raise',
  pullup: 'pull-up',
}

/** Names of the shipped keys reused here, matching what the shipped plan calls them. */
const SHIPPED_NAMES: Record<string, string> = {
  flat_bench: 'flat bench press',
  incline_bench: 'incline bench press',
  leg_press: 'leg press',
  barbell_squat: 'barbell squat',
  cable_pulldown: 'lat pulldown',
  machine_overhead_press: 'machine overhead press',
  db_overhead_press: 'dumbbell overhead press',
  incline_db_curl: 'incline dumbbell curl',
  hammer_curl: 'hammer curl',
  tricep_pushdown: 'tricep pushdown',
  hamstring_curl: 'hamstring curl',
  calf_raise: 'calf raise',
  cable_crunch: 'cable crunch',
  deadbug: 'dead bug',
}

/** One exercise row: three sets, a rep range, a rest, and the group header. */
function ex(
  key: string,
  group: string,
  repMin: number,
  repMax: number,
  restSec: number,
  extra: Partial<PlannedExercise> = {},
): PlannedExercise {
  const name = STARTER_EXERCISE_NAMES[key] ?? SHIPPED_NAMES[key] ?? key
  return { key, name, sets: 3, repMin, repMax, restSec, group, ...extra }
}

/** Loaded with a dumbbell in each hand; the logged weight is the pair's total. */
const PAIR = { increment: 10, dumbbellPair: true } as const
/** Machine, barbell and single-dumbbell loads step in 5s. */
const PLATE = { increment: 5 } as const
/** No load at all: the weight field is hidden and the reps are the progression. */
const REPS = { bodyweight: true, repsOnly: true } as const
/** A hold, in seconds. Its group is kept off `core` so the seconds aren't summed as reps. */
const HOLD = { timed: true, bodyweight: true, repsOnly: true } as const

const GYM: PlannedExercise[][] = [
  [
    ex('leg_press', 'legs', 8, 12, 120, PLATE),
    ex('flat_bench', 'chest', 6, 10, 120, PLATE),
    ex('cable_pulldown', 'back', 8, 12, 90, PLATE),
    ex('machine_overhead_press', 'shoulders', 8, 12, 90, PLATE),
    ex('incline_db_curl', 'biceps', 8, 12, 60, PAIR),
    ex('cable_crunch', 'abs', 12, 15, 60, PLATE),
  ],
  [
    ex('barbell_squat', 'legs', 5, 8, 120, PLATE),
    ex('seated_chest_press', 'chest', 8, 12, 90, PLATE),
    ex('seated_row', 'back', 8, 12, 90, PLATE),
    ex('hamstring_curl', 'legs', 10, 15, 60, PLATE),
    ex('tricep_pushdown', 'triceps', 10, 15, 60, PLATE),
    ex('plank', 'core hold', 30, 60, 60, HOLD),
  ],
  [
    ex('romanian_deadlift', 'legs', 8, 12, 120, PLATE),
    ex('incline_bench', 'chest', 8, 12, 120, PAIR),
    ex('barbell_row', 'back', 8, 12, 120, PLATE),
    ex('calf_raise', 'legs', 10, 15, 60, PLATE),
    ex('hammer_curl', 'biceps', 10, 15, 60, PAIR),
    ex('deadbug', 'abs', 8, 12, 60, REPS),
  ],
]

const DUMBBELLS: PlannedExercise[][] = [
  [
    ex('goblet_squat', 'legs', 8, 12, 120, PLATE),
    ex('flat_bench', 'chest', 8, 12, 120, PAIR),
    ex('one_arm_db_row', 'back', 8, 12, 90, PLATE),
    ex('db_overhead_press', 'shoulders', 8, 12, 90, PAIR),
    ex('hammer_curl', 'biceps', 10, 15, 60, PAIR),
    ex('deadbug', 'abs', 8, 12, 60, REPS),
  ],
  [
    ex('db_romanian_deadlift', 'legs', 8, 12, 120, PAIR),
    ex('incline_bench', 'chest', 8, 12, 120, PAIR),
    ex('db_bent_row', 'back', 8, 12, 90, PAIR),
    ex('db_lateral_raise', 'shoulders', 12, 15, 60, PAIR),
    ex('db_calf_raise', 'legs', 12, 20, 60, PLATE),
    ex('plank', 'core hold', 30, 60, 60, HOLD),
  ],
  [
    ex('db_split_squat', 'legs', 8, 12, 120, PAIR),
    ex('db_floor_press', 'chest', 8, 12, 120, PAIR),
    ex('one_arm_db_row', 'back', 10, 15, 90, PLATE),
    ex('db_overhead_press', 'shoulders', 10, 15, 90, PAIR),
    ex('hammer_curl', 'biceps', 10, 15, 60, PAIR),
    ex('floor_crunch', 'abs', 12, 20, 60, REPS),
  ],
]

const BODYWEIGHT: PlannedExercise[][] = [
  [
    ex('pushup', 'chest', 8, 15, 90, REPS),
    ex('superman', 'back', 10, 15, 60, REPS),
    ex('bodyweight_squat', 'legs', 12, 20, 90, REPS),
    ex('glute_bridge', 'legs', 12, 20, 60, REPS),
    ex('deadbug', 'abs', 8, 12, 60, REPS),
    ex('pullup', 'back', 3, 8, 120, { bodyweight: true, optional: true }),
  ],
  [
    ex('pike_pushup', 'shoulders', 6, 12, 90, REPS),
    ex('reverse_snow_angel', 'back', 10, 15, 60, REPS),
    ex('reverse_lunge', 'legs', 8, 12, 90, REPS),
    ex('bw_calf_raise', 'legs', 15, 25, 60, REPS),
    ex('plank', 'core hold', 30, 60, 60, HOLD),
    ex('pullup', 'back', 3, 8, 120, { bodyweight: true, optional: true }),
  ],
  [
    ex('diamond_pushup', 'triceps', 6, 12, 90, REPS),
    ex('prone_swimmer', 'back', 10, 15, 60, REPS),
    ex('sumo_squat', 'legs', 12, 20, 90, REPS),
    ex('single_leg_glute_bridge', 'legs', 8, 15, 60, REPS),
    ex('floor_crunch', 'abs', 12, 20, 60, REPS),
    ex('pullup', 'back', 3, 8, 120, { bodyweight: true, optional: true }),
  ],
]

const PROGRAMMES: Record<Equipment, PlannedExercise[][]> = {
  gym: GYM,
  dumbbells: DUMBBELLS,
  bodyweight: BODYWEIGHT,
}

const SLOTS: DayType[] = ['push', 'pull', 'fullbody']
const LETTERS = ['a', 'b', 'c']

/** How many distinct days a starter plan writes for a week of `daysPerWeek`: never more than the plan has slots. */
export function starterDays(daysPerWeek: number): number {
  return Math.min(SLOTS.length, daysPerWeek)
}

/**
 * A fresh full-body plan for `setup`. All three day slots are always present
 * (the plan model has exactly three); a two-day week leaves the third empty,
 * which the UI hides.
 */
export function starterPlan(setup: StrengthSetup): Plan {
  const programme = PROGRAMMES[setup.equipment] ?? PROGRAMMES.gym
  const plan = {} as Plan
  SLOTS.forEach((type, i) => {
    const used = i < starterDays(setup.daysPerWeek)
    const day: DayPlan = {
      type,
      label: used ? `full body ${LETTERS[i]}` : 'full body',
      required: true,
      exercises: used ? programme[i].map((e) => ({ ...e })) : [],
      order: DAY_TYPES.indexOf(type),
      custom: true,
    }
    plan[type] = day
  })
  return plan
}

/** The plan a new account starts on when it didn't set strength up for itself. */
export const DEFAULT_STRENGTH: StrengthSetup = { daysPerWeek: 3, equipment: 'gym' }

/** Whether `setup` answered the focus and length questions, so is built rather than templated. */
export function isBuiltSetup(setup: StrengthSetup): boolean {
  return setup.minutes != null || setup.focus != null
}

/**
 * The plan `setup` starts on: built to its answers by lib/planBuilder when it
 * has them, else the fixed starter template it was always given — so an
 * account set up before the questions existed reads the same plan as before.
 */
export function planFor(setup: StrengthSetup): Plan {
  return isBuiltSetup(setup) ? buildPlan(setup).plan : starterPlan(setup)
}

/**
 * A fresh plan for `next`, keeping what was added to `current` by hand.
 *
 * "By hand" is anything on a day that the plan `was` would have generated for
 * that day doesn't have: what was built is replaced, edits to it included, and
 * what was added is not the generator's to throw away. Each added movement is
 * appended to the same day, in the order it had; when that day isn't used any
 * more (three days down to two) it goes on the last day that is. A movement the
 * new day already has is not added twice. A sided pair travels together, since
 * both halves were added and keep their order. So does where each day sits
 * in Today's list.
 */
export function rebuildPlan(current: Plan, was: StrengthSetup | undefined, next: StrengthSetup): Plan {
  const before = planFor(was ?? DEFAULT_STRENGTH)
  const fresh = planFor(next)
  const used = DAY_TYPES.filter((t) => fresh[t].exercises.length > 0)
  const out = {} as Plan
  // Where the days sit in Today's list is theirs too (see plan.dayOrder).
  for (const t of DAY_TYPES) {
    out[t] = { ...fresh[t], exercises: [...fresh[t].exercises], order: current[t]?.order ?? fresh[t].order }
  }
  for (const t of DAY_TYPES) {
    const generated = new Set((before[t]?.exercises ?? []).map((e) => e.key))
    const added = (current[t]?.exercises ?? []).filter((e) => !generated.has(e.key))
    if (!added.length) continue
    const target = fresh[t].exercises.length > 0 ? t : used[used.length - 1]
    if (!target) continue
    const day = out[target]
    for (const e of added) {
      if (!day.exercises.some((x) => x.key === e.key)) day.exercises.push({ ...e })
    }
  }
  return out
}
