import { describe, it, expect } from 'vitest'
import { buildSetOrder } from '../lib/circuit'
import { DEFAULT_PLAN, sideOrderedExercises, variantExercises, type PlannedExercise } from './plan'

/** A minimal exercise; only key and side matter to the ordering. */
function ex(key: string, over: Partial<PlannedExercise> = {}): PlannedExercise {
  return { key, name: key, sets: 3, repMin: 8, repMax: 12, restSec: 60, group: 'g', ...over }
}

/** The push day as a session led by `side` would perform it. */
function pushKeys(side: 'left' | 'right'): string[] {
  return sideOrderedExercises(variantExercises(DEFAULT_PLAN.push, 'A'), side).map((e) => e.key)
}

describe('sideOrderedExercises', () => {
  it('returns the list untouched when no side is pinned', () => {
    const list = DEFAULT_PLAN.push.exercises
    expect(sideOrderedExercises(list, null)).toBe(list)
    expect(sideOrderedExercises(list, undefined)).toBe(list)
  })

  it('leaves a day with no sided exercises alone', () => {
    const keys = sideOrderedExercises(DEFAULT_PLAN.pull.exercises, 'right').map((e) => e.key)
    expect(keys).toEqual(DEFAULT_PLAN.pull.exercises.map((e) => e.key))
  })

  it('leads with the left raise on a left session', () => {
    const keys = pushKeys('left')
    expect(keys.indexOf('lateral_raise_l')).toBe(keys.indexOf('lateral_raise_r') - 1)
  })

  it('leads with the right raise on a right session', () => {
    const keys = pushKeys('right')
    expect(keys.indexOf('lateral_raise_r')).toBe(keys.indexOf('lateral_raise_l') - 1)
  })

  it('moves nothing but the pair', () => {
    const left = pushKeys('left')
    const right = pushKeys('right')
    const others = (keys: string[]) => keys.filter((k) => !k.startsWith('lateral_raise'))
    expect(others(right)).toEqual(others(left))
    expect([...right].sort()).toEqual([...left].sort())
  })

  it('keeps the raise between the two tricep movements either way', () => {
    for (const side of ['left', 'right'] as const) {
      const keys = pushKeys(side)
      expect(keys.indexOf('lateral_raise_l')).toBeGreaterThan(keys.indexOf('tricep_pushdown'))
      expect(keys.indexOf('lateral_raise_r')).toBeGreaterThan(keys.indexOf('tricep_pushdown'))
      expect(keys.indexOf('lateral_raise_l')).toBeLessThan(keys.indexOf('overhead_tricep_ext'))
      expect(keys.indexOf('lateral_raise_r')).toBeLessThan(keys.indexOf('overhead_tricep_ext'))
    }
  })

  it('rotates both arms inside one round of the arm circuit', () => {
    // The point of the pair being two adjacent stations: each round is pushdown,
    // both arms, extension — not three rounds of one arm and then three of the
    // other, which is what one station of six sets would give.
    const exercises = sideOrderedExercises(variantExercises(DEFAULT_PLAN.push, 'A'), 'right')
    const order = buildSetOrder(
      exercises,
      exercises.map((e) => e.sets),
    )
    const raises = order
      .map((s) => exercises[s.exIndex].key)
      .filter((k) => k.startsWith('lateral_raise'))
    expect(raises.slice(0, 2)).toEqual(['lateral_raise_r', 'lateral_raise_l'])
  })

  it('swaps a pair declared right-first just the same', () => {
    const list = [ex('a'), ex('r', { side: 'right' }), ex('l', { side: 'left' }), ex('b')]
    expect(sideOrderedExercises(list, 'left').map((e) => e.key)).toEqual(['a', 'l', 'r', 'b'])
    expect(sideOrderedExercises(list, 'right').map((e) => e.key)).toEqual(['a', 'r', 'l', 'b'])
  })

  it('orders two separate pairs independently', () => {
    const list = [
      ex('curl_l', { side: 'left' }),
      ex('curl_r', { side: 'right' }),
      ex('press_l', { side: 'left' }),
      ex('press_r', { side: 'right' }),
    ]
    expect(sideOrderedExercises(list, 'right').map((e) => e.key)).toEqual([
      'curl_r',
      'curl_l',
      'press_r',
      'press_l',
    ])
  })

  it('leaves a lone sided exercise where it is', () => {
    const list = [ex('a'), ex('solo_l', { side: 'left' }), ex('b')]
    expect(sideOrderedExercises(list, 'right').map((e) => e.key)).toEqual(['a', 'solo_l', 'b'])
  })
})

describe('the shipped lateral raise pair', () => {
  const find = (key: string) => DEFAULT_PLAN.push.exercises.find((e) => e.key === key)!
  const left = find('lateral_raise_l')
  const right = find('lateral_raise_r')

  it('is two stations of the arm circuit', () => {
    expect(left.circuit).toBe('arms')
    expect(right.circuit).toBe('arms')
  })

  it('shares one dumbbell between the arms', () => {
    expect(left.sharedLoad).toBeTruthy()
    expect(left.sharedLoad).toBe(right.sharedLoad)
  })

  it('trains both arms the same way', () => {
    expect(left.side).toBe('left')
    expect(right.side).toBe('right')
    expect(left.sets).toBe(right.sets)
    expect(left.repMin).toBe(right.repMin)
    expect(left.repMax).toBe(right.repMax)
  })
})
