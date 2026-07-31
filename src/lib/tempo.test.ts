import { describe, expect, it } from 'vitest'
import { parseTempo } from './tempo'

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
