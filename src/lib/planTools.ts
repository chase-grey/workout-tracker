import type { DayType } from '../types'
import {
  DAY_TYPES,
  dayOrder,
  exerciseName,
  withDayOrder,
  type Plan,
  type PlannedExercise,
} from '../config/plan'

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
      > & {
        /** Rest after this station inside its circuit; `null` clears the override. */
        circuitRestSec?: number | null
      }
    }
  | {
      op: 'addExercise'
      day: DayType
      exercise: Omit<PlannedExercise, 'key'> & { key?: string }
    }
  | { op: 'removeExercise'; day: DayType; key: string }
  | {
      op: 'moveExercise'
      day: DayType
      key: string
      /**
       * Where it lands. An anchor key (`before`/`after`) says it in the terms the
       * day is actually described in and survives a list that has shifted under an
       * earlier edit; `toIndex` is the 0-based position, used when there's no
       * neighbour to name. Anchors win if more than one is given.
       */
      before?: string
      after?: string
      toIndex?: number
    }
  /** The whole day reordered at once, listed front to back by key. */
  | { op: 'reorderDay'; day: DayType; keys: string[] }
  | { op: 'setDayLabel'; day: DayType; label: string }
  /**
   * The days themselves put in a new order — the order the Today tab offers them
   * in. The only op that isn't about one day, so it carries `days` instead of
   * `day`.
   */
  | { op: 'reorderDays'; days: DayType[] }

/** The set of valid edit ops, exported for prompting the assistant. */
export const PLAN_EDIT_OPS = [
  'setExercise',
  'addExercise',
  'removeExercise',
  'moveExercise',
  'reorderDay',
  'setDayLabel',
  'reorderDays',
] as const

/** Numeric fields on a PlannedExercise that must be finite and >= 0. */
const NUMERIC_FIELDS = ['sets', 'repMin', 'repMax', 'restSec', 'circuitRestSec', 'increment'] as const
type NumericField = (typeof NUMERIC_FIELDS)[number]

function isNumericField(field: string): field is NumericField {
  return (NUMERIC_FIELDS as readonly string[]).includes(field)
}

