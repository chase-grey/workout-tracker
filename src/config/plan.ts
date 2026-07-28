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

export const DAY_TYPES: DayType[] = ['push', 'pull']

/** Marker exercise key for a detail-less "I trained" quick log (excluded from charts). */
export const QUICK_LOG_KEY = '__quicklog__'

/**
 * Dead Bug — core work folded into the Stretch + Core session (it no longer has
 * a standalone day). Each set is still logged as a workout row under this key so
 * historical dead-bug data and the 'reps' progress chart stay continuous, but a
 * session made up only of this move is supplemental and never counts toward the
 * weekly workout goal (see SUPPLEMENTAL_EXERCISE_KEYS).
 */
export const DEAD_BUG: PlannedExercise = {
  key: 'deadbug',
  name: 'Dead Bug',
  sets: 4,
  repMin: 10,
  repMax: 20,
  restSec: 60,
  bodyweight: true,
  group: 'Core',
}

export const DEFAULT_PLAN: Plan = {
  push: {
    type: 'push',
    label: 'Push',
    required: true,
    exercises: [
      { key: 'cable_crunch', name: 'Cable Crunch', sets: 3, repMin: 12, repMax: 15, restSec: 60, increment: 5, group: 'Abs' },
      { key: 'hanging_leg_raise', name: 'Hanging Leg Raise', sets: 3, repMin: 10, repMax: 15, restSec: 60, bodyweight: true, group: 'Abs' },

      { key: 'incline_bench', name: 'Incline Bench Press', sets: 4, repMin: 6, repMax: 10, restSec: 150, increment: 5, group: 'Chest' },
      { key: 'flat_bench', name: 'Flat Bench Press', sets: 3, repMin: 8, repMax: 12, restSec: 120, increment: 5, group: 'Chest' },
      { key: 'iso_chest', name: 'Chest Fly / Pec Deck', sets: 3, repMin: 12, repMax: 15, restSec: 75, increment: 2.5, group: 'Chest' },

      { key: 'db_overhead_press', name: 'Dumbbell Overhead Press', sets: 3, repMin: 8, repMax: 12, restSec: 120, increment: 5, group: 'Shoulders & Triceps' },
      { key: 'lateral_raise', name: 'Lateral Raise', sets: 3, repMin: 12, repMax: 20, restSec: 60, increment: 2.5, group: 'Shoulders & Triceps' },
      { key: 'tricep_pushdown', name: 'Tricep Pushdown', sets: 3, repMin: 10, repMax: 15, restSec: 60, increment: 2.5, group: 'Shoulders & Triceps' },
      { key: 'overhead_tricep_ext', name: 'Overhead Tricep Extension', sets: 3, repMin: 10, repMax: 15, restSec: 60, increment: 2.5, group: 'Shoulders & Triceps' },

      { key: 'pullups_or_pulldown', name: 'Weighted Pull-ups or Lat Pulldown', sets: 3, repMin: 6, repMax: 10, restSec: 90, bodyweight: true, optional: true, group: 'Pull Finisher (optional)' },
    ],
  },
  pull: {
    type: 'pull',
    label: 'Pull + Legs',
    required: false,
    exercises: [
      { key: 'barbell_squat', name: 'Barbell Squat', sets: 4, repMin: 6, repMax: 10, restSec: 180, increment: 5, group: 'Legs' },
      { key: 'hamstring_curl', name: 'Hamstring Curl', sets: 3, repMin: 10, repMax: 15, restSec: 90, increment: 5, group: 'Legs' },
      { key: 'leg_adductor', name: 'Leg Adductor Machine', sets: 3, repMin: 12, repMax: 15, restSec: 75, increment: 5, group: 'Legs' },
      { key: 'leg_abductor', name: 'Leg Abductor Machine', sets: 3, repMin: 12, repMax: 15, restSec: 75, increment: 5, group: 'Legs' },

      { key: 'weighted_pullups', name: 'Weighted Pull-ups', sets: 4, repMin: 6, repMax: 10, restSec: 120, bodyweight: true, group: 'Back' },
      { key: 'cable_row', name: 'Cable Row (Neutral Grip)', sets: 2, repMin: 10, repMax: 12, restSec: 90, increment: 5, group: 'Back' },

      { key: 'incline_db_curl', name: 'Incline Dumbbell Curl', sets: 3, repMin: 8, repMax: 12, restSec: 90, increment: 5, group: 'Biceps' },
      { key: 'hammer_curl', name: 'Hammer Curl', sets: 3, repMin: 10, repMax: 15, restSec: 60, increment: 5, group: 'Biceps' },
    ],
  },
}

