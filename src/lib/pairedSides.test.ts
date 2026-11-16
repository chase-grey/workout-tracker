import { describe, expect, it } from 'vitest'
import {
  canSkipPair,
  keepPairsTogether,
  pairKeys,
  partnerExercise,
  sidePartnerKey,
  withPairSkipped,
  withPartner,
} from './pairedSides'
import { ALL_EXERCISES, type PlannedExercise } from '../config/plan'

const shipped = (key: string): PlannedExercise => ALL_EXERCISES.find((e) => e.key === key)!
const row = (key: string) => ({ key })
const order = (list: { key: string }[]) => list.map((e) => e.key)

describe('sidePartnerKey', () => {
  it('pairs every shipped sided exercise with its other side', () => {
    for (const e of ALL_EXERCISES.filter((x) => x.side)) {
      const partner = sidePartnerKey(e.key)
      expect(partner, e.key).not.toBeNull()
      expect(sidePartnerKey(partner!)).toBe(e.key)
      expect(shipped(partner!).side).not.toBe(e.side)
    }
  })

  it('has nothing for a two-sided exercise or a custom key', () => {
    expect(sidePartnerKey('flat_bench')).toBeNull()
    expect(sidePartnerKey('my_own_l')).toBeNull()
  })
})

describe('partnerExercise / withPartner', () => {
  it('prescribes the other side the same, under its own key and name', () => {
    const left = { ...shipped('lateral_raise_l'), sets: 5, repMin: 9, repMax: 9 }
    const right = partnerExercise(left)!
    expect(right).toMatchObject({ key: 'lateral_raise_r', name: 'lateral raise (right)', side: 'right', sets: 5, repMin: 9 })
  })

  it('adds both, left first, whichever side was asked for', () => {
    expect(order(withPartner(shipped('copenhagen_plank_r'), []))).toEqual(['copenhagen_plank_l', 'copenhagen_plank_r'])
    expect(order(withPartner(shipped('copenhagen_plank_l'), []))).toEqual(['copenhagen_plank_l', 'copenhagen_plank_r'])
  })

  it("doesn't add a side that's already there", () => {
    expect(order(withPartner(shipped('copenhagen_plank_r'), ['copenhagen_plank_l']))).toEqual(['copenhagen_plank_r'])
  })

  it('leaves an unpaired exercise alone', () => {
    expect(order(withPartner(shipped('flat_bench'), []))).toEqual(['flat_bench'])
  })
})

describe('pairKeys', () => {
  it('names both sides when both are present, one when the partner is missing', () => {
    expect(pairKeys(['a', 'lateral_raise_l', 'b', 'lateral_raise_r'], 'lateral_raise_r')).toEqual([
      'lateral_raise_r',
      'lateral_raise_l',
    ])
    expect(pairKeys(['a', 'lateral_raise_l'], 'lateral_raise_l')).toEqual(['lateral_raise_l'])
    expect(pairKeys(['a', 'b'], 'a')).toEqual(['a'])
  })
})

describe('keepPairsTogether', () => {
  const before = ['a', 'copenhagen_plank_l', 'copenhagen_plank_r', 'b', 'c'].map(row)

  it('brings the partner beside a moved side', () => {
    const moved = ['a', 'copenhagen_plank_r', 'b', 'c', 'copenhagen_plank_l'].map(row)
    expect(order(keepPairsTogether(before, moved, new Set(['copenhagen_plank_l'])))).toEqual([
      'a', 'b', 'c', 'copenhagen_plank_l', 'copenhagen_plank_r',
    ])
  })

  it('keeps the spacing a straddling pair had', () => {
    const arms = ['x', 'lateral_raise_l', 'y', 'lateral_raise_r', 'z'].map(row)
    const moved = ['x', 'lateral_raise_l', 'y', 'z', 'lateral_raise_r'].map(row)
    expect(order(keepPairsTogether(arms, moved, new Set(['lateral_raise_r'])))).toEqual([
      'x', 'y', 'lateral_raise_l', 'z', 'lateral_raise_r',
    ])
  })

  it('leaves a list with no placed side, or both sides placed, as given', () => {
    const moved = ['b', 'a', 'copenhagen_plank_l', 'copenhagen_plank_r', 'c'].map(row)
    expect(order(keepPairsTogether(before, moved, new Set(['b'])))).toEqual(order(moved))
    const both = ['copenhagen_plank_r', 'a', 'copenhagen_plank_l', 'b', 'c'].map(row)
    expect(order(keepPairsTogether(before, both, new Set(['copenhagen_plank_r', 'copenhagen_plank_l'])))).toEqual(order(both))
  })
})

describe('skipping a pair', () => {
  const keys = ['a', 'copenhagen_plank_l', 'copenhagen_plank_r']

  it('skips and unskips both sides together', () => {
    const skipped = withPairSkipped(new Set(), keys, 'copenhagen_plank_r', true)
    expect([...skipped].sort()).toEqual(['copenhagen_plank_l', 'copenhagen_plank_r'])
    expect([...withPairSkipped(skipped, keys, 'copenhagen_plank_l', false)]).toEqual([])
  })

  it('needs something outside the pair left to perform', () => {
    expect(canSkipPair(new Set(), keys, 'copenhagen_plank_l')).toBe(true)
    expect(canSkipPair(new Set(['a']), keys, 'copenhagen_plank_l')).toBe(false)
    expect(canSkipPair(new Set(['copenhagen_plank_l', 'copenhagen_plank_r']), keys, 'a')).toBe(false)
  })
})
