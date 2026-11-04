import { describe, it, expect } from 'vitest'
import { bulkGrade, paceOf, partitionOf, verdictOf, MIN_GRADE_DAYS } from './bulkGrade'
import type { MassPoint } from './massSplit'

const point = (date: string, weight: number, muscleGain: number, fatGain: number): MassPoint => ({
  date,
  weight,
  bodyFat: 15,
  lean: weight * 0.85,
  fat: weight * 0.15,
  muscleGain,
  fatGain,
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

describe('verdictOf', () => {
  it('calls it dirty on either a fat-heavy split or a reckless pace', () => {
    expect(verdictOf('dirty', 'steady', 5, 2)).toBe('dirty bulk')
    expect(verdictOf('lean', 'too fast', 5, 4)).toBe('dirty bulk')
  })

  it('warns when either reading is drifting', () => {
    expect(verdictOf('loose', 'steady', 5, 3)).toBe('leaning dirty')
    expect(verdictOf('clean', 'fast', 5, 3.5)).toBe('leaning dirty')
  })

  it('is a clean bulk when both are in band', () => {
    expect(verdictOf('clean', 'steady', 5, 3.5)).toBe('clean bulk')
    expect(verdictOf('lean', 'slow', 2, 1.8)).toBe('clean bulk')
  })

  it('names a recomp, and says when nothing has gone on', () => {
    expect(verdictOf(null, 'slow', 0, 2)).toBe('recomp')
    expect(verdictOf(null, 'slow', -1, 0)).toBe('not gaining')
  })
})

describe('bulkGrade', () => {
  it('has no verdict inside the first two weeks', () => {
    const g = bulkGrade([point('2026-01-01', 180, 0, 0), point('2026-01-10', 181, 0.8, 0.2)])
    expect(g).toEqual({ ready: false, days: 9 })
    expect(MIN_GRADE_DAYS).toBe(14)
  })

  it('reads share and pace over the whole span', () => {
    const g = bulkGrade([point('2026-01-01', 180, 0, 0), point('2026-03-12', 187, 5, 2)])
    expect(g.ready).toBe(true)
    if (!g.ready) return
    expect(g.days).toBe(70)
    expect(g.share).toBeCloseTo(5 / 7)
    expect(g.partition).toBe('clean')
    expect(g.lbsPerWeek).toBeCloseTo(0.7)
    expect(g.pctPerWeek).toBeCloseTo(0.39)
    expect(g.pace).toBe('steady')
    expect(g.verdict).toBe('clean bulk')
  })

  it('pins a recomp to the lean end instead of running off the track', () => {
    const g = bulkGrade([point('2026-01-01', 180, 0, 0), point('2026-03-01', 182, 4, -2)])
    if (!g.ready) throw new Error('not ready')
    expect(g.share).toBe(2)
    expect(g.partition).toBe('lean')
    expect(g.partitionAt).toBe(0)
    expect(g.verdict).toBe('clean bulk')
  })

  it('calls a stall with the fat down a recomp and one with nothing moving not gaining', () => {
    const recomp = bulkGrade([point('2026-01-01', 180, 0, 0), point('2026-03-01', 180, 2, -2)])
    const still = bulkGrade([point('2026-01-01', 180, 0, 0), point('2026-03-01', 180, 0.1, -0.1)])
    expect(recomp.ready && recomp.verdict).toBe('recomp')
    expect(still.ready && still.verdict).toBe('not gaining')
  })
})
