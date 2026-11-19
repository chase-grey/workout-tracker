import { describe, expect, it } from 'vitest'
import { expectedProgress, projectedSoFar } from './sessionPace'

describe('projectedSoFar', () => {
  // Four sets at 40s of work and 120s of rest, the last resting into nothing.
  const whole = { activeSec: 160, restSec: 360 }

  it('is nothing before the first set', () => {
    expect(projectedSoFar(whole, whole)).toEqual({ activeSec: 0, restSec: 0, totalSec: 0 })
  })

  it('is the sets done and the rests taken, by where you are', () => {
    // Two sets and their rests behind you, standing at the third.
    expect(projectedSoFar(whole, { activeSec: 80, restSec: 120 })).toEqual({
      activeSec: 80,
      restSec: 240,
      totalSec: 320,
    })
  })

  it('moves through the rest on the clock', () => {
    // One set done, a minute into its two-minute rest.
    expect(projectedSoFar(whole, { activeSec: 120, restSec: 60 + 240 })).toEqual({
      activeSec: 40,
      restSec: 60,
      totalSec: 100,
    })
  })

  it('is the whole projection once nothing is left', () => {
    expect(projectedSoFar(whole, { activeSec: 0, restSec: 0 }).totalSec).toBe(520)
  })

  it('never goes negative when what is left outgrows the whole', () => {
    expect(projectedSoFar(whole, { activeSec: 170, restSec: 400 })).toEqual({ activeSec: 0, restSec: 0, totalSec: 0 })
  })
})

describe('expectedProgress', () => {
  // Four sets at 40s of work and 120s of rest.
  const flow = Array.from({ length: 4 }, () => ({ activeSec: 40, restSec: 120 }))

  it('expects nothing done until the first set has had its time', () => {
    expect(expectedProgress(flow, 0)).toBe(0)
    expect(expectedProgress(flow, 39)).toBe(0)
  })

  it('counts a set once its active time has gone by, and holds through its rest', () => {
    expect(expectedProgress(flow, 40)).toBe(0.25)
    expect(expectedProgress(flow, 159)).toBe(0.25)
    // 160s of set-and-rest, then the second set's 40.
    expect(expectedProgress(flow, 199)).toBe(0.25)
    expect(expectedProgress(flow, 200)).toBe(0.5)
  })

  it('is the whole bar once the last set is due, however late it gets', () => {
    expect(expectedProgress(flow, 3 * 160 + 40)).toBe(1)
    expect(expectedProgress(flow, 100000)).toBe(1)
  })

  it('agrees with projectedSoFar: the time it puts a position at earns that position', () => {
    // Standing at the third set, two sets and two rests behind: 320s projected.
    const soFar = projectedSoFar({ activeSec: 160, restSec: 480 }, { activeSec: 80, restSec: 240 })
    expect(soFar.totalSec).toBe(320)
    expect(expectedProgress(flow, soFar.totalSec)).toBe(0.5)
  })

  it('weighs a set by what it fills of the bar', () => {
    // A set, then a round of four stations logged as one unit.
    const station = { activeSec: 30, restSec: 0, units: 0.25 }
    const mixed = [{ activeSec: 40, restSec: 60 }, station, station, station, station]
    expect(expectedProgress(mixed, 40)).toBe(0.5)
    expect(expectedProgress(mixed, 100 + 60)).toBe(0.75)
    expect(expectedProgress(mixed, 100 + 120)).toBe(1)
  })

  it('has nothing to say about an empty or unpriced flow', () => {
    expect(expectedProgress([], 60)).toBeNull()
    expect(expectedProgress([{ activeSec: 0, restSec: 0 }], 60)).toBeNull()
  })
})
