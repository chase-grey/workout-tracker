/**
 * Resting the neck on back-to-back days.
 *
 * Neck flexion is trained on two of the three lift days (see
 * config/plan.NECK_FLEXION), and like the abs it's a small muscle on a light,
 * high-rep ladder that wants a day between sessions rather than two in a row. So
 * a session started the day after neck work — or later the same day as some —
 * leaves it out, the same rule the abs follow (see lib/groupRest), and the kebab
 * brings it back.
 *
 * Unlike the abs, the time goes unspent (`'none'`). The block is three sets,
 * about four minutes: too little to buy a whole movement back from the full day,
 * and what a short pull + legs day would borrow first is the hip work at the end
 * of it, a quarter of an hour on the floor that four minutes can't pay for and
 * the day doesn't want. A day that's a few minutes shorter is the honest trade.
 *
 * Pure module — no React/DOM.
 */

import type { WorkoutRow } from '../types'
import { NECK_EXTENSION_KEY, type Plan, type PlannedExercise } from '../config/plan'
import { restsGroup, type RestRule } from './groupRest'

/** The display groups that make a movement neck work — today's `neck`, and the pair's old `neck circuit`. */
const NECK_GROUP_RE = /^neck( circuit)?$/i

export function isNeckExercise(e: Pick<PlannedExercise, 'group'>): boolean {
  return NECK_GROUP_RE.test(e.group)
}

/**
 * Every exercise key that counts as neck work: whatever the plan groups as neck,
 * plus the retired extension, whose logged sets still say the neck trained that
 * day even though no day prescribes it.
 */
export function neckExerciseKeys(plan: Plan): Set<string> {
  const keys = new Set<string>(['neck_flexion', NECK_EXTENSION_KEY])
  for (const day of Object.values(plan)) {
    for (const e of day?.exercises ?? []) if (isNeckExercise(e)) keys.add(e.key)
  }
  return keys
}

export const NECK_REST: RestRule = {
  label: 'neck',
  flag: 'restNeck',
  isMember: isNeckExercise,
  trainedKeys: neckExerciseKeys,
  fill: 'none',
}

/** Whether a session started on `today` should leave its neck work out (see groupRest.restsGroup). */
export function restsNeck(rows: WorkoutRow[], plan: Plan, today: string): boolean {
  return restsGroup(NECK_REST, rows, plan, today)
}
