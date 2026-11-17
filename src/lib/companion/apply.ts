/**
 * Turning companion ops into the plan and goals they describe, without saving
 * anything.
 *
 * The lift ops become lib/planTools edits and go through applyPlanEdits, the
 * function the BYO-key coach's update_plan already uses, so validation, removal
 * headstones and the left/right pairing (lib/pairedSides) are the same whichever
 * AI wrote the change. The one gap applyPlanEdits leaves — a set/reps/rest change
 * lands on the side it names only — is closed here: a `lift set` on one side of
 * a sided pair is applied to both, since a movement trained harder on one arm is
 * never what's meant.
 *
 * Pure module — no React/DOM, no storage.
 */

import { ALL_EXERCISES, repRangeLabel, type Plan, type PlannedExercise } from '../../config/plan'
import { applyPlanEdits, type PlanEdit } from '../planTools'
import { sidePartnerKey } from '../pairedSides'
import { isChangeOp, type CompanionOp, type LiftOp } from './ops'

/** What a companion can change: the lift plan and the weekly workouts goal. */
export type CompanionState = {
  plan: Plan
  /** The weekly workouts goal, or null where there's none to change. */
  weeklyWorkouts: number | null
}

/** Settings an added exercise inherits from the shipped exercise its name matched. */
const INHERITED: (keyof PlannedExercise)[] = [
  'group',
  'increment',
  'bodyweight',
  'repsOnly',
  'timed',
  'side',
  'dumbbellPair',
  'weightCapLbs',
  'stackSetting',
  'repLadder',
]

function liftEdits(plan: Plan, op: LiftOp): PlanEdit[] {
  switch (op.op) {
    case 'lift.set': {
      const fields: Extract<PlanEdit, { op: 'setExercise' }>['fields'] = {}
      if (op.sets != null) fields.sets = op.sets
      if (op.repMin != null) fields.repMin = op.repMin
      if (op.repMax != null) fields.repMax = op.repMax
      if (op.restSec != null) fields.restSec = op.restSec
      if (op.name) fields.name = op.name
      const edits: PlanEdit[] = [{ op: 'setExercise', day: op.day, key: op.key, fields }]
      const partner = sidePartnerKey(op.key)
      if (partner && plan[op.day]?.exercises.some((e) => e.key === partner)) {
        const { name: _own, ...shared } = fields
        edits.push({ op: 'setExercise', day: op.day, key: partner, fields: shared })
      }
      return edits
    }
    case 'lift.add': {
      const shipped = op.key ? ALL_EXERCISES.find((e) => e.key === op.key) : undefined
      const base: Partial<PlannedExercise> = {}
      if (shipped) for (const k of INHERITED) if (shipped[k] !== undefined) (base as Record<string, unknown>)[k] = shipped[k]
      return [
        {
          op: 'addExercise',
          day: op.day,
          exercise: {
            ...base,
            ...(op.key ? { key: op.key } : {}),
            name: op.name,
            sets: op.sets ?? shipped?.sets ?? 3,
            repMin: op.repMin ?? shipped?.repMin ?? 8,
            repMax: op.repMax ?? shipped?.repMax ?? 12,
            restSec: op.restSec ?? shipped?.restSec ?? 90,
            group: op.group ?? base.group ?? 'custom',
          },
        },
      ]
    }
    case 'lift.remove':
      return [{ op: 'removeExercise', day: op.day, key: op.key }]
    case 'lift.move':
      return [
        {
          op: 'moveExercise',
          day: op.day,
          key: op.key,
          ...(op.before != null ? { before: op.before } : {}),
          ...(op.after != null ? { after: op.after } : {}),
          ...(op.toIndex != null ? { toIndex: op.toIndex } : {}),
        },
      ]
  }
}

/** "bench press on push: 3 → 4 sets, 8–12 → 6–8 reps", from the exercise before and after. */
function describeSet(before: Plan, after: Plan, op: Extract<LiftOp, { op: 'lift.set' }>): string {
  const was = before[op.day].exercises.find((e) => e.key === op.key)!
  const now = after[op.day].exercises.find((e) => e.key === op.key)!
  const parts: string[] = []
  if (was.sets !== now.sets) parts.push(`${was.sets} → ${now.sets} sets`)
  if (was.repMin !== now.repMin || was.repMax !== now.repMax) {
    parts.push(`${repRangeLabel(was)} → ${repRangeLabel(now)} reps`)
  }
  if (was.restSec !== now.restSec) parts.push(`${was.restSec}s → ${now.restSec}s rest`)
  const partner = sidePartnerKey(op.key)
  const pair = partner && now && after[op.day].exercises.some((e) => e.key === partner) ? ' (both sides)' : ''
  return `${now.name}${pair} on ${op.day}: ${parts.join(', ') || 'unchanged'}`
}

/**
 * The state `ops` produce, with one line per change for the preview and one per
 * op that couldn't be applied. `state` is never mutated. Ops apply in order, each
 * against the plan the ones before it left, so a remove-then-add swap works.
 */
export function applyCompanionOps(
  state: CompanionState,
  ops: CompanionOp[],
): { next: CompanionState; applied: string[]; errors: string[] } {
  let plan = state.plan
  let weeklyWorkouts = state.weeklyWorkouts
  const applied: string[] = []
  const errors: string[] = []
  for (const op of ops) {
    if (!isChangeOp(op)) continue
    if (op.op === 'weekly') {
      if (weeklyWorkouts == null) {
        errors.push("the weekly goal can't be changed here")
        continue
      }
      if (op.workouts !== weeklyWorkouts) {
        applied.push(`weekly goal: ${weeklyWorkouts} → ${op.workouts} workouts`)
        weeklyWorkouts = op.workouts
      }
      continue
    }
    const res = applyPlanEdits(plan, liftEdits(plan, op))
    if (op.op === 'lift.set' && res.errors.length === 0) {
      applied.push(describeSet(plan, res.plan, op))
    } else if (res.applied.length) {
      // A paired set is two edits but one change to say.
      applied.push(res.applied[0])
    }
    plan = res.plan
    errors.push(...res.errors)
  }
  return { next: { plan, weeklyWorkouts }, applied, errors }
}
