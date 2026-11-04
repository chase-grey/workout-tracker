import { describe, it, expect } from 'vitest'
import { bulkGrade, paceOf, partitionOf, MIN_GRADE_DAYS } from './bulkGrade'
import type { MassPoint } from './massSplit'

const point = (date: string, weight: number, muscleGain: number, fatGain: number): MassPoint => ({
  date,
  weighIns: 7,
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

describe('bulkGrade', () => {
  it('has no reading inside the first two weeks', () => {
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
  })

  it('pins a recomp to the lean end instead of running off the track', () => {
    const g = bulkGrade([point('2026-01-01', 180, 0, 0), point('2026-03-01', 182, 4, -2)])
    if (!g.ready) throw new Error('not ready')
    expect(g.share).toBe(2)
    expect(g.partition).toBe('lean')
    expect(g.partitionAt).toBe(0)
  })

  it('has no share to place when nothing has gone on', () => {
    const still = bulkGrade([point('2026-01-01', 180, 0, 0), point('2026-03-01', 180, 0, 0)])
    if (!still.ready) throw new Error('not ready')
    expect(still.share).toBeNull()
    expect(still.partition).toBeNull()
    expect(still.pace).toBe('slow')
  })
})
