import { describe, it, expect } from 'vitest'
import { dropIndex, rowPitches, rowShift, type RowBox } from './dragSort'

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
