import { describe, it, expect } from 'vitest'
import { nextUnfinishedStep, remainingFlow } from './setFlow'

describe('nextUnfinishedStep', () => {
  it('moves one along when the workout is being done in order', () => {
    expect(nextUnfinishedStep([true, false, false], 0)).toBe(1)
  })

  it('skips sets already logged', () => {
    // Jumped ahead earlier and did steps 1 and 2; from 0, next is 3.
    expect(nextUnfinishedStep([false, true, true, false], 0)).toBe(3)
  })

  it('stays ahead rather than going back for a skipped set', () => {
    expect(nextUnfinishedStep([false, false, true, false], 2)).toBe(3)
  })

  it('comes back for skipped sets once nothing is left ahead', () => {
    expect(nextUnfinishedStep([false, true, true], 2)).toBe(0)
  })

  it('never returns the step on screen', () => {
    expect(nextUnfinishedStep([false, true, true], 0)).toBeNull()
  })

  it('is null when everything else is logged', () => {
    expect(nextUnfinishedStep([true, true, true], 1)).toBeNull()
  })

  it('is null for a one-step workout', () => {
    expect(nextUnfinishedStep([false], 0)).toBeNull()
  })
})

describe('remainingFlow', () => {
  it('walks a fresh workout in order', () => {
    expect(remainingFlow([false, false, false], 0)).toEqual([0, 1, 2])
  })

  it('starts with the step on screen even when it is already logged', () => {
    expect(remainingFlow([true, false], 0)).toEqual([0, 1])
  })

  it('leaves out sets already logged', () => {
    expect(remainingFlow([false, true, false, true], 0)).toEqual([0, 2])
  })

  it('ends with what was skipped, in plan order', () => {
    // Started at step 2, so steps 0 and 1 come back around at the end.
    expect(remainingFlow([false, false, false, false], 2)).toEqual([2, 3, 0, 1])
  })

  it('is just the current step when nothing else is left', () => {
    expect(remainingFlow([true, true, false], 2)).toEqual([2])
  })

  it('is empty for an out-of-range step', () => {
    expect(remainingFlow([false, false], 5)).toEqual([])
    expect(remainingFlow([], 0)).toEqual([])
  })
})