function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isValidDay(plan: Plan, day: unknown): day is DayType {
  // Checked against DAY_TYPES rather than a hard-coded pair, so a newly shipped
  // day (full body) is editable by the assistant without a second edit here.
  return typeof day === 'string' && (DAY_TYPES as string[]).includes(day) && day in plan
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
    // The one op that isn't scoped to a day, so it's settled before the day check
    // below — and narrowing it out here keeps `edit.day` sound for the rest.
    if (edit.op === 'reorderDays') {
      const requested = Array.isArray(edit.days) ? edit.days : []
      const ordered: DayType[] = []
      for (const day of requested) {
        if (!isValidDay(next, day)) {
          errors.push(`invalid day "${String(day)}" for op "reorderDays"`)
          continue
        }
        if (!ordered.includes(day)) ordered.push(day)
      }
      if (ordered.length === 0) {
        // Nothing recognised: an empty list has said nothing yet, and a list of
        // days the plan doesn't have has already reported each of them.
        if (requested.length === 0) errors.push('reorderDays needs the day types to order')
        continue
      }
      // Naming only some of the days puts those first and leaves the rest in their
      // current order behind them, so "run full body first" doesn't disturb the
      // two days it says nothing about.
      for (const day of dayOrder(next)) {
        if (!ordered.includes(day)) ordered.push(day)
      }
      const reordered = withDayOrder(next, ordered)
      for (const day of DAY_TYPES) next[day] = reordered[day]
      // Spelled out by label, like reorderDay: this line is the whole of what the
      // approve button in the chat shows about the change.
      applied.push(`reordered the days: ${ordered.map((d) => next[d].label || d).join(' → ')}`)
      continue
    }

    if (!isValidDay(next, edit.day)) {
      errors.push(`invalid day "${String(edit.day)}" for op "${edit.op}"`)
      continue
    }
    const dayPlan = next[edit.day]

    switch (edit.op) {
      case 'setExercise': {
        const exercise = dayPlan.exercises.find((e) => e.key === edit.key)
        if (!exercise) {
          errors.push(`no exercise "${edit.key}" on ${edit.day}`)
          break
        }
        for (const [field, value] of Object.entries(edit.fields)) {
          if (value === undefined) continue
          // Null clears the circuit-rest override, handing the station back to
          // the built-in timing — otherwise there'd be no way to undo one.
          if (field === 'circuitRestSec' && value === null) {
            delete exercise.circuitRestSec
            continue
          }
          if (isNumericField(field)) {
            if (isValidNumber(value)) {
              ;(exercise[field] as number) = value
            }
            // Invalid individual numeric fields are silently ignored.
            continue
          }
          if (field === 'name' || field === 'group') {
            // A blank name would leave the row with nothing to show but its key.
            if (typeof value === 'string' && value.trim()) exercise[field] = value
            continue
          }
          if (field === 'bodyweight') {
            if (typeof value === 'boolean') exercise.bodyweight = value
            continue
          }
        }
        applied.push(`updated ${exercise.name || exercise.key} on ${edit.day}`)
        break
      }

      case 'addExercise': {
        const src = edit.exercise
        const existingKeys = new Set(dayPlan.exercises.map((e) => e.key))
        const base = slug(src.key ?? src.name ?? '')
        const key = uniqueKey(base, existingKeys)
        // Without a name of its own the exercise takes one read off the key rather
        // than the key itself — the assistant usually names an exercise it's adding
        // back by key alone, and a stored `lateral_raise` reads as a raw slug in the
        // plan editor, the session and PRs alike.
        const name = typeof src.name === 'string' && src.name.trim() ? src.name : exerciseName(key)
        const exercise: PlannedExercise = {
          key,
          name,
          sets: isValidNumber(src.sets) ? src.sets : 3,
          repMin: isValidNumber(src.repMin) ? src.repMin : 8,
          repMax: isValidNumber(src.repMax) ? src.repMax : 12,
          restSec: isValidNumber(src.restSec) ? src.restSec : 90,
          group: src.group ?? 'custom',
        }
        if (isValidNumber(src.increment)) exercise.increment = src.increment
        if (typeof src.bodyweight === 'boolean') exercise.bodyweight = src.bodyweight
        if (typeof src.optional === 'boolean') exercise.optional = src.optional
        dayPlan.exercises.push(exercise)
        applied.push(`added ${exercise.name} to ${edit.day}`)
        break
      }

      case 'removeExercise': {
        const idx = dayPlan.exercises.findIndex((e) => e.key === edit.key)
        if (idx === -1) {
          errors.push(`no exercise "${edit.key}" on ${edit.day}`)
          break
        }
        const [removed] = dayPlan.exercises.splice(idx, 1)
        applied.push(`removed ${removed.name || exerciseName(removed.key)} from ${edit.day}`)
        break
      }

      case 'moveExercise': {
        const from = dayPlan.exercises.findIndex((e) => e.key === edit.key)
        if (from === -1) {
          errors.push(`no exercise "${edit.key}" on ${edit.day}`)
          break
        }
        // Positions are resolved against the list with the exercise already lifted
        // out of it, so "after the pushdown" means the same thing whether the move
        // is forwards or backwards.
        const rest = dayPlan.exercises.filter((_, i) => i !== from)
        const anchor = edit.before ?? edit.after
        let to: number
        if (anchor != null) {
          const at = rest.findIndex((e) => e.key === anchor)
          if (at === -1) {
            errors.push(`no exercise "${anchor}" on ${edit.day} to move "${edit.key}" next to`)
            break
          }
          to = edit.before != null ? at : at + 1
        } else if (isValidNumber(edit.toIndex)) {
          to = Math.min(Math.round(edit.toIndex), rest.length)
        } else {
          errors.push(`moveExercise needs before, after or toIndex ("${edit.key}" on ${edit.day})`)
          break
        }
        const moved = dayPlan.exercises[from]
        rest.splice(to, 0, moved)
        dayPlan.exercises = rest
        applied.push(
          `moved ${moved.name || exerciseName(moved.key)} to position ${to + 1} on ${edit.day}`,
        )
        break
      }

      case 'reorderDay': {
        const keys = Array.isArray(edit.keys) ? edit.keys : []
        const byKey = new Map(dayPlan.exercises.map((e) => [e.key, e]))
        const ordered: PlannedExercise[] = []
        const placed = new Set<string>()
        for (const key of keys) {
          if (placed.has(key)) continue
          const exercise = byKey.get(key)
          if (!exercise) {
            errors.push(`no exercise "${key}" on ${edit.day}`)
            continue
          }
          placed.add(key)
          ordered.push(exercise)
        }
        if (placed.size === 0) {
          // Nothing recognised: an empty list has said nothing yet, and a list of
          // keys the day doesn't have has already reported each of them.
          if (keys.length === 0) errors.push(`reorderDay needs the exercise keys for ${edit.day}`)
          break
        }
        // A list that names only some of the day keeps the rest in their existing
        // order behind it, so "put the squat first" doesn't drop everything else.
        for (const exercise of dayPlan.exercises) {
          if (!placed.has(exercise.key)) ordered.push(exercise)
        }
        dayPlan.exercises = ordered
        // Spelled out rather than reported as "reordered pull": this line is the
        // whole of what the approve button in the chat shows about the change.
        applied.push(
          `reordered ${edit.day}: ${ordered.map((e) => e.name || exerciseName(e.key)).join(' → ')}`,
        )
        break
      }

      case 'setDayLabel': {
        dayPlan.label = edit.label
        applied.push(`set ${edit.day} label to "${edit.label}"`)
        break
      }

      default: {
        // Exhaustiveness guard for unknown ops.
        const _exhaustive: never = edit
        errors.push(`unknown op "${(_exhaustive as { op?: string }).op ?? ''}"`)
        break
      }
    }
  }

  return { plan: next, applied, errors }
}
