/**
 * The day as a session is actually performing it — the one place the layers
 * that reshape a day are stacked, so the hook that starts a session, the one
 * that reshapes it mid-workout, and the screen that runs it can't drift apart
 * on which movements are in play.
 *
 * In order: the A/B variant's set counts and press order (config/plan
 * variantExercises), how much of the day is being run (shortExercises), the
 * muscle groups resting because they trained yesterday ({@link REST_RULES}, see
 * lib/groupRest), and which arm leads the one-arm-at-a-time work
 * (sideOrderedExercises). All pinned on the session when it started, so a
 * resumed one is the same workout.
 *
 * Pure module — no React/DOM.
 */

import {
  shortExercises,
  sideOrderedExercises,
  variantExercises,
  type DayPlan,
  type Plan,
  type PlannedExercise,
} from '../config/plan'
import type { WorkoutRow, WorkoutSession } from '../types'
import { ABS_REST } from './absRest'
import { NECK_REST } from './neckRest'
import { restsGroup, withoutGroup, type RestFlag, type RestRule } from './groupRest'

/** Every group a session can rest, in the order the kebab offers them back. */
export const REST_RULES: readonly RestRule[] = [ABS_REST, NECK_REST]

export type PerformedShape = Pick<WorkoutSession, 'variant' | 'length' | 'startSide' | 'startSides' | RestFlag>

/** Which groups a session started on `today` rests, as the flags it pins. */
export function restingFlags(rows: WorkoutRow[], plan: Plan, today: string): Pick<WorkoutSession, RestFlag> {
  const flags: Pick<WorkoutSession, RestFlag> = {}
  for (const rule of REST_RULES) if (restsGroup(rule, rows, plan, today)) flags[rule.flag] = true
  return flags
}

export function performedExercises(day: DayPlan, s: PerformedShape): PlannedExercise[] {
  let full = variantExercises(day, s.variant ?? null)
  let sized = shortExercises(full, s.length)
  // A group that takes nothing for its time leaves first, from both the day being
  // run and the day a fill borrows from, so a fill that runs after it can't spend
  // its time on sets of a movement that is about to leave too.
  const resting = REST_RULES.filter((r) => s[r.flag])
  const ordered = [...resting.filter((r) => r.fill === 'none'), ...resting.filter((r) => r.fill !== 'none')]
  for (const rule of ordered) {
    sized = withoutGroup(rule.isMember, sized, full, rule.fill)
    full = full.filter((e) => !rule.isMember(e))
  }
  // A session started before each pair kept its own turn pinned one side for all.
  return sideOrderedExercises(sized, s.startSides ?? s.startSide)
}
