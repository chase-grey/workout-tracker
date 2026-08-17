import { describe, it, expect } from 'vitest'
import { repairFlexAngles, repairOffVertical, repairSplit } from './angleRepair'
import type { FlexEntry } from './flex'

const entry = (e: Partial<FlexEntry> & { date: string }): FlexEntry => ({
  splitDeg: null,
  tailorsLeftDeg: null,
  tailorsRightDeg: null,
  ...e,
})

describe('repairSplit', () => {
  it('recovers the angle the lines in the reported photo actually made', () => {
    // The photo that turned this up: lines measured 96.0° apart in pixels, logged
    // as 111.6°, and a protractor app reading the same lines said 95.4°.
    expect(repairSplit(111.6)).toBeCloseTo(95.6, 1)
  })

  it('leaves the ends of the range alone', () => {
    // Legs together and a flat 180° split are the two readings the stretch can't
    // distort: both lie along an axis, so neither gains from the x scale.
    expect(repairSplit(0)).toBe(0)
    expect(repairSplit(180)).toBe(180)
  })

  it('only ever brings a reading down', () => {
    for (const deg of [20, 45, 90, 120, 150, 170]) {
      expect(repairSplit(deg)).toBeLessThan(deg)
    }
  })
})

describe('repairOffVertical', () => {
  it('narrows a knee line toward the vertical', () => {
    // A line reported 45° off vertical had equal normalized x and y, so its real
    // x was 3/4 of its y: atan(0.75) = 36.9°.
    expect(repairOffVertical(45)).toBeCloseTo(36.9, 1)
  })

  it('keeps a line that is already vertical or horizontal', () => {
    expect(repairOffVertical(0)).toBe(0)
    expect(repairOffVertical(90)).toBe(90)
  })

  it('handles a line below the vertex', () => {
    expect(repairOffVertical(135)).toBeCloseTo(180 - 36.9, 1)
  })
})

describe('repairFlexAngles', () => {
  it('corrects every angle field inside the window', () => {
    const { entries, repaired } = repairFlexAngles([
      entry({
        date: '2026-08-05',
        coldSplitDeg: 104,
        warmSplitDeg: 111.6,
        tailorsWarmLeftDeg: 45,
        tailorsWarmRightDeg: 45,
      }),
    ])
    expect(entries[0].warmSplitDeg).toBeCloseTo(95.6, 1)
    expect(entries[0].coldSplitDeg).toBeCloseTo(repairSplit(104), 1)
    expect(entries[0].tailorsWarmLeftDeg).toBeCloseTo(36.9, 1)
    expect(entries[0].tailorsWarmRightDeg).toBeCloseTo(36.9, 1)
    expect(repaired).toEqual([entries[0]])
  })

  it('leaves entries on either side of the window untouched', () => {
    const before = entry({ date: '2026-07-20', splitDeg: 120 })
    const after = entry({ date: '2026-08-06', splitDeg: 120 })
    const { entries, repaired } = repairFlexAngles([before, after])
    // Same objects back, not just equal ones: nothing to re-send for these.
    expect(entries[0]).toBe(before)
    expect(entries[1]).toBe(after)
    expect(repaired).toEqual([])
  })

  it('reports nothing for an in-window entry with no angles', () => {
    const marker = entry({ date: '2026-07-25' })
    const { entries, repaired } = repairFlexAngles([marker])
    expect(entries[0]).toBe(marker)
    expect(repaired).toEqual([])
  })

  it('keeps the fields it does not measure', () => {
    const { entries } = repairFlexAngles([
      entry({ date: '2026-07-25', splitDeg: 120, note: 'hips tight' }),
    ])
    expect(entries[0].date).toBe('2026-07-25')
    expect(entries[0].note).toBe('hips tight')
  })

  it('is not worth running twice', () => {
    const once = repairFlexAngles([entry({ date: '2026-08-05', warmSplitDeg: 111.6 })])
    const twice = repairFlexAngles(once.entries)
    expect(twice.entries[0].warmSplitDeg).toBeLessThan(once.entries[0].warmSplitDeg!)
  })
})
