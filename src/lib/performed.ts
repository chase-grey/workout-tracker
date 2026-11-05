/**
 * The day as a session is actually performing it — the one place the layers
 * that reshape a day are stacked, so the hook that starts a session, the one
 * that reshapes it mid-workout, and the screen that runs it can't drift apart
 * on which movements are in play.
 *
 * In order: the A/B variant's set counts and press order (config/plan
 * variantExercises), how much of the day is being run (shortExercises), the ab
 * block left out when the abs trained yesterday (lib/absRest.withoutAbs), and
 * which arm leads the one-arm-at-a-time work (sideOrderedExercises). All pinned
 * on the session when it started, so a resumed one is the same workout.
 *
 * Pure module — no React/DOM.
 */

import {
  shortExercises,
  sideOrderedExercises,
  variantExercises,
  type DayPlan,
  type PlannedExercise,
} from '../config/plan'
import type { WorkoutSession } from '../types'
import { withoutAbs } from './absRest'

export type PerformedShape = Pick<WorkoutSession, 'variant' | 'length' | 'startSide' | 'restAbs'>

export function performedExercises(day: DayPlan, s: PerformedShape): PlannedExercise[] {
  const full = variantExercises(day, s.variant ?? null)
  const sized = shortExercises(full, s.length)
  return sideOrderedExercises(s.restAbs ? withoutAbs(sized, full) : sized, s.startSide)
}
