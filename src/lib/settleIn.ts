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
 * Only the way into the sciatic floss. Coming off the rolling-feet holds means
 * putting the ball away, lying down and getting a strap round the foot, and a
 * five-second count ran out and started the glides partway through that. The
 * floss's own side switches and rests keep their counts: you're already set up.
 */
export function settleInWaitsForTap(step: SessionStep, prev?: SessionStep): boolean {
  return step.kind === 'flex' && step.exKey === 'sciatic_floss' && prev?.exKey !== step.exKey
}
