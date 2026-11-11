/**
 * Starting targets for someone setting the app up without a coach: a daily
 * calorie figure from the Mifflin-St Jeor equation, and weekly counts for each
 * pillar they switched on. Suggestions only — the welcome flow shows each one
 * in an editable field.
 */

import type { Activity, DietDirection, Pillar, Sex, StrengthSetup } from './profile'
import type { WeeklyGoalConfig } from './weeklyStreak'

const LB_PER_KG = 2.20462
const CM_PER_IN = 2.54

/** Multipliers on resting burn for a day that also includes a few workouts a week. */
const ACTIVITY_FACTOR: Record<Activity, number> = { light: 1.375, moderate: 1.55, active: 1.725 }

/** A pound a week down; about half a pound a week up. */
const DAILY_OFFSET: Record<DietDirection, number> = { lose: -500, maintain: 0, gain: 300 }

/** Below these a target stops being a diet and starts being a risk. */
export const CALORIE_FLOOR: Record<Sex, number> = { male: 1500, female: 1200 }

export type CalorieInputs = {
  sex: Sex
  age: number
  heightIn: number
  weightLbs: number
  activity: Activity
  direction: DietDirection
}

/** Resting energy burn, kcal a day (Mifflin-St Jeor). */
export function restingBurn({ sex, age, heightIn, weightLbs }: Omit<CalorieInputs, 'activity' | 'direction'>): number {
  const kg = weightLbs / LB_PER_KG
  const cm = heightIn * CM_PER_IN
  return 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161)
}

/** A daily calorie target, rounded to the nearest 50 and never below the floor. */
export function recommendCalories(inputs: CalorieInputs): number {
  const maintenance = restingBurn(inputs) * ACTIVITY_FACTOR[inputs.activity]
  const target = maintenance + DAILY_OFFSET[inputs.direction]
  return Math.max(CALORIE_FLOOR[inputs.sex], Math.round(target / 50) * 50)
}

/** Weekly counts for the pillars switched on; a pillar that's off gets 0. */
export function recommendWeeklyGoals(pillars: Pillar[], strength?: StrengthSetup): WeeklyGoalConfig {
  return {
    workouts: pillars.includes('strength') ? strength?.daysPerWeek ?? 2 : 0,
    flex: pillars.includes('flexibility') ? 2 : 0,
    calDays: pillars.includes('diet') ? 5 : 0,
    cardio: pillars.includes('cardio') ? 2 : 0,
  }
}
