/**
 * The geometry of dragging a row up and down a vertical list.
 *
 * Kept apart from the pointer plumbing in {@link useDragSort} so the part that
 * decides where a row lands can be reasoned about — and tested — without a DOM.
 */

/** Where a row sits on the page, as read off its bounding box. */
export type RowBox = { top: number; height: number }

/**
 * Each row's vertical stride: its own height plus the gap under it.
 *
 * Measured from the distance between neighbouring tops rather than a hard-coded
 * gap, so the same maths serves a list whatever its spacing, and a row that has
 * been expanded open counts at the height it's actually showing. The last row has
 * no neighbour below it to measure against, so it borrows the gap the row above
 * revealed.
 */
export function rowPitches(boxes: RowBox[]): number[] {
  return boxes.map((box, i) => {
    const next = boxes[i + 1]
    if (next) return next.top - box.top
    const prev = boxes[i - 1]
    const gap = prev ? box.top - (prev.top + prev.height) : 0
    return box.height + gap
  })
}

/**
 * Where the row picked up at `from` lands, having been dragged `delta` pixels
 * (negative is up), as an index into the reordered list.
 *
 * A row is passed once the finger has carried the dragged row over the halfway
 * point of it, counting from the slot the passes so far have already put the
 * dragged row in. So the swap happens as the two rows visibly cross, and a list
 * of mixed heights swaps a tall row where it looks like it should rather than at
 * some fixed distance.
 */
export function dropIndex(pitches: number[], from: number, delta: number): number {
  let travelled = 0
  let to = from
  if (delta >= 0) {
    for (let i = from + 1; i < pitches.length; i++) {
      if (delta < travelled + pitches[i] / 2) break
      travelled += pitches[i]
      to = i
    }
  } else {
    for (let i = from - 1; i >= 0; i--) {
      if (-delta < travelled + pitches[i] / 2) break
      travelled += pitches[i]
      to = i
    }
  }
  return to
}

/**
 * How far the row at `index` slides to open the gap the dragged row is heading
 * for. The dragged row is left at 0 here — it follows the finger instead.
 */
export function rowShift(pitches: number[], from: number, to: number, index: number): number {
  if (to > from && index > from && index <= to) return -pitches[from]
  if (to < from && index >= to && index < from) return pitches[from]
  return 0
}

/**
 * How much of a row's height, centred, counts as dropping ONTO it rather than
 * beside it. Half: the middle of the row joins, the quarter at each end slips
 * the dragged row in above or below. A fixed share rather than a fixed band of
 * pixels, so a tall row with its sets listed and a short one both leave a
 * thumb's width for either answer.
 */
export const COMBINE_BAND = 0.5

/** Where a dragged row would land: before the row at `index`, or on top of it. */
export type RowDrop = { kind: 'gap'; index: number } | { kind: 'onto'; index: number }

/**
 * Where a drag lets go, from where the finger is — `y`, in the coordinates the
 * boxes were measured in — over a list whose rows hold still while one is
 * carried across them.
 *
 * Over the middle of a row is onto it; over either end of it, or in the space
 * between two rows, is the gap on that side; past the first or last row is the
 * end of the list.
 *
 * `home` is the row the drag started from, and anywhere inside it is nowhere:
 * the drag hasn't left yet. `whole` says that row itself is what's being
 * carried, in which case the gaps on either side of it are where it already is
 * and are nowhere too. When only a part of the row is being carried — one
 * station of a circuit — those gaps are a real move: out of the row and beside it.
 */
export function dropTarget(boxes: RowBox[], y: number, home: number | null, whole: boolean): RowDrop | null {
  const gap = (index: number): RowDrop | null =>
    whole && home != null && (index === home || index === home + 1) ? null : { kind: 'gap', index }
  for (let i = 0; i < boxes.length; i++) {
    const { top, height } = boxes[i]
    if (y < top) return gap(i)
    if (y > top + height) continue
    if (i === home) return null
    const edge = (height * (1 - COMBINE_BAND)) / 2
    if (y < top + edge) return gap(i)
    if (y > top + height - edge) return gap(i + 1)
    return { kind: 'onto', index: i }
  }
  return boxes.length ? gap(boxes.length) : null
}

/**
 * Where the line marking a gap is drawn: midway through the space the gap is,
 * or just outside the first or last row.
 */
export function gapLine(boxes: RowBox[], index: number): number {
  const before = boxes[index - 1]
  const at = boxes[index]
  if (before && at) return (before.top + before.height + at.top) / 2
  if (at) return at.top
  return before ? before.top + before.height : 0
}

/** How close to the edge of a scrolling list a drag has to be held to scroll it. */
export const EDGE_SCROLL_ZONE = 64

/**
 * How far to scroll this frame with the finger at `y` in a viewport running from
 * `top` to `bottom`: nothing in the middle, faster the nearer the edge (and past
 * it), up to `max` pixels — a pace a row can still be picked out of as the list
 * goes by. Negative is up.
 */
export function edgeScroll(y: number, top: number, bottom: number, max = 8): number {
  const zone = Math.min(EDGE_SCROLL_ZONE, (bottom - top) / 3)
  if (zone <= 0) return 0
  if (y < top + zone) return -Math.ceil(max * Math.min(1, (top + zone - y) / zone))
  if (y > bottom - zone) return Math.ceil(max * Math.min(1, (y - (bottom - zone)) / zone))
  return 0
}
