/**
 * Resting the abs on back-to-back days.
 *
 * Every lift day opens with the same two ab movements (see config/plan — the
 * cable crunch and the incline sit-up, four sets each, three on full body).
 * Trained on consecutive days that is the one muscle in the plan with no day off
 * between sessions, so a session started the day after ab work — or later the
 * same day as some — leaves the ab block out, and spends the time it would have
 * taken on the rest of the day instead. The kebab brings the abs back if today
 * is the day for them after all (see {@link restoreAbs}).
 *
 * The mechanism is lib/groupRest's, shared with the neck (lib/neckRest); this is
 * the abs' rule for it. What fills the time is pinned at {@link ABS_REST_FILL}:
 * `'borrow'`, the program's own extras — what the day would have had with more
 * time — and then a set or two more of the lifts in play (see groupRest.RestFill
 * for the alternatives). The block is six or eight sets, a quarter of an hour
 * and more at ninety seconds' rest; a day that just loses it is a noticeably
 * shorter workout, not a rounding error.
 *
 * Whenever the abs are trained they lead the session: the block is the first
 * thing every day lists, and bringing it back mid-session puts it back at the
 * top (see {@link restoreAbs}).
 *
 * Pure module — no React/DOM.
 */

import type { WorkoutRow, WorkoutSession } from '../types'
import { absExerciseKeys, type Plan, type PlannedExercise } from '../config/plan'
import { restoreGroup, restsGroup, trainedOn, withoutGroup, type RestFill, type RestRule } from './groupRest'
import type { Target } from './progression'

export type AbsFill = RestFill

/** How a session without its ab block spends the time (see module comment). */
export const ABS_REST_FILL: AbsFill = 'borrow'

/** The display groups that make a movement part of the ab block. */
const ABS_GROUP_RE = /^(abs|core)$/i

export function isAbsExercise(e: Pick<PlannedExercise, 'group'>): boolean {
  return ABS_GROUP_RE.test(e.group)
}

export const ABS_REST: RestRule = {
  label: 'abs',
  flag: 'restAbs',
  isMember: isAbsExercise,
  // Any ab work counts — a lift day's block, a stretch's mat sit-ups, the retired raise.
  trainedKeys: absExerciseKeys,
  fill: ABS_REST_FILL,
}

/** Whether any ab work — a lift day's block or a stretch's mat sit-ups — logged reps on `date`. */
export function absTrainedOn(rows: WorkoutRow[], plan: Plan, date: string): boolean {
  return trainedOn(ABS_REST, rows, plan, date)
}

/** Whether a session started on `today` should leave its ab block out (see groupRest.restsGroup). */
export function restsAbs(rows: WorkoutRow[], plan: Plan, today: string): boolean {
  return restsGroup(ABS_REST, rows, plan, today)
}

/** `sized` without its ab block, the time spent per `fill` (see groupRest.withoutGroup). */
export function withoutAbs(
  sized: PlannedExercise[],
  full: PlannedExercise[],
  fill: AbsFill = ABS_REST_FILL,
): PlannedExercise[] {
  return withoutGroup(isAbsExercise, sized, full, fill)
}

/** `session` with its ab block back (see groupRest.restoreGroup). */
export function restoreAbs(
  session: WorkoutSession,
  withAbs: PlannedExercise[],
  targets: Map<string, Target>,
): WorkoutSession {
  return restoreGroup(ABS_REST, session, withAbs, targets)
}
