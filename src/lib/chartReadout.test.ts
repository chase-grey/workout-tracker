import { describe, expect, it } from 'vitest'
import { gestureFrom, nearestMark, READOUT_REACH, SNAP_REACH, TAP_SLOP, withinReach } from './chartReadout'

describe('withinReach', () => {
  const marks = [
    { x: 100, y: 100 },
    { x: 200, y: 60 },
  ]

  it('answers for a touch on a point', () => {
    expect(withinReach(marks, 100, 100)).toBe(true)
  })

  it('answers for a touch near one', () => {
    expect(withinReach(marks, 210, 70)).toBe(true)
  })

  it('ignores a touch in the empty space above the line', () => {
    expect(withinReach(marks, 100, 20)).toBe(false)
  })

  it('ignores a touch between two far-apart points', () => {
    expect(withinReach(marks, 150, 80)).toBe(false)
  })

  it('measures as a radius, not a box', () => {
    // Inside the square that reach describes, outside the circle.
    const corner = READOUT_REACH * 0.9
    expect(withinReach([{ x: 0, y: 0 }], corner, corner)).toBe(false)
    expect(withinReach([{ x: 0, y: 0 }], READOUT_REACH, 0)).toBe(true)
  })

  it('leaves a chart with no plotted points answering anywhere', () => {
    expect(withinReach([], 0, 0)).toBe(true)
  })
})

describe('nearestMark', () => {
  // A peak at x=130 between two low neighbours, a month of weekly readings apart.
  const marks = [
    { x: 100, y: 150 },
    { x: 130, y: 40 },
    { x: 160, y: 150 },
  ]

  it('finds the point under a tap', () => {
    expect(nearestMark(marks, 130, 40)).toEqual(marks[1])
  })

  it('gives a tap that fell to one side of a peak to the peak, not its x neighbour', () => {
    // Nearer the third point's x than the peak's own, but level with the peak.
    expect(nearestMark(marks, 147, 55)).toEqual(marks[1])
  })

  it('gives a tap on the slope to the point it sits on', () => {
    expect(nearestMark(marks, 110, 160)).toEqual(marks[0])
  })

  it('answers nothing for a tap out in the open', () => {
    expect(nearestMark(marks, 130, 300)).toBeNull()
    expect(nearestMark([], 0, 0)).toBeNull()
  })

  it('measures as a radius, not a box', () => {
    const corner = SNAP_REACH * 0.9
    expect(nearestMark([{ x: 0, y: 0 }], corner, corner)).toBeNull()
    expect(nearestMark([{ x: 0, y: 0 }], SNAP_REACH, 0)).toEqual({ x: 0, y: 0 })
  })

  it('reaches further than the readout needs to open', () => {
    expect(SNAP_REACH).toBeGreaterThan(READOUT_REACH)
  })
})

describe('gestureFrom', () => {
  const far = TAP_SLOP * 4

  it('holds a finger that has barely moved to a tap', () => {
    expect(gestureFrom(TAP_SLOP, TAP_SLOP)).toBe('tap')
  })

  it('reads a run down the page as a scroll', () => {
    expect(gestureFrom(0, far)).toBe('scroll')
    expect(gestureFrom(0, -far)).toBe('scroll')
  })

  it('reads a run along the curve as a scrub', () => {
    expect(gestureFrom(far, 0)).toBe('scrub')
    expect(gestureFrom(-far, 0)).toBe('scrub')
  })

  it('gives a diagonal to the scroll the page is already doing', () => {
    expect(gestureFrom(far, far)).toBe('scroll')
  })

  it('keeps a scrub that drifts off the horizontal', () => {
    expect(gestureFrom(far, TAP_SLOP * 2)).toBe('scrub')
  })
})
