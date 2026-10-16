/**
 * How long a stretch hold still takes the screen tap after its clock starts.
 *
 * A hold is otherwise exempt from the tap: it closes itself on target, and a
 * stray one shouldn't cut ninety seconds short. But the moment it comes on screen
 * is when you know you've already done it — rolled your feet out while waiting on
 * the count — and a tap then is the deliberate one. Past these seconds you're in
 * the pose, and the exemption holds.
 */
export const HOLD_TAP_GRACE_SEC = 10

/** Whether a hold that has run `elapsedSec` still ends on a tap. */
export function holdTakesTap(elapsedSec: number): boolean {
  return elapsedSec < HOLD_TAP_GRACE_SEC
}
