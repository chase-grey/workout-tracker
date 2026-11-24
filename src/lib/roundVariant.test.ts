import { describe, expect, it, vi } from 'vitest'
import { createRoundVariantSelector } from './roundVariant'
import { sidedRoundKey } from './sidePair'
import { flexRoundKey, buildFlexSteps } from './flexSteps'
import { FLEX_ROUTINES } from '../config/flexRoutines'
import { DEFAULT_PLAN } from '../config/plan'

describe('createRoundVariantSelector', () => {
  it('draws once for a round and again for the next one', () => {
    const draw = vi.fn<() => string>().mockReturnValueOnce('glass').mockReturnValueOnce('candle')
    const select = createRoundVariantSelector(draw)

    expect(select('calf:0')).toBe('glass')
    expect(select('calf:0')).toBe('glass')
    expect(select('calf:1')).toBe('candle')
    expect(draw).toHaveBeenCalledTimes(2)
  })

  it('draws again when the round’s shape was hidden between its sides', () => {
    const draw = vi.fn<() => string>().mockReturnValueOnce('glass').mockReturnValueOnce('candle')
    const hidden = new Set<string>()
    const select = createRoundVariantSelector(draw, (v) => hidden.has(v))

    expect(select('calf:0')).toBe('glass')
    hidden.add('glass')
    expect(select('calf:0')).toBe('candle')
  })

  it('hands the other side the shape the first side was swapped to', () => {
    const draw = vi.fn<() => string>().mockReturnValue('glass')
    const select = createRoundVariantSelector(draw)

    expect(select('calf:0')).toBe('glass')
    select.keep('calf:0', 'tide')
    expect(select('calf:0')).toBe('tide')
    expect(draw).toHaveBeenCalledTimes(1)
  })
})

/**
 * The standard, held against the plans as shipped: every left step and the right
 * step it pairs with ask the selector under one key, so no sided movement in the
 * app can show two shapes for one round.
 */
describe('the two sides of a round share a round key', () => {
  it('in every stretch routine', () => {
    let sided = 0
    for (const routine of Object.values(FLEX_ROUTINES)) {
      const steps = buildFlexSteps(routine.blocks, 'left')
      for (const left of steps) {
        if (left.side !== 'left') continue
        const sameRound = (s: (typeof steps)[number]) =>
          s.blockLabel === left.blockLabel && s.exKey === left.exKey && s.round === left.round
        const right = steps.find((s) => s.side === 'right' && sameRound(s))
        expect(right, `${routine.key} ${left.exKey} round ${left.round} has a right side`).toBeDefined()
        expect(flexRoundKey(right!)).toBe(flexRoundKey(left))
        // And nothing outside the round shares it, or two sets would be stuck with one shape.
        for (const other of steps) {
          if (!sameRound(other)) expect(flexRoundKey(other)).not.toBe(flexRoundKey(left))
        }
        sided++
      }
    }
    expect(sided).toBeGreaterThan(0)
  })

  it('in every lift day', () => {
    let sided = 0
    for (const day of Object.values(DEFAULT_PLAN)) {
      for (const left of day.exercises.filter((e) => e.side === 'left')) {
        const right = day.exercises.find((e) => e.side === 'right' && e.name === left.name.replace('(left)', '(right)'))
        expect(right, `${left.key} has a right side`).toBeDefined()
        expect(sidedRoundKey(day.exercises, right!.key, 1)).toBe(sidedRoundKey(day.exercises, left.key, 1))
        expect(sidedRoundKey(day.exercises, left.key, 2)).not.toBe(sidedRoundKey(day.exercises, left.key, 1))
        sided++
      }
    }
    expect(sided).toBeGreaterThan(0)
  })

  it('keeps an exercise with no other side on a key of its own', () => {
    const day = [{ key: 'plank' }, { key: 'side_plank_l', side: 'left' as const }]
    expect(sidedRoundKey(day, 'plank', 0)).toBe('plank:0')
    expect(sidedRoundKey(day, 'side_plank_l', 0)).toBe('side_plank_l:0')
  })
})
