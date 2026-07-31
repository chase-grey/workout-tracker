import { describe, expect, it } from 'vitest'
import { parseTempo } from './tempo'
import { motionForPhases, phaseDepths } from './rhythmMotion'

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
