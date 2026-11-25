/**
 * The fraction a countdown hands the shape that draws it (RestTimer, HoldTimer).
 *
 * A countdown ticks four times a second and every shape smooths those steps with
 * a CSS transition a little longer than a tick. Handed the time left *now*, a
 * shape spends that transition travelling to where the clock already was when the
 * tick fired, so it runs a tick behind all the way down — and a countdown that
 * closes its own screen at zero closes it on a shape that has not got there. On
 * most shapes that is a sliver of level nobody sees. On the curvy sand timer,
 * whose surface runs fastest through the neck, it is a visible heap of sand left
 * in the top bulb when the screen moves on.
 *
 * So the shape is handed where the clock *will* be when its transition lands.
 * Each tick's move then ends on the true reading instead of starting from it, and
 * the last one lands on empty before zero rather than after.
 */

/**
 * How far ahead of the clock the shape is aimed: a whole tick plus the transition
 * that smooths it (250ms and 260ms, `DRAIN` in components/RestShapes), and a frame
 * or two to paint. Both, because the ticks fall wherever they fall: one that lands
 * just short of aiming at empty leaves that to the next, a tick later, and that
 * one's transition still has to finish before zero. The transition alone was
 * tried first and measured in the browser closing on a hair of sand.
 */
export const SHAPE_LEAD_MS = 550

/** How much of `totalMs` the shape should show left with `remainingMs` on the clock. */
export function shapeFraction(remainingMs: number, totalMs: number): number {
  if (!(totalMs > 0)) return 0
  // A countdown shorter than the lead would start empty; give it its whole length.
  const lead = Math.min(SHAPE_LEAD_MS, totalMs / 4)
  // Rescaled rather than shifted, so the shape still starts full: the lead comes
  // out of the whole countdown evenly instead of off its first frame.
  const fraction = (remainingMs - lead) / (totalMs - lead)
  return Math.max(0, Math.min(1, fraction))
}
