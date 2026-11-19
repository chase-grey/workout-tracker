import { describe, it, expect } from 'vitest'
import { dropIndex, dropTarget, edgeScroll, gapLine, rowPitches, rowShift, type RowBox } from './dragSort'

/** Rows of the given heights, stacked from y=0 with `gap` between them. */
const stack = (heights: number[], gap = 8): RowBox[] => {
  let top = 0
  return heights.map((height) => {
    const box = { top, height }
    top += height + gap
    return box
  })
}

const even = rowPitches(stack([50, 50, 50, 50]))

describe('rowPitches', () => {
  it('measures a row as its height plus the gap below it', () => {
    expect(rowPitches(stack([50, 50, 50]))).toEqual([58, 58, 58])
  })

  it('gives an expanded row the stride it is actually taking', () => {
    expect(rowPitches(stack([50, 200, 50]))).toEqual([58, 208, 58])
  })

  it('gives the last row the gap the rows above it revealed', () => {
    expect(rowPitches(stack([50, 50, 90], 12))).toEqual([62, 62, 102])
  })

  it('has nothing to borrow a gap from for a lone row', () => {
    expect(rowPitches(stack([50]))).toEqual([50])
  })
})

describe('dropIndex', () => {
  it('holds position until the neighbour is half passed', () => {
    expect(dropIndex(even, 0, 0)).toBe(0)
    expect(dropIndex(even, 0, 28)).toBe(0)
    expect(dropIndex(even, 0, 29)).toBe(1)
  })

  it('passes a second row a whole stride later', () => {
    expect(dropIndex(even, 0, 86)).toBe(1)
    expect(dropIndex(even, 0, 87)).toBe(2)
  })

  it('reads an upward drag the same way', () => {
    expect(dropIndex(even, 3, -28)).toBe(3)
    expect(dropIndex(even, 3, -29)).toBe(2)
    expect(dropIndex(even, 3, -87)).toBe(1)
  })

  it('stops at the ends however far the finger goes', () => {
    expect(dropIndex(even, 1, 5000)).toBe(3)
    expect(dropIndex(even, 2, -5000)).toBe(0)
  })

  it('needs a tall row half crossed, not a short one', () => {
    const mixed = rowPitches(stack([50, 300, 50]))
    expect(dropIndex(mixed, 0, 100)).toBe(0)
    expect(dropIndex(mixed, 0, 154)).toBe(1)
    // Coming back the other way, the short row above goes by quickly.
    expect(dropIndex(mixed, 1, -29)).toBe(0)
  })
})

describe('rowShift', () => {
  it('lifts the rows the dragged one has moved down past', () => {
    expect([0, 1, 2, 3].map((i) => rowShift(even, 0, 2, i))).toEqual([0, -58, -58, 0])
  })

  it('drops the rows the dragged one has moved up past', () => {
    expect([0, 1, 2, 3].map((i) => rowShift(even, 3, 1, i))).toEqual([0, 58, 58, 0])
  })

  it('leaves everything alone while the row is still in its own slot', () => {
    expect([0, 1, 2, 3].map((i) => rowShift(even, 2, 2, i))).toEqual([0, 0, 0, 0])
  })

  it('opens a gap the size of the row being dragged', () => {
    const mixed = rowPitches(stack([50, 300, 50]))
    expect([0, 1, 2].map((i) => rowShift(mixed, 1, 0, i))).toEqual([308, 0, 0])
  })
})

