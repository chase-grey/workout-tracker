import { describe, expect, it } from 'vitest'
import { buildGoals, GOAL_IDS, projectGoal, type GoalSpec } from './goals'
import { cumulativeGain, weeksToMovingTarget } from './predictions'
import { currentPaceSeries, lockProjectionByDate, paceAgainstLock } from './goalLock'

const today = new Date(2026, 1, 15)
const goal: GoalSpec = {
  id: 'bench_bodyweight', title: 'bench my bodyweight', unit: 'lbs',
  exerciseKey: 'flat_bench', direction: 'up', target: 170,
  points: [
    { date: '2026-02-01', value: 154 },
    { date: '2026-02-08', value: 157 },
    { date: '2026-02-15', value: 160 },
  ],
  movingTarget: true, targetSlopePerWeek: 1, capPerWeek: 3,
}

describe('bodyweight-relative forecasts', () => {
  it('catches the future bodyweight rather than today’s weight', () => {
    const fixed = projectGoal({ ...goal, movingTarget: false }, today)
    const moving = projectGoal(goal, today)
    expect(fixed.etaWeeks).toBeCloseTo(10 / 3)
    expect(moving.etaWeeks).toBe(5)
    expect(moving.slopePerWeek).toBe(3)
  })

  it('uses capped weight gain and applies the squat multiplier, even with unordered weigh-ins', () => {
    const goals = buildGoals({ workouts: [], measurements: [], heightIn: 70, bodyWeights: [
      { date: '2026-02-15', weightLbs: 170 },
      { date: '2026-02-01', weightLbs: 164 },
      { date: '2026-02-08', weightLbs: 167 },
    ] })
    expect(goals.find(g => g.id === GOAL_IDS.benchBodyweight)).toMatchObject({ target: 170, targetSlopePerWeek: 1 })
    expect(goals.find(g => g.id === GOAL_IDS.squatBodyweight)?.targetSlopePerWeek).toBe(1)
    expect(goals.find(g => g.id === GOAL_IDS.squatOneAndAHalf)).toMatchObject({ target: 255, targetSlopePerWeek: 1.5 })
    expect(goals.find(g => g.id === GOAL_IDS.benchTwoHundred)?.targetSlopePerWeek).toBeUndefined()
  })

  it('keeps the latest target when weight history cannot establish gain', () => {
    for (const bodyWeights of [[], [{ date: '2026-02-15', weightLbs: 170 }], [
      { date: '2026-02-01', weightLbs: 172 },
      { date: '2026-02-08', weightLbs: 171 },
      { date: '2026-02-15', weightLbs: 170 },
    ]]) {
      const goals = buildGoals({ workouts: [], measurements: [], heightIn: 70, bodyWeights })
      expect(goals.find(g => g.id === GOAL_IDS.benchBodyweight)?.targetSlopePerWeek).toBe(0)
    }
  })

  it('solves the intersection with tapered strength gains', () => {
    const weeks = weeksToMovingTarget(10, 3, 1, 0.93)!
    expect(weeks).toBeGreaterThan(5)
    expect(3 * cumulativeGain(weeks, 0.93) - weeks).toBeCloseTo(10)
    expect(weeksToMovingTarget(100, 3, 1, 0.93)).toBeNull()
    // A short-lived crossing still counts, even if weight later overtakes strength.
    expect(weeksToMovingTarget(0.5, 3, 2.5, 0.93)).not.toBeNull()
  })

  it('does not promise a date when bodyweight gains outpace the lift', () => {
    expect(projectGoal({ ...goal, targetSlopePerWeek: 3 }, today).etaDate).toBeNull()
    expect(projectGoal({ ...goal, targetSlopePerWeek: 0 }, today).etaWeeks).toBeCloseTo(10 / 3)
  })

  it('sets the committed load for the chosen date and revises old locks against the live target', () => {
    const projection = projectGoal(goal, today)
    const lock = lockProjectionByDate(goal.id, projection, '2026-03-29', today)!
    expect(lock.target).toBe(176)
    const oldLock = { ...lock, target: 170 }
    const pace = paceAgainstLock(oldLock, 160, '2026-02-15', 3, today, projection)
    expect(pace.revisedEta).toBe(projection.etaDate)
    const curve = currentPaceSeries(oldLock, projection, '2026-02-15', today)
    expect(curve.at(-1)).toEqual({ date: projection.etaDate, value: 175 })
  })
})
