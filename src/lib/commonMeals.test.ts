import { describe, expect, it } from 'vitest'
import type { CalorieEntry, Helping } from './calories'
import { commonMeals } from './commonMeals'

const NOW = new Date(2026, 10, 16, 20, 0)

/** A day `daysAgo` before NOW whose helpings were eaten at `hour`, `hour`+1, … */
function day(daysAgo: number, helpings: Omit<Helping, 'at'>[]): CalorieEntry {
  const d = new Date(NOW)
  d.setDate(d.getDate() - daysAgo)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const list = helpings.map((h, i) => ({ ...h, at: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8 + i).toISOString() }))
  const calories = list.reduce((s, h) => s + h.amount, 0)
  return { date, calories, loggedAt: list[list.length - 1]?.at, lastAmount: list[list.length - 1]?.amount, helpings: list }
}

const meal = (calories: number, protein = 0, carbs = 0, fat = 0) => ({ calories, protein, carbs, fat })

describe('commonMeals', () => {
  it('offers the helpings that recur, most often first', () => {
    const entries = [
      day(1, [{ amount: 600, protein: 25 }, { amount: 900, protein: 50 }]),
      day(2, [{ amount: 600, protein: 25 }, { amount: 900, protein: 50 }]),
      day(3, [{ amount: 600, protein: 25 }, { amount: 1200 }]),
    ]
    expect(commonMeals(entries, { now: NOW })).toEqual([
      meal(600, 25),
      meal(900, 50),
    ])
  })

  it('breaks a tie by the one eaten most recently', () => {
    const entries = [
      day(1, [{ amount: 400 }]),
      day(2, [{ amount: 400 }]),
      day(3, [{ amount: 700, protein: 30 }]),
      day(4, [{ amount: 700, protein: 30 }]),
    ]
    expect(commonMeals(entries, { now: NOW }).map((m) => m.calories)).toEqual([400, 700])
  })

  it("leaves out a card button, corrections, and what's outside the window", () => {
    const entries = [
      day(1, [{ amount: 100 }, { amount: -100 }, { amount: 0, protein: 25 }]),
      day(2, [{ amount: 100 }, { amount: -100 }, { amount: 0, protein: 25 }]),
      day(90, [{ amount: 800 }]),
      day(91, [{ amount: 800 }]),
    ]
    expect(
      commonMeals(entries, { now: NOW, exclude: [meal(100), meal(0, 25)] }),
    ).toEqual([])
  })

  it('caps the list and reads days from before helpings by their last one', () => {
    const entries: CalorieEntry[] = [
      day(1, [{ amount: 300 }, { amount: 400 }, { amount: 500, protein: 20 }, { amount: 650 }]),
      day(2, [{ amount: 300 }, { amount: 400 }, { amount: 500, protein: 20 }, { amount: 650 }]),
    ]
    expect(commonMeals(entries, { now: NOW, limit: 2 })).toHaveLength(2)
    const legacy: CalorieEntry[] = [1, 2].map((n) => {
      const { helpings: _h, ...rest } = day(n, [{ amount: 750 }])
      return rest
    })
    expect(commonMeals(legacy, { now: NOW })).toEqual([meal(750)])
  })

  it('tells meals apart by every macro counted, and drops the grams of one that is not', () => {
    const entries = [
      day(1, [{ amount: 540, protein: 30, carbs: 60, fat: 20 }, { amount: 540, protein: 30, carbs: 40, fat: 20 }]),
      day(2, [{ amount: 540, protein: 30, carbs: 60, fat: 20 }, { amount: 540, protein: 30, carbs: 40, fat: 20 }]),
    ]
    expect(commonMeals(entries, { now: NOW })).toEqual([meal(540, 30, 40, 20), meal(540, 30, 60, 20)])
    expect(commonMeals(entries, { now: NOW, macros: ['protein'] })).toEqual([meal(540, 30)])
    expect(commonMeals(entries, { now: NOW, macros: [] })).toEqual([meal(540)])
  })
})
