/**
 * How close a touch has to land to a plotted point to be asking for its reading.
 *
 * Kept apart from the pointer plumbing in {@link useChartReadout} so the part
 * that decides whether a touch was aimed at the data can be tested without a DOM.
 */

/** A plotted point, in viewport coordinates — where a pointer event reports too. */
export type Mark = { x: number; y: number }

/**
 * The radius around a point that counts as reaching for it.
 *
 * The whole card used to answer, which meant a thumb dragging the page past a
 * chart opened the readout on the way through. A charts's worth of empty space
 * above and below the line is no longer part of the target: land near the curve
 * or the tap was a scroll.
 */
export const READOUT_REACH = 24

/** How far a finger may travel and still count as a tap rather than a scroll. */
export const TAP_SLOP = 10

/**
 * Whether a touch at (`x`, `y`) is within {@link READOUT_REACH} of any of `marks`.
 *
 * A chart with no marks to aim at — the time-split donut, whose slices are the
 * whole picture — answers anywhere on it, since there's no point to be near or
 * far from.
 */
export function withinReach(marks: Mark[], x: number, y: number, reach = READOUT_REACH): boolean {
  if (marks.length === 0) return true
  return marks.some((m) => Math.hypot(m.x - x, m.y - y) <= reach)
}

/**
 * How far from a plotted point a tap may land and still be taken as aimed at it.
 *
 * Wider than {@link READOUT_REACH}: that asked whether a touch was reading the
 * chart at all, this asks which point it meant, and a fingertip is a broad
 * thing to put on a two-pixel dot.
 */
export const SNAP_REACH = 40

/**
 * The one of `marks` a tap at (`x`, `y`) was reaching for, or null if none is
 * within `reach` of it.
 *
 * Recharts picks the reading by x alone, so a tap aimed at a peak that fell a
 * little to one side read the point next to it, however far down the slope that
 * one sat. Distance on both axes is what a finger is actually judging: a local
 * maximum or minimum stands apart from its neighbours in y, and that is the
 * difference a tap near it is trying to use. The nearest point in the plane wins,
 * and only x is handed back to Recharts, which goes on reading every series at
 * that x as before.
 */
export function nearestMark(marks: Mark[], x: number, y: number, reach = SNAP_REACH): Mark | null {
  let best: Mark | null = null
  let bestDistance = reach
  for (const m of marks) {
    const d = Math.hypot(m.x - x, m.y - y)
    if (d <= bestDistance) {
      best = m
      bestDistance = d
    }
  }
  return best
}

/** What a finger on a chart turned out to be doing. */
export type Gesture = 'tap' | 'scrub' | 'scroll'

/**
 * Which of those a finger that has travelled (`dx`, `dy`) from where it landed
 * is doing.
 *
 * The page scrolls up and down and the charts run left to right, so the axis the
 * finger favours says which it meant: down the page is the scroll that shouldn't
 * open anything, along the curve is a scrub of the series. A diagonal counts as a
 * scroll — the page is already moving under it. Until it has travelled far enough
 * to have favoured either, it's still a tap.
 */
export function gestureFrom(dx: number, dy: number): Gesture {
  if (Math.abs(dy) > TAP_SLOP && Math.abs(dy) >= Math.abs(dx)) return 'scroll'
  return Math.abs(dx) > TAP_SLOP ? 'scrub' : 'tap'
}
