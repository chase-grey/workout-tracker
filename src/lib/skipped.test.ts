import { describe, it, expect } from 'vitest'
import { allInPlayDone, canSkip, landingStep, resumeSkipped, setsInPlay, toSkippedRecord, withSkipped } from './skipped'

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

describe('setsInPlay', () => {
  it('leaves out the skipped sets and keeps their order', () => {
    const sets = [{ n: 1 }, { n: 2, skipped: true }, { n: 3, skipped: false }]
    expect(setsInPlay(sets).map((s) => s.n)).toEqual([1, 3])
  })
})

describe('allInPlayDone', () => {
  it('is complete once every set not skipped is logged', () => {
    expect(allInPlayDone([
      { done: true, reps: 8 },
      { skipped: true, reps: 8 },
    ])).toBe(true)
  })

  it('waits on a set still owed', () => {
    expect(allInPlayDone([{ done: true, reps: 8 }, { reps: 8 }])).toBe(false)
  })

  it('does not call an exercise skipped set by set complete', () => {
    expect(allInPlayDone([{ skipped: true, reps: 8 }, { skipped: true, reps: 8 }])).toBe(false)
  })

  it('does not count a set marked done with no reps', () => {
    expect(allInPlayDone([{ done: true, reps: 0 }])).toBe(false)
  })
})

describe('landingStep', () => {
  const order = ['a:0', 'a:1', 'a:2', 'b:0', 'b:1']
  const none = () => false

  it('stays on the set on screen when another set is skipped', () => {
    expect(landingStep(order, (k) => k !== 'b:0', none, 'a:1')).toBe('a:1')
  })

  it('moves on to the next set still owed when the one on screen is skipped', () => {
    const done = (k: string) => k === 'a:2'
    expect(landingStep(order, (k) => k !== 'a:1', done, 'a:1')).toBe('b:0')
  })

  it('comes back around for a set left behind when nothing is owed ahead', () => {
    const done = (k: string) => k !== 'a:0'
    expect(landingStep(order, (k) => k !== 'b:1', done, 'b:1')).toBe('a:0')
  })

  it('settles on anything still in play when nothing is owed', () => {
    const done = () => true
    expect(landingStep(order, (k) => k !== 'a:2', done, 'a:2')).toBe('a:0')
  })

  it('has nowhere to land when the flow is empty', () => {
    expect(landingStep(order, () => false, none, 'a:0')).toBeNull()
  })
})
