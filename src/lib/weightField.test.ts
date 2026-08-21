import { describe, expect, it } from 'vitest'
import { toWeight } from './weightField'

describe('toWeight', () => {
  it('reads a typed number, whole or fractional', () => {
    expect(toWeight('45')).toBe(45)
    expect(toWeight(' 22.5 ')).toBe(22.5)
    expect(toWeight('0')).toBe(0)
  })

  it('reads a cleared field as no weight rather than as zero', () => {
    expect(toWeight('')).toBeNull()
    expect(toWeight('   ')).toBeNull()
  })

  it('reads a half-typed number as no weight either', () => {
    expect(toWeight('-')).toBeNull()
    expect(toWeight('lbs')).toBeNull()
  })
})
