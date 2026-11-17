import { describe, expect, it } from 'vitest'
import { derivesCalories, formatMacros, macroCalories, macroGoalOn, trackedMacros } from './macros'

describe('trackedMacros', () => {
  it('counts protein alone for a profile from before the question', () => {
    expect(trackedMacros(null)).toEqual(['protein'])
    expect(trackedMacros({})).toEqual(['protein'])
  })

  it('keeps the picked ones in card order, and none when none are picked', () => {
    expect(trackedMacros({ macros: ['fat', 'protein'] })).toEqual(['protein', 'fat'])
    expect(trackedMacros({ macros: [] })).toEqual([])
  })
})

describe('derivesCalories', () => {
  it('only when all three are counted', () => {
    expect(derivesCalories(['protein', 'carbs', 'fat'])).toBe(true)
    expect(derivesCalories(['protein', 'carbs'])).toBe(false)
    expect(derivesCalories([])).toBe(false)
  })
})

describe('macroCalories', () => {
  it('is 4 a gram for protein and carbs and 9 for fat', () => {
    expect(macroCalories({ protein: 25 })).toBe(100)
    expect(macroCalories({ carbs: 25 })).toBe(100)
    expect(macroCalories({ fat: 10 })).toBe(90)
    expect(macroCalories({ protein: 30, carbs: 60, fat: 20 })).toBe(540)
    expect(macroCalories({ fat: -5 })).toBe(-45)
  })
})

describe('macroGoalOn', () => {
  const DATE = '2026-11-17'
  const weights = [{ date: '2026-11-01', weightLbs: 176.37 }] // 80 kg -> 145 g protein

  it('sets fat at a quarter of the calories and gives carbs the rest', () => {
    expect(macroGoalOn('protein', DATE, weights, null, 3000)).toBe(145)
    expect(macroGoalOn('fat', DATE, weights, null, 3000)).toBe(85)
    // 3000 - 145*4 - 85*9 = 1655 kcal -> 413.75 g
    expect(macroGoalOn('carbs', DATE, weights, null, 3000)).toBe(415)
  })

  it("takes the profile's own targets, and works carbs out around them", () => {
    const profile = { proteinGoal: 150, fatGoal: 100, carbGoal: 300 }
    expect(macroGoalOn('fat', DATE, weights, profile, 3000)).toBe(100)
    expect(macroGoalOn('carbs', DATE, weights, profile, 3000)).toBe(300)
    // 3000 - 150*4 - 100*9 = 1500 kcal
    expect(macroGoalOn('carbs', DATE, weights, { proteinGoal: 150, fatGoal: 100 }, 3000)).toBe(375)
  })

  it('has no carb target without a protein one, or when nothing is left for it', () => {
    expect(macroGoalOn('carbs', DATE, [], null, 3000)).toBeNull()
    expect(macroGoalOn('fat', DATE, [], null, 3000)).toBe(85)
    expect(macroGoalOn('carbs', DATE, weights, { proteinGoal: 300, fatGoal: 100 }, 2000)).toBeNull()
  })
})

describe('formatMacros', () => {
  it('writes bare grams for the only macro counted', () => {
    expect(formatMacros({ protein: 25, carbs: 60 }, ['protein'])).toBe('25g')
    expect(formatMacros({ carbs: 60 }, ['protein'])).toBe('')
  })

  it('letters them when there are several to tell apart', () => {
    expect(formatMacros({ protein: 25, carbs: 60, fat: 20 }, ['protein', 'carbs', 'fat'])).toBe('25p 60c 20f')
    expect(formatMacros({ protein: 25 }, ['protein', 'fat'])).toBe('25p')
    expect(formatMacros({ protein: 25 }, [])).toBe('')
  })
})
