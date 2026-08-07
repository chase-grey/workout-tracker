import { describe, expect, it } from 'vitest'
import { parseTempo } from './tempo'
import { cycleProgress, hitRepTarget, loopFadeIn, motionForPhases, phaseDepths } from './rhythmMotion'

describe('motionForPhases', () => {
  it('reads a down · hold · up rep as a breath', () => {
    expect(motionForPhases(parseTempo('2s down · 3s hold at bottom · 1s up'))).toBe('breathe')
  })
  it('reads a push-and-hang stretch as a descent', () => {
    expect(motionForPhases(parseTempo('5s pushing down · 5s passive hang'))).toBe('descent')
  })
  it('defaults to breathe for a shapeless tempo', () => {
    expect(motionForPhases(parseTempo(''))).toBe('breathe')
  })
})

describe('phaseDepths', () => {
  it('sinks on down, holds, returns on up', () => {
    expect(phaseDepths(parseTempo('2s down · 3s hold at bottom · 1s up'))).toEqual([1, 1, 0])
  })
  it('stays deep through a passive hang instead of springing back', () => {
    expect(phaseDepths(parseTempo('5s pushing down · 5s passive hang'))).toEqual([1, 1])
  })
})

describe('cycleProgress', () => {
  const pancake = parseTempo('5s pushing down · 5s passive hang')

  it('weights phases by duration rather than counting them equally', () => {
    expect(cycleProgress(pancake, 0, 0)).toBe(0)
    expect(cycleProgress(pancake, 0, 1)).toBe(0.5)
    expect(cycleProgress(pancake, 1, 0)).toBe(0.5)
    expect(cycleProgress(pancake, 1, 1)).toBe(1)
  })

  it('runs continuously across a phase boundary', () => {
    const uneven = parseTempo('2s down · 3s hold at bottom · 1s up')
    expect(cycleProgress(uneven, 0, 1)).toBeCloseTo(cycleProgress(uneven, 1, 0))
    expect(cycleProgress(uneven, 1, 1)).toBeCloseTo(cycleProgress(uneven, 2, 0))
  })

  it('is 0 for a tempo with no duration', () => {
    expect(cycleProgress(parseTempo(''), 0, 0.5)).toBe(0)
  })
})

describe('hitRepTarget', () => {
  it('is not met while the last rep is still running', () => {
    expect(hitRepTarget(5, 5)).toBe(false)
  })

  it('is met once the last rep finishes and the count moves past it', () => {
    expect(hitRepTarget(6, 5)).toBe(true)
    expect(hitRepTarget(9, 5)).toBe(true)
  })

  it('is not met earlier in the set', () => {
    expect(hitRepTarget(1, 5)).toBe(false)
    expect(hitRepTarget(4, 5)).toBe(false)
  })

  it('is never met without a target to hit', () => {
    expect(hitRepTarget(3)).toBe(false)
    expect(hitRepTarget(3, 0)).toBe(false)
  })
})

describe('loopFadeIn', () => {
  const pancake = parseTempo('5s pushing down · 5s passive hang')

  it('starts a rep fully transparent so the jump to the top is hidden', () => {
    expect(loopFadeIn(pancake, 0)).toBe(0)
  })

  it('is fully opaque one second in, and stays there for the rest of the rep', () => {
    expect(loopFadeIn(pancake, 1 / 10)).toBe(1)
    expect(loopFadeIn(pancake, 0.5)).toBe(1)
    expect(loopFadeIn(pancake, 1)).toBe(1)
  })

  it('never spends more than a third of a short rep fading', () => {
    const quick = parseTempo('1s down · 1s hang')
    expect(loopFadeIn(quick, 1 / 3)).toBe(1)
  })
})
