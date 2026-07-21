import type { DayType } from '../types'

/**
 * The workout plan model. DEFAULT_PLAN below is the seed; the live plan is
 * editable in Settings and persisted per-device (see storage.loadPlan). It's a
 * plain data structure so the AI assistant can also propose edits to it later.
 *
 * `restSec` is the prescribed rest after each set.
 * `repMin`/`repMax` define the rep range used by the progression engine
 * (double progression climbs to repMax, then adds weight and resets to repMin).
 * `increment` is the weight step (lbs) when a weight bump is earned.
 * `bodyweight: true` means the weight field defaults to blank/"BW".
 */
export type PlannedExercise = {
  /** Stable key — matches the `exercise` value stored in the sheet. */
  key: string
  name: string
  sets: number
  repMin: number
  repMax: number
  restSec: number
  increment?: number
  bodyweight?: boolean
  /** Optional / do-if-energy-allows. */
  optional?: boolean
  /** Grouping header shown in the UI (e.g. "Chest"). */
  group: string
}

export type DayPlan = {
  type: DayType
  label: string
  required: boolean
  exercises: PlannedExercise[]
}

export type Plan = Record<DayType, DayPlan>

export const DAY_TYPES: DayType[] = ['push', 'pull', 'abs']

/** Marker exercise key for a detail-less "I trained" quick log (excluded from charts). */
export const QUICK_LOG_KEY = '__quicklog__'

export const DEFAULT_PLAN: Plan = {
  push: {
    type: 'push',
    label: 'Push Day',
    required: true,
    exercises: [
      { key: 'cable_crunch', name: 'Cable Crunch', sets: 3, repMin: 12, repMax: 15, restSec: 60, increment: 5, group: 'Abs' },
      { key: 'hanging_leg_raise', name: 'Hanging Leg Raise', sets: 3, repMin: 10, repMax: 12, restSec: 60, bodyweight: true, group: 'Abs' },

      { key: 'incline_bench', name: 'Incline Bench Press', sets: 4, repMin: 6, repMax: 10, restSec: 180, increment: 5, group: 'Chest' },
      { key: 'flat_bench', name: 'Flat Bench Press', sets: 3, repMin: 8, repMax: 10, restSec: 120, increment: 5, group: 'Chest' },
      { key: 'iso_chest', name: 'Chest Fly / Pec Deck', sets: 3, repMin: 12, repMax: 15, restSec: 90, increment: 2.5, group: 'Chest' },

      { key: 'db_overhead_press', name: 'Dumbbell Overhead Press', sets: 3, repMin: 8, repMax: 10, restSec: 90, increment: 5, group: 'Shoulders & Triceps' },
      { key: 'tricep_pushdown', name: 'Tricep Pushdown', sets: 2, repMin: 12, repMax: 12, restSec: 60, increment: 2.5, group: 'Shoulders & Triceps' },
      { key: 'overhead_tricep_ext', name: 'Overhead Tricep Extension', sets: 2, repMin: 12, repMax: 12, restSec: 60, increment: 2.5, group: 'Shoulders & Triceps' },

      { key: 'pullups_or_pulldown', name: 'Weighted Pull-ups or Lat Pulldown', sets: 3, repMin: 6, repMax: 8, restSec: 60, bodyweight: true, optional: true, group: 'Pull Finisher (optional)' },
    ],
  },
  pull: {
    type: 'pull',
    label: 'Pull + Legs Day',
    required: false,
    exercises: [
      { key: 'barbell_squat', name: 'Barbell Squat', sets: 4, repMin: 6, repMax: 8, restSec: 180, increment: 5, group: 'Legs' },
      { key: 'leg_adductor', name: 'Leg Adductor Machine', sets: 3, repMin: 12, repMax: 15, restSec: 90, increment: 5, group: 'Legs' },
      { key: 'leg_abductor', name: 'Leg Abductor Machine', sets: 3, repMin: 12, repMax: 15, restSec: 90, increment: 5, group: 'Legs' },

      { key: 'weighted_pullups', name: 'Weighted Pull-ups', sets: 4, repMin: 6, repMax: 8, restSec: 120, bodyweight: true, group: 'Back' },
      { key: 'cable_row', name: 'Cable Row (Neutral Grip)', sets: 3, repMin: 8, repMax: 10, restSec: 90, increment: 5, group: 'Back' },

      { key: 'incline_db_curl', name: 'Incline Dumbbell Curl', sets: 3, repMin: 10, repMax: 12, restSec: 90, increment: 5, group: 'Biceps' },
      { key: 'hammer_curl', name: 'Hammer Curl', sets: 3, repMin: 12, repMax: 12, restSec: 60, increment: 5, group: 'Biceps' },
    ],
  },
  // A short, dedicated core session you can run any day. Bodyweight moves
  // progress by reps (the progression engine climbs toward repMax), so doing
  // more reps over time is the signal that you're building ab muscle.
  abs: {
    type: 'abs',
    label: 'Abs / Core',
    required: false,
    exercises: [
      { key: 'deadbug', name: 'Dead Bug', sets: 4, repMin: 10, repMax: 20, restSec: 60, bodyweight: true, group: 'Core' },
    ],
  },
}

/** Human-readable rep range, e.g. "6–10" or "12". */
export function repRangeLabel(e: Pick<PlannedExercise, 'repMin' | 'repMax'>): string {
  return e.repMin === e.repMax ? `${e.repMin}` : `${e.repMin}–${e.repMax}`
}

/** All exercises across every day of the DEFAULT plan, for import matching + name fallback. */
export const ALL_EXERCISES: PlannedExercise[] = [
  ...DEFAULT_PLAN.push.exercises,
  ...DEFAULT_PLAN.pull.exercises,
  ...DEFAULT_PLAN.abs.exercises,
]

/**
 * Merge a stored/fetched plan onto the defaults so a plan saved before a new
 * day type existed (e.g. `abs`) still gains that day. Stored days win; missing
 * days fall back to the default.
 */
export function withPlanDefaults(p: Partial<Plan> | null | undefined): Plan {
  return { ...DEFAULT_PLAN, ...(p ?? {}) }
}

/** Lookup an exercise's display name by key, falling back to the key itself. */
export function exerciseName(key: string): string {
  return ALL_EXERCISES.find((e) => e.key === key)?.name ?? key
}

/** Backwards-compatible alias for modules still importing PLAN. */
export const PLAN = DEFAULT_PLAN
