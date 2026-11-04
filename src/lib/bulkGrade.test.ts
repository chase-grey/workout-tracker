import { describe, it, expect } from 'vitest'
import { bulkGrade, paceOf, partitionOf, MIN_GRADE_DAYS } from './bulkGrade'
import type { MassTrend } from './massSplit'

/** A trend over `days` that put on `lbsPerWeek`, `leanShare` of it lean, from 180 lbs. */
const trend = (days: number, lbsPerWeek: number, leanShare: number): MassTrend => ({
  points: [],
  days,
  startWeight: 180,
  weightPerWeek: lbsPerWeek,
  leanPerWeek: lbsPerWeek * leanShare,
  fatPerWeek: lbsPerWeek * (1 - leanShare),
  fatPerWeekSE: 0.1,
  weighIns: 30,
  readings: 10,
})

describe('partitionOf', () => {
  it('bands muscle share at three quarters, two thirds and half', () => {
    expect(partitionOf(0.9).band).toBe('lean')
    expect(partitionOf(0.75).band).toBe('lean')
    expect(partitionOf(0.7).band).toBe('clean')
    expect(partitionOf(0.6).band).toBe('loose')
    expect(partitionOf(0.5).band).toBe('loose')
    expect(partitionOf(0.4).band).toBe('dirty')
  })

  it('slides the marker through each quarter of the track as the share falls', () => {
    expect(partitionOf(1).at).toBe(0)
    expect(partitionOf(0.75).at).toBeCloseTo(0.25)
    expect(partitionOf(0.5).at).toBeCloseTo(0.75)
    expect(partitionOf(0).at).toBe(1)
    expect(partitionOf(-1).at).toBe(1)
  })
})

describe('paceOf', () => {
  it('bands the weekly gain around the intermediate rates', () => {
    expect(paceOf(0.1).band).toBe('slow')
    expect(paceOf(0.3).band).toBe('steady')
    expect(paceOf(0.6).band).toBe('fast')
    expect(paceOf(1).band).toBe('too fast')
  })

  it('slides the marker from standing still to twice the aggressive rate', () => {
    expect(paceOf(0).at).toBe(0)
    expect(paceOf(0.2).at).toBeCloseTo(0.25)
    expect(paceOf(0.8).at).toBeCloseTo(0.75)
    expect(paceOf(5).at).toBe(1)
  })
})

describe('bulkGrade', () => {
  it('has no reading without a trend, or inside the first two weeks', () => {
    expect(bulkGrade(null)).toEqual({ ready: false, days: 0 })
    expect(bulkGrade(trend(9, 0.7, 0.8))).toEqual({ ready: false, days: 9 })
    expect(MIN_GRADE_DAYS).toBe(14)
  })

  it('reads share and pace off the trend slopes', () => {
    const g = bulkGrade(trend(70, 0.7, 5 / 7))
    expect(g.ready).toBe(true)
    if (!g.ready) return
    expect(g.days).toBe(70)
    expect(g.share).toBeCloseTo(5 / 7)
    expect(g.partition).toBe('clean')
    expect(g.lbsPerWeek).toBeCloseTo(0.7)
    expect(g.pctPerWeek).toBeCloseTo(0.39)
    expect(g.pace).toBe('steady')
  })

  it('pins a recomp to the lean end instead of running off the track', () => {
    const g = bulkGrade(trend(60, 0.25, 2))
    if (!g.ready) throw new Error('not ready')
    expect(g.share).toBe(2)
    expect(g.partition).toBe('lean')
    expect(g.partitionAt).toBe(0)
  })

  it('has no share to place when nothing has gone on', () => {
    const still = bulkGrade(trend(60, 0, 0))
    if (!still.ready) throw new Error('not ready')
    expect(still.share).toBeNull()
    expect(still.partition).toBeNull()
    expect(still.pace).toBe('slow')
  })

  it('has no share on a cut either, and never a pace below standing still', () => {
    const cut = bulkGrade(trend(60, -0.5, 0.2))
    if (!cut.ready) throw new Error('not ready')
    expect(cut.share).toBeNull()
    expect(cut.pace).toBe('slow')
    expect(cut.paceAt).toBe(0)
  })
})
