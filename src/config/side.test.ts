import { describe, it, expect } from 'vitest'
import { buildSetOrder } from '../lib/circuit'
import {
  absExerciseKeys,
  COPENHAGEN_HOLD_SEC,
  COPENHAGEN_ROUND_REST_SEC,
  COPENHAGEN_SWITCH_SEC,
  DEFAULT_PLAN,
  legExerciseKeys,
  sideOrderedExercises,
  variantExercises,
  type PlannedExercise,
} from './plan'

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
    const keys = sideOrderedExercises(DEFAULT_PLAN.fullbody.exercises, 'right').map((e) => e.key)
    expect(keys).toEqual(DEFAULT_PLAN.fullbody.exercises.map((e) => e.key))
  })

  it('leads with the left raise on a left session', () => {
    const keys = pushKeys('left')
    expect(keys.indexOf('lateral_raise_l')).toBeLessThan(keys.indexOf('lateral_raise_r'))
  })

  it('leads with the right raise on a right session', () => {
    const keys = pushKeys('right')
    expect(keys.indexOf('lateral_raise_r')).toBeLessThan(keys.indexOf('lateral_raise_l'))
  })

  it('moves nothing but the pair', () => {
    const left = pushKeys('left')
    const right = pushKeys('right')
    const others = (keys: string[]) => keys.filter((k) => !k.startsWith('lateral_raise'))
    expect(others(right)).toEqual(others(left))
    expect([...right].sort()).toEqual([...left].sort())
  })

  it('leads with the fresh arm between the two tricep movements either way', () => {
    // The leading arm takes the slot between pushdown and extension; the other one
    // follows the extension, so whichever arm goes first is also the one done fresh.
    for (const side of ['left', 'right'] as const) {
      const keys = pushKeys(side)
      const lead = keys.indexOf(side === 'left' ? 'lateral_raise_l' : 'lateral_raise_r')
      const follow = keys.indexOf(side === 'left' ? 'lateral_raise_r' : 'lateral_raise_l')
      expect(lead).toBeGreaterThan(keys.indexOf('tricep_pushdown'))
      expect(lead).toBeLessThan(keys.indexOf('overhead_tricep_ext'))
      expect(follow).toBeGreaterThan(keys.indexOf('overhead_tricep_ext'))
    }
  })

  it('rotates delt, tricep, delt, tricep through one round of the arm circuit', () => {
    // Each round is pushdown, one arm, extension, the other arm — not three rounds
    // of one arm and then three of the other (what one station of six sets would
    // give), and not both arms back to back either.
    const exercises = sideOrderedExercises(variantExercises(DEFAULT_PLAN.push, 'A'), 'right')
    const order = buildSetOrder(
      exercises,
      exercises.map((e) => e.sets),
    )
    const arms = order
      .map((s) => exercises[s.exIndex].key)
      .filter((k) => k.startsWith('lateral_raise') || k.includes('tricep'))
    expect(arms.slice(0, 4)).toEqual([
      'tricep_pushdown',
      'lateral_raise_r',
      'overhead_tricep_ext',
      'lateral_raise_l',
    ])
    // And the next round picks up the same way round.
    expect(arms.slice(4, 8)).toEqual(arms.slice(0, 4))
  })

  it('swaps a pair declared right-first just the same', () => {
    const list = [ex('a'), ex('r', { side: 'right' }), ex('l', { side: 'left' }), ex('b')]
    expect(sideOrderedExercises(list, 'left').map((e) => e.key)).toEqual(['a', 'l', 'r', 'b'])
    expect(sideOrderedExercises(list, 'right').map((e) => e.key)).toEqual(['a', 'r', 'l', 'b'])
  })

  it('swaps the two halves of a pair that are not neighbours', () => {
    // The shipped case: a tricep station sits between the arms, and it stays put.
    const list = [ex('l', { side: 'left' }), ex('between'), ex('r', { side: 'right' }), ex('after')]
    expect(sideOrderedExercises(list, 'left').map((e) => e.key)).toEqual([
      'l',
      'between',
      'r',
      'after',
    ])
    expect(sideOrderedExercises(list, 'right').map((e) => e.key)).toEqual([
      'r',
      'between',
      'l',
      'after',
    ])
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

describe('the shipped copenhagen plank pair', () => {
  const find = (key: string) => DEFAULT_PLAN.pull.exercises.find((e) => e.key === key)!
  const left = find('copenhagen_plank_l')
  const right = find('copenhagen_plank_r')

  it('is a fixed hold rather than a rep range', () => {
    for (const e of [left, right]) {
      expect(e.timed).toBe(true)
      expect(e.repMin).toBe(COPENHAGEN_HOLD_SEC)
      expect(e.repMax).toBe(COPENHAGEN_HOLD_SEC)
    }
  })

  it('holds each side unloaded', () => {
    for (const e of [left, right]) {
      expect(e.repsOnly).toBe(true)
      expect(e.bodyweight).toBe(true)
    }
  })

  it('trains both sides the same way', () => {
    expect(left.side).toBe('left')
    expect(right.side).toBe('right')
    expect(left.sets).toBe(right.sets)
  })

  it('is two stations of one circuit', () => {
    expect(left.circuit).toBeTruthy()
    expect(left.circuit).toBe(right.circuit)
  })

  it('switches sides on both stations and rests after the round', () => {
    // Declared on both, because which side leads flips every session and either of
    // them can end up being the one that wraps into the next round.
    for (const e of [left, right]) {
      expect(e.circuitRestSec).toBe(COPENHAGEN_SWITCH_SEC)
      expect(e.circuitRoundRestSec).toBe(COPENHAGEN_ROUND_REST_SEC)
    }
  })

  it('rests far longer after the pair than between its sides', () => {
    expect(COPENHAGEN_ROUND_REST_SEC).toBeGreaterThan(COPENHAGEN_SWITCH_SEC)
  })

  it('is kept out of the core and leg aggregates, which count reps', () => {
    // 30 seconds is not 30 of anything, so a hold has no business being summed into
    // a rep series (see absExerciseKeys / legExerciseKeys).
    const abs = absExerciseKeys(DEFAULT_PLAN)
    const legs = legExerciseKeys(DEFAULT_PLAN)
    for (const e of [left, right]) {
      expect(abs.has(e.key)).toBe(false)
      expect(legs.has(e.key)).toBe(false)
    }
  })

  it('runs left, right, left, right through the day rather than one side at a time', () => {
    for (const side of ['left', 'right'] as const) {
      const exercises = sideOrderedExercises(DEFAULT_PLAN.pull.exercises, side)
      const order = buildSetOrder(
        exercises,
        exercises.map((e) => e.sets),
      )
      const held = order
        .map((s) => exercises[s.exIndex].key)
        .filter((k) => k.startsWith('copenhagen_plank'))
      const lead = side === 'left' ? 'copenhagen_plank_l' : 'copenhagen_plank_r'
      const follow = side === 'left' ? 'copenhagen_plank_r' : 'copenhagen_plank_l'
      expect(held.slice(0, 4)).toEqual([lead, follow, lead, follow])
    }
  })
})
