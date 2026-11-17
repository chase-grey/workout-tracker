import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAN } from '../config/plan'
import {
  circuitMembers,
  circuitRunKeys,
  circuitTitle,
  dayEntries,
  membersLine,
  moveEntry,
  roundTally,
  roundsLabel,
  sidelessName,
} from './circuitEntry'

const ex = (key: string, circuit?: string, name = key) => ({ key, name, circuit })

describe('dayEntries', () => {
  it('reads the push day’s arm circuit as one entry of four stations', () => {
    const entries = dayEntries(DEFAULT_PLAN.push.exercises)
    const circuits = entries.filter((e) => e.kind === 'circuit')
    expect(circuits).toHaveLength(1)
    const arms = circuits[0]
    expect(arms.kind === 'circuit' && arms.stations.map((s) => s.key)).toEqual([
      'tricep_pushdown',
      'lateral_raise_l',
      'overhead_tricep_ext',
      'lateral_raise_r',
    ])
    // Everything else on the day is still its own entry.
    expect(entries.length).toBe(DEFAULT_PLAN.push.exercises.length - 3)
  })

  it('keeps a lone station an exercise, and a reused id a second circuit', () => {
    const entries = dayEntries([ex('a', 'c'), ex('b'), ex('c', 'c'), ex('d', 'c'), ex('e', 'x')])
    expect(entries.map((e) => e.kind)).toEqual(['exercise', 'exercise', 'circuit', 'exercise'])
    expect(entries.map((e) => e.id)).toEqual(['a', 'b', 'circuit:c', 'e'])
    const twice = dayEntries([ex('a', 'c'), ex('b', 'c'), ex('m'), ex('d', 'c'), ex('e', 'c')])
    expect(twice.map((e) => e.id)).toEqual(['circuit:c', 'm', 'circuit:c#2'])
  })
})

describe('circuitRunKeys', () => {
  it('is the whole run for a station and the key alone otherwise', () => {
    const day = [ex('a'), ex('b', 'c'), ex('c', 'c'), ex('d')]
    expect(circuitRunKeys(day, 'c')).toEqual(['b', 'c'])
    expect(circuitRunKeys(day, 'a')).toEqual(['a'])
    expect(circuitRunKeys(day, 'missing')).toEqual(['missing'])
  })
})

describe('moveEntry', () => {
  it('moves a whole circuit as one row', () => {
    const day = [ex('a'), ex('b', 'c'), ex('c', 'c'), ex('d')]
    expect(moveEntry(day, 1, 0).map((e) => e.key)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveEntry(day, 1, 2).map((e) => e.key)).toEqual(['a', 'd', 'b', 'c'])
    expect(moveEntry(day, 2, 0).map((e) => e.key)).toEqual(['d', 'a', 'b', 'c'])
  })
})

describe('circuitMembers', () => {
  it('counts a one-arm pair once, at the side that leads', () => {
    const arms = DEFAULT_PLAN.push.exercises.filter((e) => e.circuit === 'arms')
    expect(circuitMembers(arms).map((m) => m.name)).toEqual([
      'tricep pushdown',
      'lateral raise',
      'overhead tricep extension',
    ])
    expect(circuitMembers(arms)[1].keys).toEqual(['lateral_raise_l', 'lateral_raise_r'])
    const rightFirst = [arms[0], arms[3], arms[2], arms[1]]
    expect(circuitMembers(rightFirst)[1].keys).toEqual(['lateral_raise_r', 'lateral_raise_l'])
    expect(membersLine(arms)).toBe('tricep pushdown · lateral raise · overhead tricep extension')
  })

  it('strips only a trailing side', () => {
    expect(sidelessName('copenhagen plank (right)')).toBe('copenhagen plank')
    expect(sidelessName('left-hand row')).toBe('left-hand row')
  })
})

describe('labels', () => {
  it('names a circuit by the group its stations share', () => {
    expect(circuitTitle([{ group: 'neck circuit' }, { group: 'neck circuit' }])).toBe('neck circuit')
    expect(circuitTitle([{ group: 'neck' }, { group: 'arms' }])).toBe('circuit')
    expect(roundsLabel(3)).toBe('circuit · 3 rounds')
    expect(roundsLabel(1)).toBe('circuit · 1 round')
  })
})

describe('roundTally', () => {
  const set = (done: boolean, skipped = false) => ({ setNumber: 1, weightLbs: 5, reps: 10, done, skipped })
  it('counts a round done once every station’s set of it is', () => {
    expect(
      roundTally([
        [set(true), set(true), set(false)],
        [set(true), set(false), set(false)],
      ]),
    ).toEqual({ done: 1, all: 3 })
  })

  it('owes no round whose every set was struck, and ignores struck sets in a round', () => {
    expect(
      roundTally([
        [set(true), set(false, true), set(false, true)],
        [set(true), set(true), set(false, true)],
      ]),
    ).toEqual({ done: 2, all: 2 })
  })

  it('runs as long as the longest station', () => {
    expect(roundTally([[set(true)], [set(true), set(false)]])).toEqual({ done: 1, all: 2 })
  })
})
