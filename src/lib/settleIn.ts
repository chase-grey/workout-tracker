import type { SessionStep } from './flexSteps'

/** Seconds for every get-into-position countdown. */
export const GET_READY_SEC = 5
export const CORE_ENTRY_GET_READY_SEC = GET_READY_SEC
export const POST_PHOTO_GET_READY_SEC = GET_READY_SEC

/** Core sets after the first use their rest instead of a positioning countdown. */
export function settleInSec(step: SessionStep, _prev?: SessionStep): number {
  if (step.kind !== 'flex' && step.round !== 0) return 0
  return GET_READY_SEC
}
