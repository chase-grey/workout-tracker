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
 * Whether the count on screen holds on "ready?", given how you got to it.
 *
 * "ready?" asks for a tap, so it is only asked of someone who hasn't just given
 * one. A rest tapped away, the preview tapped through and a checklist row tapped
 * are each already the answer (`tappedIn`), and the count runs from that tap. A
 * rest that hands-free rolled out by itself, and a set that ended on its own
 * clock, were not: those are where the wait still stands, for the exercises
 * that wait (see {@link settleInWaitsForTap}) and for any new exercise
 * hands-free (`handsFreeNewExercise`).
 */
export function holdsOnReady(
  step: SessionStep,
  prev: SessionStep | undefined,
  routine: FlexRoutineKey | undefined,
  how: { tappedIn: boolean; handsFreeNewExercise: boolean },
): boolean {
  if (how.tappedIn) return false
  return how.handsFreeNewExercise || settleInWaitsForTap(step, prev, routine)
}

/**
 * Whether the tap that ends that wait starts the count rather than the set.
 *
 * Any set that runs on a clock: a hold, an open hold, a paced set. The tap is
 * made with a hand that then has to get back under you, and a clock that starts
 * on the tap is running before you are in the pose. So the tap starts the
 * get-into-position count and the count starts the set, hands-free or not (see
 * components/GetReady's tapStartsCount).
 *
 * A typed-in set has no clock to get ahead of you: its tap puts the card up.
 */
export function settleInTapStartsCount(step: SessionStep): boolean {
  return step.kind === 'flex'
}
