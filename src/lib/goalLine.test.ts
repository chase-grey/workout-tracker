import { describe, expect, it } from 'vitest'
import { goalLine, withGoalLine, type MovingTarget } from './goalLine'
import { buildGoals, GOAL_IDS } from './goals'

const today = new Date(2026, 9, 26)
const moving: MovingTarget = {
  history: [
    { date: '2026-09-28', value: 163 },
    { date: '2026-10-12', value: 165.5 },
    { date: '2026-10-19', value: 167.4 },
  ],
  target: 167.4,
  slopePerWeek: 0.5,
}

describe('goalLine', () => {
  it('runs through the weigh-ins, holds to today, then climbs at the projected gain', () => {
    expect(goalLine(moving, '2026-10-01', '2026-12-07', today)).toEqual([
      { date: '2026-10-01', value: 163 },
      { date: '2026-10-12', value: 165.5 },
      { date: '2026-10-19', value: 167.4 },
      { date: '2026-10-26', value: 167.4 },
      { date: '2026-12-07', value: 170.4 },
    ])
  })

  it('stops at today when the chart does', () => {
    expect(goalLine(moving, '2026-10-12', '2026-10-26', today)).toEqual([
      { date: '2026-10-12', value: 165.5 },
      { date: '2026-10-19', value: 167.4 },
      { date: '2026-10-26', value: 167.4 },
    ])
  })

  it('leaves a goal with no weigh-ins to its flat rule', () => {
    expect(goalLine(undefined, '2026-10-01', '2026-12-07', today)).toBeNull()
    expect(goalLine({ ...moving, history: [] }, '2026-10-01', '2026-12-07', today)).toBeNull()
  })

  it('is what buildGoals hands the bodyweight multiples, scaled', () => {
    const goals = buildGoals({ workouts: [], measurements: [], heightIn: 70, bodyWeights: [
      { date: '2026-10-12', weightLbs: 166 },
      { date: '2026-10-19', weightLbs: 168 },
    ] })
    expect(goals.find((g) => g.id === GOAL_IDS.benchBodyweight)?.targetPoints).toEqual([
      { date: '2026-10-12', value: 166 },
      { date: '2026-10-19', value: 168 },
    ])
    expect(goals.find((g) => g.id === GOAL_IDS.squatOneAndAHalf)?.targetPoints?.at(-1)?.value).toBe(252)
    expect(goals.find((g) => g.id === GOAL_IDS.benchTwoHundred)?.targetPoints).toBeUndefined()
  })
})

describe('withGoalLine', () => {
  it('adds the line to the rows it shares a date with and a row for each one it does not', () => {
    const rows = [{ date: '2026-10-12', actual: 140 }, { date: '2026-10-26', actual: 145 }]
    expect(withGoalLine(rows, [{ date: '2026-10-19', value: 167.4 }, { date: '2026-10-26', value: 167.4 }])).toEqual([
      { date: '2026-10-12', actual: 140 },
      { date: '2026-10-19', goal: 167.4 },
      { date: '2026-10-26', actual: 145, goal: 167.4 },
    ])
    expect(withGoalLine(rows, null)).toBe(rows)
  })
})
