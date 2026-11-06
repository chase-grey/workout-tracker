import { describe, it, expect } from 'vitest'
import type { MassTrend, MassTrendPoint } from './massSplit'
import {
  ASSUMED_AGE_YEARS,
  fmtLbsError,
  fmtPctError,
  LB_PER_KG,
  leeSkeletalMuscleKg,
  SKELETAL_MUSCLE_SEE_KG,
  wholeBody,
} from './wholeBody'

const round1 = (n: number): number => Math.round(n * 10) / 10

const point = (over: Partial<MassTrendPoint>): MassTrendPoint => ({
  date: '2026-01-05',
  weighIns: 5,
  weight: 180,
  bodyFat: 15,
  muscleGain: 0,
  fatGain: 0,
  weightError: 0,
  muscleError: 0,
  fatError: 0,
  ...over,
})

const trend = (points: MassTrendPoint[]): MassTrend => ({
  points,
  days: 7 * (points.length - 1),
  startWeight: points[0].weight,
  weightPerWeek: 0,
  leanPerWeek: 0,
  fatPerWeek: 0,
  fatPerWeekSE: 0,
  weighIns: 10,
  readings: 4,
})

describe('leeSkeletalMuscleKg', () => {
  it('puts a 180 lb, 5 ft 10 man of thirty at a little over 34 kg of muscle', () => {
    const kg = leeSkeletalMuscleKg(180 / LB_PER_KG, 70 * 0.0254, 30)
    expect(kg).toBeCloseTo(34.15, 1)
  })

  it('gives a woman of the same build 6.6 kg less, and each decade a kilogram', () => {
    const man = leeSkeletalMuscleKg(80, 1.78, 30)
    expect(leeSkeletalMuscleKg(80, 1.78, 30, false)).toBeCloseTo(man - 6.6, 6)
    expect(leeSkeletalMuscleKg(80, 1.78, 40)).toBeCloseTo(man - 0.98, 6)
  })
})

describe('wholeBody', () => {
  const start = point({})
  const later = point({
    date: '2026-03-02',
    weight: 186,
    bodyFat: 15.5,
    muscleGain: 4.2,
    fatGain: 1.8,
    muscleError: 1.1,
    fatError: 0.4,
    weightError: 0.8,
  })

  it('needs a trend and a height', () => {
    expect(wholeBody(null, 70)).toBeNull()
    expect(wholeBody(trend([start]), 0)).toBeNull()
  })

  it('splits the start week into fat off the scale, muscle off the equation, and the rest', () => {
    const body = wholeBody(trend([start]), 70)!
    const [p] = body.points
    expect(p.fat).toBe(27)
    expect(body.startMuscle).toBeCloseTo(34.15 * LB_PER_KG, 0)
    expect(p.muscle).toBe(body.startMuscle)
    expect(p.rest).toBe(body.rest)
    expect(p.muscle + p.fat + p.rest).toBeCloseTo(180, 0)
    expect(p.musclePct + p.fatPct + p.restPct).toBeGreaterThanOrEqual(99)
    expect(p.musclePct + p.fatPct + p.restPct).toBeLessThanOrEqual(101)
    expect(body.startMuscleShareOfLean).toBeGreaterThan(45)
    expect(body.startMuscleShareOfLean).toBeLessThan(55)
  })

  it('holds the rest fixed and gives every later pound of fat-free mass to muscle', () => {
    const body = wholeBody(trend([start, later]), 70)!
    const [a, b] = body.points
    expect(b.rest).toBe(a.rest)
    expect(b.fat).toBe(round1(186 * 0.155))
    expect(b.muscle - a.muscle).toBeCloseTo(186 * 0.845 - 180 * 0.85, 0)
    expect(b.muscle + b.fat + b.rest).toBeCloseTo(186, 0)
  })

  it('carries the equation error on the seam from the first week, and the split error on top of it later', () => {
    const body = wholeBody(trend([start, later]), 70)!
    const see = SKELETAL_MUSCLE_SEE_KG * LB_PER_KG
    expect(body.points[0].muscleError).toBe(round1(see))
    expect(body.points[1].muscleError).toBe(round1(Math.hypot(see, 1.1)))
    expect(body.points[1].weightError).toBe(0.8)
  })

  it('gives the rest the equation error alone, every week, and the fat the split error alone', () => {
    const body = wholeBody(trend([start, later]), 70)!
    const see = round1(SKELETAL_MUSCLE_SEE_KG * LB_PER_KG)
    expect(body.points.map((p) => p.restError)).toEqual([see, see])
    expect(body.points.map((p) => p.fatError)).toEqual([0, 0.4])
  })

  it("reads each give-or-take as points of that week's weight", () => {
    const body = wholeBody(trend([start, later]), 70)!
    const [a, b] = body.points
    const see = SKELETAL_MUSCLE_SEE_KG * LB_PER_KG
    expect(a.restPctError).toBe(round1((100 * see) / 180))
    expect(a.musclePctError).toBe(a.restPctError)
    expect(a.fatPctError).toBe(0)
    expect(b.musclePctError).toBe(round1((100 * Math.hypot(see, 1.1)) / 186))
    expect(b.fatPctError).toBe(round1((100 * 0.4) / 186))
  })

  it('reads the equation at the assumed age unless told another', () => {
    const young = wholeBody(trend([start]), 70, ASSUMED_AGE_YEARS - 10)!
    const old = wholeBody(trend([start]), 70, ASSUMED_AGE_YEARS + 10)!
    expect(young.startMuscle - old.startMuscle).toBeCloseTo(0.098 * 20 * LB_PER_KG, 0)
  })

  it('refuses a body the equation cannot fit inside', () => {
    expect(wholeBody(trend([point({ weight: 60, bodyFat: 50 })]), 78)).toBeNull()
  })
})

describe('fmtPctError / fmtLbsError', () => {
  it('writes the give-or-take in points before the percent sign, and drops it when there is none', () => {
    expect(fmtPctError(38, 3.4)).toBe('38 ± 3.4%')
    expect(fmtPctError(15, 0)).toBe('15%')
  })

  it('writes pounds the same way', () => {
    expect(fmtLbsError(186, 0.8)).toBe('186 ± 0.8 lbs')
    expect(fmtLbsError(180, 0)).toBe('180 lbs')
  })
})
