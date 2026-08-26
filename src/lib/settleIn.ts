import type { SessionStep } from './flexSteps'

/**
 * How long the routine gives you to get into position before a set's clock
 * starts — the "get ready" count (see components/GetReady).
 *
 * Two numbers per stretch, not one, because building a position and changing it
 * are different jobs: the calf stretch needs the wall, the step and the alignment
 * found once, and after that only a foot turned out or a leg swapped. Charging the
 * full setup for every set would leave you standing in position waiting, and
 * charging the reposition for the first one would start the clock while you were
 * still looking for the wall.
 */

/** Seconds to get into position for a stretch with nothing special to set up. */
export const GET_READY_SEC = 5

/**
 * Seconds to build a position the first time it comes up, by exercise key. The
 * pike positions take real setting up — a block under the leg, a strap, the whole
 * shape squared away before anything is worth timing — and the calf stretch and
 * the nerve floss want the same twenty seconds the first time.
 */
export const GET_READY_SEC_BY_EX: Record<string, number> = {
  tailors_pose: 15,
  pike_block_crush: 15,
  pike_lift: 15,
  rolling_feet: 10,
  calf_stretch: 20,
  sciatic_floss: 20,
}

/**
 * Seconds to change position between sets of the *same* stretch, by exercise key:
 * the foot angle the calf stretch's next variation asks for, the leg the floss
 * changes to. Absent, a stretch simply gets its setup number again.
 */
export const RESET_SEC_BY_EX: Record<string, number> = {
  calf_stretch: 5,
  sciatic_floss: 10,
}

/**
 * Seconds to get into position when crossing from the mobility routine into the
 * core block. The pancake hang leaves you rested enough — no recovery rest, just
 * time to fetch a plate and set up the first sit-up. Fetching the plate is the
 * long part: it lives across the room, not on the mat, so this is more than any
 * reposition within a stretch.
 */
export const CORE_ENTRY_GET_READY_SEC = 15

/**
 * Seconds to get into position after taking a photo on the way into the first
 * stretch. A shot means the phone was propped up somewhere across the room, so
 * this is the walk back and the settle in, not just the settle in.
 */
export const POST_PHOTO_GET_READY_SEC = 15

/**
 * The settle-in a step gets before its work begins: the reposition for another set
 * of the stretch already on the mat, the full setup for a stretch just arriving,
 * a brief reposition on the way into the core block, and none between the core
 * sets — those get a real rest instead.
 *
 * `prev` is the step this one follows, which is the whole of how a reset is told
 * from a setup. Left out (the routine's very first set) nothing has been set up
 * yet, so the setup number is the right one.
 */
export function settleInSec(step: SessionStep, prev?: SessionStep): number {
  if (step.kind !== 'flex') return step.round === 0 ? CORE_ENTRY_GET_READY_SEC : 0
  const setup = GET_READY_SEC_BY_EX[step.exKey] ?? GET_READY_SEC
  if (prev?.kind === 'flex' && prev.exKey === step.exKey) {
    return RESET_SEC_BY_EX[step.exKey] ?? setup
  }
  return setup
}
