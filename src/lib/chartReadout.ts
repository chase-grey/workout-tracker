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
