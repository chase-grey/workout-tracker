import type { DayType } from '../types'

/**
 * The hardcoded workout plan. Edit this object to change the plan — it is
 * intentionally a plain data structure so no component code needs to change.
 *
 * `restSec` is the prescribed rest AFTER each set of the exercise.
 * `bodyweight: true` means the weight field defaults to blank/"BW" (with an
 * optional added-weight entry for weighted variations).
 */
export type PlannedExercise = {
  /** Stable key — must match the `exercise` value stored in the sheet. */
  key: string
  name: string
  sets: number
  /** Human-readable rep target, e.g. "6–10" or "12". */
  repTarget: string
  restSec: number
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

export const PLAN: Record<DayType, DayPlan> = {
  push: {
    type: 'push',
    label: 'Push Day',
    required: true,
    exercises: [
      { key: 'cable_crunch', name: 'Cable Crunch', sets: 3, repTarget: '12–15', restSec: 60, group: 'Abs' },
      { key: 'hanging_leg_raise', name: 'Hanging Leg Raise', sets: 3, repTarget: '10–12', restSec: 60, bodyweight: true, group: 'Abs' },

      { key: 'incline_barbell_press', name: 'Incline Barbell Press', sets: 4, repTarget: '6–10', restSec: 180, group: 'Chest' },
      { key: 'flat_dumbbell_press', name: 'Flat Dumbbell Press', sets: 3, repTarget: '8–10', restSec: 120, group: 'Chest' },
      { key: 'cable_fly', name: 'Cable Fly / Pec Deck', sets: 3, repTarget: '12–15', restSec: 90, group: 'Chest' },

      { key: 'db_overhead_press', name: 'Dumbbell Overhead Press', sets: 3, repTarget: '8–10', restSec: 90, group: 'Shoulders & Triceps' },
      { key: 'tricep_pushdown', name: 'Tricep Pushdown', sets: 2, repTarget: '12', restSec: 60, group: 'Shoulders & Triceps' },
      { key: 'overhead_tricep_ext', name: 'Overhead Tricep Extension', sets: 2, repTarget: '12', restSec: 60, group: 'Shoulders & Triceps' },

      { key: 'pullups_or_pulldown', name: 'Weighted Pull-ups or Lat Pulldown', sets: 3, repTarget: '6–8', restSec: 60, bodyweight: true, optional: true, group: 'Pull Finisher (optional)' },
    ],
  },
  pull: {
    type: 'pull',
    label: 'Pull Day',
    required: false,
    exercises: [
      { key: 'barbell_squat', name: 'Barbell Squat', sets: 4, repTarget: '6–8', restSec: 180, group: 'Legs' },
      { key: 'leg_adductor', name: 'Leg Adductor Machine', sets: 3, repTarget: '12–15', restSec: 90, group: 'Legs' },
      { key: 'leg_abductor', name: 'Leg Abductor Machine', sets: 3, repTarget: '12–15', restSec: 90, group: 'Legs' },

      { key: 'weighted_pullups', name: 'Weighted Pull-ups', sets: 4, repTarget: '6–8', restSec: 120, bodyweight: true, group: 'Back' },
      { key: 'cable_row', name: 'Cable Row (Neutral Grip)', sets: 3, repTarget: '8–10', restSec: 90, group: 'Back' },

      { key: 'incline_db_curl', name: 'Incline Dumbbell Curl', sets: 3, repTarget: '10–12', restSec: 90, group: 'Biceps' },
      { key: 'hammer_curl', name: 'Hammer Curl', sets: 3, repTarget: '12', restSec: 60, group: 'Biceps' },
    ],
  },
}

/** All exercises across both days, for selectors and import matching. */
export const ALL_EXERCISES: PlannedExercise[] = [
  ...PLAN.push.exercises,
  ...PLAN.pull.exercises,
]

/** Lookup an exercise's display name by key, falling back to the key itself. */
export function exerciseName(key: string): string {
  return ALL_EXERCISES.find((e) => e.key === key)?.name ?? key
}
