import { describe, expect, it } from 'vitest'
import { gestureFrom, READOUT_REACH, TAP_SLOP, withinReach } from './chartReadout'

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
