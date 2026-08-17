import { describe, it, expect } from 'vitest'
import { canSkip, resumeSkipped, toSkippedRecord, withSkipped } from './skipped'

describe('resumeSkipped', () => {
  it('reads back what was saved for this session', () => {
    expect([...resumeSkipped({ sessionId: 's1', keys: ['legpress'] }, 's1')]).toEqual(['legpress'])
  })

  it('drops skips made in another session', () => {
    expect(resumeSkipped({ sessionId: 's1', keys: ['legpress'] }, 's2').size).toBe(0)
  })

  it('degrades anything unusable to no skips', () => {
    expect(resumeSkipped(null, 's1').size).toBe(0)
    expect(resumeSkipped({ sessionId: 's1', keys: 'legpress' as unknown as string[] }, 's1').size).toBe(0)
    expect(resumeSkipped({ sessionId: 's1', keys: ['', null as unknown as string] }, 's1').size).toBe(0)
  })

  it('round-trips through the storable form', () => {
    const keys = new Set(['legpress', 'calfraise'])
    expect(resumeSkipped(toSkippedRecord('s1', keys), 's1')).toEqual(keys)
  })
})

describe('canSkip', () => {
  const all = ['bench', 'fly', 'pushdown']

  it('allows skipping while something else is still in play', () => {
    expect(canSkip(new Set(), all, 'bench')).toBe(true)
    expect(canSkip(new Set(['fly']), all, 'bench')).toBe(true)
  })

  it('refuses the last exercise left', () => {
    expect(canSkip(new Set(['fly', 'pushdown']), all, 'bench')).toBe(false)
  })

  it('is unbothered by an already-skipped exercise', () => {
    // Skipping it again changes nothing, and there's still work left either way.
    expect(canSkip(new Set(['bench']), all, 'bench')).toBe(true)
  })
})

describe('withSkipped', () => {
  it('adds and removes without mutating the input', () => {
    const before = new Set(['bench'])
    expect([...withSkipped(before, 'fly', true)]).toEqual(['bench', 'fly'])
    expect([...withSkipped(before, 'bench', false)]).toEqual([])
    expect([...before]).toEqual(['bench'])
  })
})
