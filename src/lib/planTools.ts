import type { DayType } from '../types'
import type { Plan, PlannedExercise } from '../config/plan'

/**
 * Structured, serializable edits to a workout {@link Plan}. The AI chat assistant
 * emits these so it can safely propose plan changes; {@link applyPlanEdits} validates
 * and applies them without ever mutating the caller's plan.
 */
export type PlanEdit =
  | {
      op: 'setExercise'
      day: DayType
      key: string
      fields: Partial<
        Pick<
          PlannedExercise,
          | 'name'
          | 'sets'
          | 'repMin'
          | 'repMax'
          | 'restSec'
          | 'increment'
          | 'bodyweight'
          | 'group'
        >
      >
    }
  | {
      op: 'addExercise'
      day: DayType
      exercise: Omit<PlannedExercise, 'key'> & { key?: string }
    }
  | { op: 'removeExercise'; day: DayType; key: string }
  | { op: 'setDayLabel'; day: DayType; label: string }

/** The set of valid edit ops, exported for prompting the assistant. */
export const PLAN_EDIT_OPS = [
  'setExercise',
  'addExercise',
  'removeExercise',
  'setDayLabel',
] as const

/** Numeric fields on a PlannedExercise that must be finite and >= 0. */
const NUMERIC_FIELDS = ['sets', 'repMin', 'repMax', 'restSec', 'increment'] as const
type NumericField = (typeof NUMERIC_FIELDS)[number]

function isNumericField(field: string): field is NumericField {
  return (NUMERIC_FIELDS as readonly string[]).includes(field)
}

function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isValidDay(plan: Plan, day: unknown): day is DayType {
  return (day === 'push' || day === 'pull' || day === 'abs') && day in plan
}

/** Slugify a name into a stable key: lowercase, non-alnum -> '_', trimmed underscores. */
function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Produce a key unique within `existingKeys`, appending _2, _3, ... on collision. */
function uniqueKey(base: string, existingKeys: Set<string>): string {
  const root = base || 'exercise'
  if (!existingKeys.has(root)) return root
  let n = 2
  while (existingKeys.has(`${root}_${n}`)) n += 1
  return `${root}_${n}`
}

/**
 * Apply a batch of structured edits to a plan.
 *
 * The input plan is never mutated; a deep clone is edited and returned. Each edit
 * is applied independently — a failing edit is recorded in `errors` and skipped,
 * while successful ones continue. Both `applied` and `errors` are human-readable.
 */
export function applyPlanEdits(
  plan: Plan,
  edits: PlanEdit[],
): { plan: Plan; applied: string[]; errors: string[] } {
  const next: Plan = JSON.parse(JSON.stringify(plan)) as Plan
  const applied: string[] = []
  const errors: string[] = []

  for (const edit of edits) {
    if (!isValidDay(next, edit.day)) {
      errors.push(`Invalid day "${String(edit.day)}" for op "${edit.op}"`)
      continue
    }
    const dayPlan = next[edit.day]

    switch (edit.op) {
      case 'setExercise': {
        const exercise = dayPlan.exercises.find((e) => e.key === edit.key)
        if (!exercise) {
          errors.push(`No exercise "${edit.key}" on ${edit.day}`)
          break
        }
        for (const [field, value] of Object.entries(edit.fields)) {
          if (value === undefined) continue
          if (isNumericField(field)) {
            if (isValidNumber(value)) {
              ;(exercise[field] as number) = value
            }
            // Invalid individual numeric fields are silently ignored.
            continue
          }
          if (field === 'name' || field === 'group') {
            if (typeof value === 'string') exercise[field] = value
            continue
          }
          if (field === 'bodyweight') {
            if (typeof value === 'boolean') exercise.bodyweight = value
            continue
          }
        }
        applied.push(`Updated ${exercise.name || exercise.key} on ${edit.day}`)
        break
      }

      case 'addExercise': {
        const src = edit.exercise
        const existingKeys = new Set(dayPlan.exercises.map((e) => e.key))
        const base = slug(src.key ?? src.name ?? '')
        const key = uniqueKey(base, existingKeys)
        const exercise: PlannedExercise = {
          key,
          name: src.name ?? key,
          sets: isValidNumber(src.sets) ? src.sets : 3,
          repMin: isValidNumber(src.repMin) ? src.repMin : 8,
          repMax: isValidNumber(src.repMax) ? src.repMax : 12,
          restSec: isValidNumber(src.restSec) ? src.restSec : 90,
          group: src.group ?? 'Custom',
        }
        if (isValidNumber(src.increment)) exercise.increment = src.increment
        if (typeof src.bodyweight === 'boolean') exercise.bodyweight = src.bodyweight
        if (typeof src.optional === 'boolean') exercise.optional = src.optional
        dayPlan.exercises.push(exercise)
        applied.push(`Added ${exercise.name} to ${edit.day}`)
        break
      }

      case 'removeExercise': {
        const idx = dayPlan.exercises.findIndex((e) => e.key === edit.key)
        if (idx === -1) {
          errors.push(`No exercise "${edit.key}" on ${edit.day}`)
          break
        }
        dayPlan.exercises.splice(idx, 1)
        applied.push(`Removed ${edit.key} from ${edit.day}`)
        break
      }

      case 'setDayLabel': {
        dayPlan.label = edit.label
        applied.push(`Set ${edit.day} label to "${edit.label}"`)
        break
      }

      default: {
        // Exhaustiveness guard for unknown ops.
        const _exhaustive: never = edit
        errors.push(`Unknown op "${(_exhaustive as { op?: string }).op ?? ''}"`)
        break
      }
    }
  }

  return { plan: next, applied, errors }
}
