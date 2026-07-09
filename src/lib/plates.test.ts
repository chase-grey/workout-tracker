import { describe, it, expect } from 'vitest'
import { computePlates } from './plates'

describe('computePlates', () => {
  it('135 lbs with 45 bar -> one 45 per side', () => {
    const r = computePlates(135)
    expect(r.perSide).toEqual([{ plate: 45, count: 1 }])
    expect(r.achievable).toBe(135)
    expect(r.leftover).toBe(0)
  })

  it('225 lbs -> two 45s per side', () => {
    const r = computePlates(225)
    expect(r.perSide).toEqual([{ plate: 45, count: 2 }])
    expect(r.achievable).toBe(225)
    expect(r.leftover).toBe(0)
  })

  it('100 lbs -> 25 + 2.5 per side', () => {
    const r = computePlates(100)
    expect(r.perSide).toEqual([
      { plate: 25, count: 1 },
      { plate: 2.5, count: 1 },
    ])
    expect(r.achievable).toBe(100)
    expect(r.leftover).toBe(0)
  })

  it('137 lbs -> one 45 per side with leftover', () => {
    const r = computePlates(137)
    expect(r.perSide).toEqual([{ plate: 45, count: 1 }])
    expect(r.achievable).toBe(135)
    expect(r.leftover).toBe(2)
  })

  it('45 lbs (bar only) -> no plates', () => {
    const r = computePlates(45)
    expect(r.perSide).toEqual([])
    expect(r.achievable).toBe(45)
    expect(r.leftover).toBe(0)
  })

  it('target below bar -> bar achievable, no leftover', () => {
    const r = computePlates(30)
    expect(r.perSide).toEqual([])
    expect(r.achievable).toBe(45)
    expect(r.leftover).toBe(0)
  })

  it('invalid / non-finite target -> all zero', () => {
    expect(computePlates(NaN)).toEqual({ perSide: [], achievable: 0, leftover: 0 })
    expect(computePlates(0)).toEqual({ perSide: [], achievable: 0, leftover: 0 })
    expect(computePlates(-50)).toEqual({ perSide: [], achievable: 0, leftover: 0 })
  })

  it('respects custom bar weight', () => {
    const r = computePlates(95, { barLbs: 35 })
    expect(r.perSide).toEqual([{ plate: 25, count: 1 }, { plate: 5, count: 1 }])
    expect(r.achievable).toBe(95)
    expect(r.leftover).toBe(0)
  })
})
