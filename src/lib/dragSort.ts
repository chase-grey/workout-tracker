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
