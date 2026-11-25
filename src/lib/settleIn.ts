import type { FlexRoutineKey } from '../config/flexRoutines'
import type { SessionStep } from './flexSteps'

/** Default seconds for a get-into-position countdown. */
export const GET_READY_SEC = 5
export const CORE_ENTRY_GET_READY_SEC = GET_READY_SEC
export const POST_PHOTO_GET_READY_SEC = GET_READY_SEC

/** Core sets after the first use their rest instead of a positioning countdown. */
export function settleInSec(step: SessionStep, _prev?: SessionStep): number {
  if (step.kind === 'flex' && step.exKey === 'tailors_pose') return 15
  if (step.kind !== 'flex' && step.round !== 0) return 0
  return GET_READY_SEC
}

/**
 * Whether the settle-in ahead of this set waits for a tap instead of counting down.
 *
 * A new exercise means a new place to be: off the floor, onto a bench, down on
 * a knee. The clock has no idea how long that takes, so the way in waits on
 * you, the way a lift's next exercise does and the way hands-free already
 * stands down for one (see lib/fastMode's startsNewExercise).
 *
 * The pelvic tilt routine asks at every exercise: each of its moves is a
 * different position from the last. That includes its typed-in set, the hip
 * thrust. Its card waits for the tap that logs it, but a card that is simply
 * there after a five-second count reads as the exercise having started without
 * you. An exercise's own side switches keep their counts and its later sets
 * their rests: you're already set up.
 *
 * Head to toe asks only on the way into the sciatic floss. Coming off the
 * rolling-feet holds means putting the ball away and finding the strap, and a
 * five-second count ran out and started the glides partway through that.
 */
export function settleInWaitsForTap(step: SessionStep, prev?: SessionStep, routine?: FlexRoutineKey): boolean {
  if (prev == null || prev.exKey === step.exKey) return false
  return routine === 'pelvic_tilt' || (step.kind === 'flex' && step.exKey === 'sciatic_floss')
}

/**
 * Whether the tap that ends that wait starts the count rather than the set.
 *
 * Only the floss: its tap says the strap is in hand, not that you're lying in
 * position with it (see components/GetReady's tapStartsCount). Everywhere else
 * the tap says you're in position, and the set starts on it.
 */
export function settleInTapStartsCount(step: SessionStep, prev?: SessionStep): boolean {
  return step.kind === 'flex' && step.exKey === 'sciatic_floss' && prev != null && prev.exKey !== step.exKey
}
