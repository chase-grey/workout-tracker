import { describe, expect, it } from 'vitest'
import { enterKeyRole } from './useEnterNext'

describe('enterKeyRole', () => {
  it('moves on from every field but the last', () => {
    expect(enterKeyRole(0, 2, true)).toBe('next')
    expect(enterKeyRole(0, 2, false)).toBe('next')
    expect(enterKeyRole(2, 8, true)).toBe('next')
  })

  it('acts from the last field of a form that has something to set off', () => {
    expect(enterKeyRole(1, 2, true)).toBe('go')
    // A card with one field: the hold's seconds, a reps-only set.
    expect(enterKeyRole(0, 1, true)).toBe('go')
  })

  it('only closes the keyboard from the last field of any other form', () => {
    expect(enterKeyRole(1, 2, false)).toBe('done')
    expect(enterKeyRole(0, 1, false)).toBe('done')
  })
})
