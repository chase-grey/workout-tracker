import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CALORIE_ADDS,
  MAX_QUICK_ADDS,
  calorieAdds,
  formatAdd,
  macroAdds,
  withAmount,
  withoutAmount,
} from './quickAdds'

describe('calorieAdds', () => {
  it('is the shipped row until something is saved', () => {
    expect(calorieAdds(undefined)).toEqual([...DEFAULT_CALORIE_ADDS])
  })

  it('falls back to the shipped row when the saved one is empty', () => {
    expect(calorieAdds([])).toEqual([...DEFAULT_CALORIE_ADDS])
    expect(calorieAdds([0, NaN])).toEqual([...DEFAULT_CALORIE_ADDS])
  })

  it('keeps the saved amounts in their order, cleaned', () => {
    expect(calorieAdds([250, 250, 0, 700.4, -50])).toEqual([250, 700, -50])
  })

  it('holds no more than a row fits', () => {
    expect(calorieAdds([1, 2, 3, 4, 5, 6, 7])).toHaveLength(MAX_QUICK_ADDS)
  })
})

describe('macroAdds', () => {
  it('reads each macro on its own', () => {
    expect(macroAdds({ protein: [30] }, 'protein')).toEqual([30])
    expect(macroAdds({ protein: [30] }, 'fat')).toEqual([5, 10, -5])
  })
})

describe('editing a row', () => {
  it('adds an amount once', () => {
    expect(withAmount([100], 250)).toEqual([100, 250])
    expect(withAmount([100], 100)).toEqual([100])
    expect(withAmount([100], 0)).toEqual([100])
  })

  it('stops adding when the row is full', () => {
    const full = [1, 2, 3, 4, 5]
    expect(withAmount(full, 6)).toEqual(full)
  })

  it('removes an amount but never the last', () => {
    expect(withoutAmount([100, 500], 100)).toEqual([500])
    expect(withoutAmount([500], 500)).toEqual([500])
  })
})

describe('formatAdd', () => {
  it('signs the amount', () => {
    expect(formatAdd(500)).toBe('+500')
    expect(formatAdd(-100)).toBe('−100')
    expect(formatAdd(25, 'g')).toBe('+25g')
  })
})