describe('dropTarget', () => {
  // Four rows of 100 with 8 between: 0-100, 108-208, 216-316, 324-424.
  const rows = stack([100, 100, 100, 100])

  it('is onto a row over its middle half, and the gap beside it over either end', () => {
    expect(dropTarget(rows, 158, 0, true)).toEqual({ kind: 'onto', index: 1 })
    expect(dropTarget(rows, 134, 0, true)).toEqual({ kind: 'onto', index: 1 })
    expect(dropTarget(rows, 182, 0, true)).toEqual({ kind: 'onto', index: 1 })
    expect(dropTarget(rows, 240, 0, true)).toEqual({ kind: 'gap', index: 2 })
    expect(dropTarget(rows, 300, 0, true)).toEqual({ kind: 'gap', index: 3 })
  })

  it('is the gap when the finger is in the space between two rows', () => {
    expect(dropTarget(rows, 212, 0, true)).toEqual({ kind: 'gap', index: 2 })
  })

  it('is the end of the list past the first or last row', () => {
    expect(dropTarget(rows, -40, 2, true)).toEqual({ kind: 'gap', index: 0 })
    expect(dropTarget(rows, 900, 1, true)).toEqual({ kind: 'gap', index: 4 })
  })

  it('is nowhere while the drag is still inside the row it started from', () => {
    for (const y of [216, 230, 266, 300, 316]) expect(dropTarget(rows, y, 2, true)).toBeNull()
    for (const y of [216, 230, 266, 300, 316]) expect(dropTarget(rows, y, 2, false)).toBeNull()
  })

  it('is nowhere in the gaps either side of a row carried whole, since it is already there', () => {
    expect(dropTarget(rows, 212, 2, true)).toBeNull()
    expect(dropTarget(rows, 200, 2, true)).toBeNull()
    expect(dropTarget(rows, 320, 2, true)).toBeNull()
    expect(dropTarget(rows, 330, 2, true)).toBeNull()
    expect(dropTarget(rows, 900, 3, true)).toBeNull()
    expect(dropTarget(rows, -5, 0, true)).toBeNull()
  })

  it('takes a part of a row out to the gap right beside it', () => {
    expect(dropTarget(rows, 212, 2, false)).toEqual({ kind: 'gap', index: 2 })
    expect(dropTarget(rows, 320, 2, false)).toEqual({ kind: 'gap', index: 3 })
    expect(dropTarget(rows, 900, 3, false)).toEqual({ kind: 'gap', index: 4 })
  })

  it('gives a tall row a tall middle and a short row a short one', () => {
    const mixed = stack([40, 400])
    expect(dropTarget(mixed, 48 + 99, 0, true)).toBeNull()
    expect(dropTarget(mixed, 48 + 101, 0, true)).toEqual({ kind: 'onto', index: 1 })
    expect(dropTarget(mixed, 48 + 299, 0, true)).toEqual({ kind: 'onto', index: 1 })
    expect(dropTarget(mixed, 48 + 301, 0, true)).toEqual({ kind: 'gap', index: 2 })
    expect(dropTarget(mixed, 9, 1, true)).toEqual({ kind: 'gap', index: 0 })
    expect(dropTarget(mixed, 20, 1, true)).toEqual({ kind: 'onto', index: 0 })
  })

  it('has nowhere to drop in an empty list', () => {
    expect(dropTarget([], 10, null, true)).toBeNull()
  })
})

describe('gapLine', () => {
  const rows = stack([100, 100, 100])
  it('sits midway through the space between two rows', () => {
    expect(gapLine(rows, 1)).toBe(104)
    expect(gapLine(rows, 2)).toBe(212)
  })
  it('sits at the outer edge of the first and last rows', () => {
    expect(gapLine(rows, 0)).toBe(0)
    expect(gapLine(rows, 3)).toBe(316)
  })
})

describe('edgeScroll', () => {
  it('holds still in the middle of the list', () => {
    expect(edgeScroll(300, 100, 700)).toBe(0)
  })
  it('scrolls up near the top and down near the bottom, faster the nearer', () => {
    expect(edgeScroll(150, 100, 700)).toBeLessThan(0)
    expect(edgeScroll(110, 100, 700)).toBeLessThan(edgeScroll(150, 100, 700))
    expect(edgeScroll(650, 100, 700)).toBeGreaterThan(0)
    expect(edgeScroll(695, 100, 700)).toBeGreaterThan(edgeScroll(650, 100, 700))
  })
  it('tops out past the edge', () => {
    expect(edgeScroll(-500, 100, 700)).toBe(-8)
    expect(edgeScroll(5000, 100, 700)).toBe(8)
    expect(edgeScroll(5000, 100, 700, 14)).toBe(14)
  })
  it('leaves a short list a still middle', () => {
    expect(edgeScroll(150, 100, 200)).toBe(0)
  })
})
