import { describe, expect, it } from 'vitest'
import { projectedSoFar } from './sessionPace'

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
