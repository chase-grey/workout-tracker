import { describe, expect, it } from 'vitest'
import { parseTempo, workPhaseCount } from './tempo'

describe('workPhaseCount', () => {
  it('ends after the pull up, preserving the rest between efforts', () => {
    const phases = parseTempo('5s press down; 5s rest; 5s pull up; 5s rest')
    expect(workPhaseCount(phases)).toBe(3)
  })

  it('preserves tempos without a trailing rest and rest-only tempos', () => {
    expect(workPhaseCount(parseTempo('3s down; 3s up'))).toBe(2)
    expect(workPhaseCount(parseTempo('5s rest'))).toBe(1)
    expect(workPhaseCount([])).toBe(0)
  })
})

describe('parseTempo', () => {
  it('parses labelled phases', () => {
    expect(parseTempo('2s down · 3s hold at bottom · 1s up')).toEqual([
      { seconds: 2, label: 'down' },
      { seconds: 3, label: 'hold at bottom' },
      { seconds: 1, label: 'up' },
    ])
  })
  it('parses a two-phase hold', () => {
    expect(parseTempo('5s pushing down · 5s passive hang')).toEqual([
      { seconds: 5, label: 'pushing down' },
      { seconds: 5, label: 'passive hang' },
    ])
  })
  it('returns [] for empty/garbage', () => {
    expect(parseTempo('')).toEqual([])
    expect(parseTempo('just breathe')).toEqual([])
  })
})
