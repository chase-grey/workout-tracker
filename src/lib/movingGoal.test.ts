import { describe, expect, it } from 'vitest'
import { buildGoals, GOAL_IDS, liveLocks, projectGoal, UNWEIGHED_TARGET, type GoalSpec } from './goals'
import { cumulativeGain, weeksToMovingTarget } from './predictions'
import { currentPaceSeries, followTarget, lockProjectionByDate, paceAgainstLock } from './goalLock'

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

  // The complaint this exists for: a committed bench or squat multiple kept
  // quoting the bodyweight forecast on the day it was committed, however far the
  // scale had since climbed past it.
  describe('a committed goal follows the scale', () => {
    const lock = lockProjectionByDate(goal.id, projectGoal(goal, today), '2026-03-29', today)!
    const later = new Date(2026, 2, 8) // three weeks on, three weeks short of the date

    it('re-aims at the weight the target is headed for on the committed date', () => {
      expect(lock.target).toBe(176)
      // Weighing 178 with three weeks to run at a pound a week: 181, not 176.
      const live = followTarget(lock, { target: 178, targetSlopePerWeek: 1 }, later)
      expect(live.target).toBe(181)
      expect(live).toMatchObject({ lockedAt: lock.lockedAt, startValue: lock.startValue, etaDate: lock.etaDate })
    })

    it('rises with a weigh-in even when the forecast gain is nil', () => {
      expect(followTarget(lock, { target: 178, targetSlopePerWeek: 0 }, later).target).toBe(178)
    })

    it('is today’s target once the committed date has passed', () => {
      expect(followTarget(lock, { target: 178, targetSlopePerWeek: 1 }, new Date(2026, 4, 1)).target).toBe(178)
    })

    it('leaves a fixed target and an already-aimed lock alone', () => {
      expect(followTarget(lock, { target: 200 }, later)).toBe(lock)
      expect(followTarget(lock, { target: 173, targetSlopePerWeek: 1 }, later)).toBe(lock)
    })

    it('reads every bodyweight multiple through the latest weigh-in, and nothing else', () => {
      const goals = buildGoals({ workouts: [], measurements: [], heightIn: 70, bodyWeights: [
        { date: '2026-02-15', weightLbs: 171 },
        { date: '2026-03-01', weightLbs: 175 },
        { date: '2026-03-08', weightLbs: 178 },
      ] })
      const stale = (goalId: string, target: number) => ({ ...lock, goalId, target, etaDate: '2026-03-08' })
      const locked = {
        [GOAL_IDS.benchBodyweight]: stale(GOAL_IDS.benchBodyweight, 172),
        [GOAL_IDS.squatBodyweight]: stale(GOAL_IDS.squatBodyweight, 172),
        [GOAL_IDS.squatOneAndAHalf]: stale(GOAL_IDS.squatOneAndAHalf, 258),
        [GOAL_IDS.benchTwoHundred]: stale(GOAL_IDS.benchTwoHundred, 200),
      }
      const live = liveLocks(locked, goals, later)
      expect(live[GOAL_IDS.benchBodyweight].target).toBe(178)
      expect(live[GOAL_IDS.squatBodyweight].target).toBe(178)
      expect(live[GOAL_IDS.squatOneAndAHalf].target).toBe(267)
      expect(live[GOAL_IDS.benchTwoHundred]).toBe(locked[GOAL_IDS.benchTwoHundred])
      expect(locked[GOAL_IDS.benchBodyweight].target).toBe(172)
    })

    it('keeps the stored target while there is no weigh-in to follow', () => {
      const goals = buildGoals({ workouts: [], measurements: [], heightIn: 70, bodyWeights: [] })
      expect(goals.find(g => g.id === GOAL_IDS.benchBodyweight)?.target).toBe(UNWEIGHED_TARGET)
      const locked = { [GOAL_IDS.benchBodyweight]: { ...lock, goalId: GOAL_IDS.benchBodyweight } }
      expect(liveLocks(locked, goals, later)).toBe(locked)
    })
  })
})
