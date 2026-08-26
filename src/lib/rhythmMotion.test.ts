import { describe, expect, it } from 'vitest'
import { parseTempo } from './tempo'
import {
  cycleCloses,
  cycleProgress,
  hitRepTarget,
  loopFadeIn,
  repGlow,
  motionForPhases,
  phaseDepths,
  phaseEfforts,
  strain,
  REST_DEPTH_KEPT,
} from './rhythmMotion'

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
  it('gives back some depth on a passive hang without leaving the stretch', () => {
    expect(phaseDepths(parseTempo('5s pushing down · 5s passive hang'))).toEqual([1, REST_DEPTH_KEPT])
  })
  it('keeps an isometric hold exactly where it is', () => {
    expect(phaseDepths(parseTempo('5s pushing down · 5s hang'))).toEqual([1, 1])
  })
  it('has nothing to give back when a rest phase starts from neutral', () => {
    expect(phaseDepths(parseTempo('2s relax · 2s down'))).toEqual([0, 1])
  })
})

describe('phaseEfforts', () => {
  it('reads a push as work and a passive hang as rest', () => {
    expect(phaseEfforts(parseTempo('5s pushing down · 5s passive hang'))).toEqual([1, 0])
  })
  it('counts an isometric hold as work, since you are still holding tension', () => {
    expect(phaseEfforts(parseTempo('2s down · 3s hold at bottom · 1s up'))).toEqual([1, 1, 1])
  })
})

describe('cycleCloses', () => {
  it('closes for a push · rest rep, which needs no reset at the loop point', () => {
    expect(cycleCloses(parseTempo('5s pushing down · 5s passive hang'))).toBe(true)
  })
  it('does not close when the depth never moves', () => {
    expect(cycleCloses(parseTempo('5s pushing down · 5s hang'))).toBe(false)
  })
  it('does not close for a tempo with no phases', () => {
    expect(cycleCloses(parseTempo(''))).toBe(false)
  })
})

describe('strain', () => {
  it('is still at both ends of a phase, so it never jumps at a boundary', () => {
    expect(strain(1, 0)).toBeCloseTo(0)
    expect(strain(1, 1)).toBeCloseTo(0)
  })
  it('shakes under load and goes quiet as the effort drops off', () => {
    const working = Math.abs(strain(1, 0.05))
    const resting = Math.abs(strain(0.1, 0.05))
    expect(working).toBeGreaterThan(0)
    expect(resting).toBeLessThan(working)
    expect(strain(0, 0.05)).toBe(0)
  })
  it('stays within a single unit of amplitude', () => {
    for (let p = 0; p <= 1; p += 0.01) expect(Math.abs(strain(1, p))).toBeLessThanOrEqual(1)
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

describe('repGlow', () => {
  it('lights the closing rep for a set that ends itself, since nothing follows it', () => {
    expect(repGlow(5, 5, true)).toBe('done')
  })

  it('leaves the closing rep alone when you end the set by tapping', () => {
    expect(repGlow(5, 5, false)).toBe('base')
  })

  it('keeps the earlier reps at their resting brightness either way', () => {
    expect(repGlow(4, 5, true)).toBe('base')
    expect(repGlow(1, 5, true)).toBe('base')
  })

  it('goes full bright once the target is met, and stays there past it', () => {
    expect(repGlow(6, 5, true)).toBe('done')
    expect(repGlow(6, 5, false)).toBe('done')
    expect(repGlow(9, 5, true)).toBe('done')
  })

  it('never lifts a rep with no target to close on', () => {
    expect(repGlow(3, undefined, true)).toBe('base')
    expect(repGlow(3, 0, true)).toBe('base')
  })
})

describe('loopFadeIn', () => {
  // The frozen-curve case — the only one that still resets at the loop point.
  const frozen = parseTempo('5s pushing down · 5s hang')

  it('starts a rep fully transparent so the jump to the top is hidden', () => {
    expect(loopFadeIn(frozen, 0)).toBe(0)
  })

  it('is fully opaque one second in, and stays there for the rest of the rep', () => {
    expect(loopFadeIn(frozen, 1 / 10)).toBe(1)
    expect(loopFadeIn(frozen, 0.5)).toBe(1)
    expect(loopFadeIn(frozen, 1)).toBe(1)
  })

  it('never spends more than a third of a short rep fading', () => {
    const quick = parseTempo('1s down · 1s hang')
    expect(loopFadeIn(quick, 1 / 3)).toBe(1)
  })
})
