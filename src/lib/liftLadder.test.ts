import { describe, it, expect } from 'vitest'
import { BENCH_KEY, LEG_PRESS_KEY, PULLUP_KEY } from './goals'
import { isLiftLadder, LIFT_LADDERS } from './liftLadder'

describe('which lifts read as a ladder', () => {
  it('takes the lifts whose goals share one series', () => {
    expect(isLiftLadder(LEG_PRESS_KEY)).toBe(true)
    expect(isLiftLadder(PULLUP_KEY)).toBe(true)
    // Bench joined them when it got a second rung: bodyweight, then 200.
    expect(isLiftLadder(BENCH_KEY)).toBe(true)
  })

  it('says no to a goal no lift feeds', () => {
    expect(isLiftLadder(null)).toBe(false)
    expect(isLiftLadder(undefined)).toBe(false)
  })
})

describe('how a ladder reads its numbers', () => {
  it('calls a squat reading the estimate it is', () => {
    const squat = LIFT_LADDERS[LEG_PRESS_KEY]
    expect(squat.headline(244.6)).toBe('245 lbs est. 1rm')
    expect(squat.goalLabel(173.6)).toBe('goal 173.6')
  })

  it('calls a bench reading the estimate it is, like the squat', () => {
    const bench = LIFT_LADDERS[BENCH_KEY]
    expect(bench.headline(191.4)).toBe('191 lbs est. 1rm')
    expect(bench.goalLabel(200)).toBe('goal 200')
  })

  it('spells a pull-up rung out as the four sets it takes', () => {
    const pullups = LIFT_LADDERS[PULLUP_KEY]
    expect(pullups.headline(8)).toBe('4×8')
    expect(pullups.goalLabel(10)).toBe('goal 4×10')
  })
})
