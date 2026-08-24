import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlexBlock } from '../config/flexPlan'

/**
 * These tests run in the node environment, which has no localStorage — so one
 * goes in before the module under test is imported. It has to be installed
 * before the import rather than inside `beforeEach`, since `storage` closes over
 * the global at call time and a missing one is swallowed as "nothing stored".
 */
const backing = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => backing.get(k) ?? null,
  setItem: (k: string, v: string) => void backing.set(k, v),
  removeItem: (k: string) => void backing.delete(k),
  clear: () => backing.clear(),
  key: (i: number) => [...backing.keys()][i] ?? null,
  get length() {
    return backing.size
  },
})

const { storage } = await import('./storage')
const { DEFAULT_FLEX_ROUTINE } = await import('../config/flexPlan')
const { FLEX_ROUTINES } = await import('../config/flexRoutines')

/** A routine that isn't either shipped default, standing in for a coach edit. */
const CUSTOM: FlexBlock[] = [
  {
    label: 'my own block',
    exercises: [
      { key: 'frog', name: 'frog stretch', sets: '5', maxSets: 5, reps: 6, tempo: '', restSec: 30 },
    ],
  },
]

describe('loadFlexPlans', () => {
  beforeEach(() => backing.clear())

  it('ships both defaults on a device that has stored nothing', () => {
    const plans = storage.loadFlexPlans()
    expect(plans.side_split).toEqual(DEFAULT_FLEX_ROUTINE)
    expect(plans.head_to_toe).toEqual(FLEX_ROUTINES.head_to_toe.blocks)
  })

  // The migration that matters: a device that customised its one routine before
  // there were two must not have that work thrown away.
  it('carries a customised single routine over as the side split', () => {
    backing.set('wt.flexplan', JSON.stringify(CUSTOM))
    const plans = storage.loadFlexPlans()
    expect(plans.side_split).toEqual(CUSTOM)
    expect(plans.head_to_toe).toEqual(FLEX_ROUTINES.head_to_toe.blocks)
  })

  it('leaves the old key in place, so a rollback still finds the edit', () => {
    backing.set('wt.flexplan', JSON.stringify(CUSTOM))
    storage.saveFlexPlans(storage.loadFlexPlans())
    expect(JSON.parse(backing.get('wt.flexplan')!)).toEqual(CUSTOM)
  })

  it('prefers the stored map once there is one', () => {
    backing.set('wt.flexplan', JSON.stringify(CUSTOM))
    storage.saveFlexPlans({ side_split: DEFAULT_FLEX_ROUTINE, head_to_toe: CUSTOM })
    const plans = storage.loadFlexPlans()
    expect(plans.side_split).toEqual(DEFAULT_FLEX_ROUTINE)
    expect(plans.head_to_toe).toEqual(CUSTOM)
  })

  // A map stored by a build that knew fewer routines than this one.
  it('fills in a routine the stored map has never heard of', () => {
    backing.set('wt.flexplans', JSON.stringify({ side_split: CUSTOM }))
    const plans = storage.loadFlexPlans()
    expect(plans.side_split).toEqual(CUSTOM)
    expect(plans.head_to_toe).toEqual(FLEX_ROUTINES.head_to_toe.blocks)
  })

  it('falls back to the defaults on unreadable storage', () => {
    backing.set('wt.flexplans', 'not json')
    backing.set('wt.flexplan', 'not json either')
    const plans = storage.loadFlexPlans()
    expect(plans.side_split).toEqual(DEFAULT_FLEX_ROUTINE)
    expect(plans.head_to_toe).toEqual(FLEX_ROUTINES.head_to_toe.blocks)
  })

  it('round-trips a saved map', () => {
    storage.saveFlexPlans({ side_split: CUSTOM, head_to_toe: CUSTOM })
    expect(storage.loadFlexPlans()).toEqual({ side_split: CUSTOM, head_to_toe: CUSTOM })
  })
})

describe('the stretch session snapshot', () => {
  beforeEach(() => backing.clear())

  it('remembers the routine and the core decision across a reload', () => {
    storage.saveStretch({ step: 3, done: ['a'], routine: 'head_to_toe', core: false })
    const saved = storage.loadStretch()!
    expect(saved.routine).toBe('head_to_toe')
    expect(saved.core).toBe(false)
  })

  // A session that predates the two routines carries neither field; the callers
  // read that as a side split with its core intact.
  it('leaves both absent on a session saved before they existed', () => {
    storage.saveStretch({ step: 0, done: [] })
    const saved = storage.loadStretch()!
    expect(saved.routine).toBeUndefined()
    expect(saved.core).toBeUndefined()
  })

  it('clears the snapshot when the session ends', () => {
    storage.saveStretch({ step: 0, done: [], routine: 'head_to_toe' })
    storage.saveStretch(null)
    expect(storage.loadStretch()).toBeNull()
  })
})
