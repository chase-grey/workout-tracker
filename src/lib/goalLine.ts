/**
 * The height a goal's target is drawn at.
 *
 * "Bench my bodyweight" doesn't have one number to aim at: the target on any
 * day is what you weighed that day, and the ETA is already worked out against
 * the weight you'll have gained by then (see predictions.withMovingTarget). A
 * flat rule at today's weight put the finish under where the projected curve
 * actually lands; drawing the target as it moved — back through the weigh-ins
 * and on up the projected gain — put the finish right but turned every goal
 * chart into two curves to read at once. So the target is one flat rule again,
 * at the weight the goal is projected to be met at: the projected curve lands
 * on it, and the gain between now and then is folded into that one number.
 */

import type { Projection } from './predictions'

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * The target on the day the goal is projected to be reached: today's target
 * carried forward at the gain the ETA was worked out against. A target that
 * holds still, or one with no ETA to carry it to, is today's target.
 */
export function targetAtEta(proj: Pick<Projection, 'target' | 'targetSlopePerWeek' | 'etaWeeks'>): number {
  const slope = proj.targetSlopePerWeek
  if (!slope || proj.etaWeeks == null) return proj.target
  return round1(proj.target + slope * proj.etaWeeks)
}
