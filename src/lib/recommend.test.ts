import { describe, it, expect } from 'vitest'
import {
  CALORIE_FLOOR,
  recommendCalories,
  recommendWeeklyGoals,
  restingBurn,
  type CalorieInputs,
} from './recommend'

// Hand-computed Mifflin-St Jeor:
// male:   180 lb = 81.6466 kg, 70 in = 177.8 cm, age 30
//         10*81.6466 + 6.25*177.8 - 5*30 + 5 = 816.466 + 1111.25 - 150 + 5 = 1782.716
// female: 140 lb = 63.5029 kg, 65 in = 165.1 cm, age 40
//         10*63.5029 + 6.25*165.1 - 5*40 - 161 = 635.029 + 1031.875 - 200 - 161 = 1305.904

const MALE: CalorieInputs = {
  sex: 'male',
  age: 30,
  heightIn: 70,
  weightLbs: 180,
  activity: 'moderate',
  direction: 'maintain',
}

const FEMALE: CalorieInputs = {
  sex: 'female',
  age: 40,
  heightIn: 65,
  weightLbs: 140,
  activity: 'moderate',
  direction: 'maintain',
}

describe('restingBurn', () => {
  it('matches Mifflin-St Jeor for a male', () => {
    expect(restingBurn(MALE)).toBeCloseTo(1782.716, 1)
  })

  it('matches Mifflin-St Jeor for a female', () => {
    expect(restingBurn(FEMALE)).toBeCloseTo(1305.904, 1)
  })
})

describe('recommendCalories', () => {
  it('rounds to the nearest 50', () => {
    expect(recommendCalories(MALE) % 50).toBe(0)
  })

  it('is maintenance for a maintain target', () => {
    // 1782.716 * 1.55 = 2763.21 -> 2750
    expect(recommendCalories(MALE)).toBe(2750)
  })

  it('takes 500 off for a lose target', () => {
    // 2763.21 - 500 = 2263.21 -> 2250
    expect(recommendCalories({ ...MALE, direction: 'lose' })).toBe(2250)
  })

  it('adds 300 for a gain target', () => {
    // 2763.21 + 300 = 3063.21 -> 3050
    expect(recommendCalories({ ...MALE, direction: 'gain' })).toBe(3050)
  })

  it('scales with activity', () => {
    // 1782.716 * 1.375 = 2451.7 -> 2450; * 1.725 = 3075.2 -> 3100 (nearest 50)
    const light = recommendCalories({ ...MALE, activity: 'light' })
    const active = recommendCalories({ ...MALE, activity: 'active' })
    expect(light).toBe(2450)
    expect(active).toBe(3100)
    expect(light).toBeLessThan(recommendCalories(MALE))
    expect(active).toBeGreaterThan(recommendCalories(MALE))
  })

  it('never goes below the floor for a male', () => {
    const tiny: CalorieInputs = { ...MALE, age: 80, heightIn: 60, weightLbs: 110, activity: 'light', direction: 'lose' }
    expect(recommendCalories(tiny)).toBe(CALORIE_FLOOR.male)
  })

  it('never goes below the floor for a female', () => {
    const tiny: CalorieInputs = { ...FEMALE, age: 80, heightIn: 58, weightLbs: 100, activity: 'light', direction: 'lose' }
    expect(recommendCalories(tiny)).toBe(CALORIE_FLOOR.female)
  })

  it('uses a lower floor for a female than for a male', () => {
    expect(CALORIE_FLOOR.female).toBeLessThan(CALORIE_FLOOR.male)
  })
})

describe('recommendWeeklyGoals', () => {
  it('gives 0 for every pillar that is off', () => {
    expect(recommendWeeklyGoals([])).toEqual({ workouts: 0, flex: 0, calDays: 0, cardio: 0 })
    expect(recommendWeeklyGoals(['cardio'])).toEqual({ workouts: 0, flex: 0, calDays: 0, cardio: 2 })
  })

  it('uses strength.daysPerWeek for workouts', () => {
    expect(recommendWeeklyGoals(['strength'], { daysPerWeek: 3, equipment: 'gym' }).workouts).toBe(3)
    expect(recommendWeeklyGoals(['strength'], { daysPerWeek: 2, equipment: 'gym' }).workouts).toBe(2)
  })

  it('defaults workouts to 2 when strength is on with no setup', () => {
    expect(recommendWeeklyGoals(['strength']).workouts).toBe(2)
  })

  it('gives the flexibility, diet and cardio counts when those are on', () => {
    expect(recommendWeeklyGoals(['flexibility', 'diet', 'cardio'])).toEqual({
      workouts: 0,
      flex: 2,
      calDays: 5,
      cardio: 2,
    })
  })
})