/** Human-readable rep range, e.g. "6–10" or "12". */
export function repRangeLabel(e: Pick<PlannedExercise, 'repMin' | 'repMax'>): string {
  return e.repMin === e.repMax ? `${e.repMin}` : `${e.repMin}–${e.repMax}`
}

/**
 * All exercises across every day of the DEFAULT plan, for import matching + name
 * fallback. Dead Bug is appended even though it's no longer a plan day, so its
 * key still resolves to "Dead Bug" in charts, the AI prompt, and records.
 */
export const ALL_EXERCISES: PlannedExercise[] = [
  ...DEFAULT_PLAN.push.exercises,
  ...DEFAULT_PLAN.pull.exercises,
  DEAD_BUG,
]

/**
 * Day labels the defaults used to ship with. A plan saved under an old name
 * keeps that label forever, so a rename here would never reach a device that
 * had already stored one — these get upgraded to the current default instead.
 * A label the user actually chose is left alone.
 */
const LEGACY_LABELS: Record<DayType, string[]> = {
  push: ['Push Day'],
  pull: ['Pull + Legs Day'],
}

/**
 * Merge the default exercise list into a stored day's list: the user's own
 * exercises (with their edits and ordering) are kept untouched, and any default
 * exercise the stored day is missing — e.g. a newly shipped move like Lateral
 * Raise — is spliced in next to its default neighbour so it lands in a sensible
 * spot. Existing (possibly customized) exercises are never overwritten.
 */
function mergeDayExercises(defaults: PlannedExercise[], stored: PlannedExercise[]): PlannedExercise[] {
  const storedKeys = new Set(stored.map((e) => e.key))
  const out = [...stored]
  defaults.forEach((def, i) => {
    if (storedKeys.has(def.key)) return
    // Insert after the nearest earlier default exercise that the stored list has,
    // so a new move keeps its intended neighbour; otherwise append.
    let insertAt = out.length
    for (let j = i - 1; j >= 0; j--) {
      const idx = out.findIndex((e) => e.key === defaults[j].key)
      if (idx >= 0) {
        insertAt = idx + 1
        break
      }
    }
    out.splice(insertAt, 0, { ...def })
  })
  return out
}

/**
 * Merge a stored/fetched plan onto the defaults so a day saved before a new
 * exercise shipped still gains that exercise. Stored days/exercises win; missing
 * ones fall back to the default. Only the current DAY_TYPES are kept, so a plan
 * saved with a now-removed day (e.g. the old standalone `abs`/Core day) has that
 * day silently dropped rather than resurfacing a stale button.
 */
export function withPlanDefaults(p: Partial<Plan> | null | undefined): Plan {
  const stored = (p ?? {}) as Partial<Record<string, DayPlan>>
  const merged = {} as Plan
  for (const type of DAY_TYPES) {
    const storedDay = stored[type]
    const day = storedDay ?? DEFAULT_PLAN[type]
    // A day taken from storage keeps its exercises but gains any new defaults.
    const exercises = storedDay
      ? mergeDayExercises(DEFAULT_PLAN[type].exercises, day.exercises)
      : day.exercises
    const label = LEGACY_LABELS[type].includes(day.label) ? DEFAULT_PLAN[type].label : day.label
    merged[type] = { ...day, label, exercises }
  }
  return merged
}

/** Lookup an exercise's display name by key, falling back to the key itself. */
export function exerciseName(key: string): string {
  return ALL_EXERCISES.find((e) => e.key === key)?.name ?? key
}

/**
 * Keys of every exercise that trains the core, across all days of the plan —
 * matched by group ("Abs" or "Core") so ab work counts wherever it's logged
 * (e.g. cable crunches / hanging leg raises on Push day, or a Core session),
 * not just the dedicated Core-day move. Derived from the live plan so edits and
 * added ab exercises are picked up automatically.
 */
export function absExerciseKeys(plan: Plan): Set<string> {
  // Dead Bug lives in the Stretch + Core session now, not the plan, so seed it
  // explicitly to keep its reps in the combined core series.
  const keys = new Set<string>([DEAD_BUG.key])
  for (const day of Object.values(plan)) {
    for (const e of day.exercises) {
      if (/^(abs|core)$/i.test(e.group)) keys.add(e.key)
    }
  }
  return keys
}

/** Backwards-compatible alias for modules still importing PLAN. */
export const PLAN = DEFAULT_PLAN
