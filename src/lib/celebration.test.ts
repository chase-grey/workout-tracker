import { describe, expect, it } from 'vitest'
import type { WorkoutRow } from '../types'
import { DEFAULT_WEEKLY_GOALS } from './weeklyStreak'
import {
  achievementCelebration,
  checkpointFraction,
  composeCelebration,
  currentWeekCounts,
  detectPRs,
  newlyEarned,
  overallProgress,
  prCelebration,
  weekAchievements,
} from './celebration'

const TODAY = new Date('2026-07-21T12:00:00') // Tuesday; week starts Mon 2026-07-20

function row(p: Partial<WorkoutRow> = {}): WorkoutRow {
  return {
    session_id: 's1',
    date: '2026-07-21',
    day_type: 'push',
    exercise: 'flat_bench',
    set_number: 1,
    weight_lbs: null,
    reps: 0,
    notes: '',
    is_historical: false,
    ...p,
  }
}

describe('detectPRs', () => {
  it('flags an all-time est-1RM PR', () => {
    const prev = [row({ exercise: 'flat_bench', weight_lbs: 100, reps: 5 })]
    const added = [row({ exercise: 'flat_bench', weight_lbs: 100, reps: 8 })]
    const prs = detectPRs(prev, added)
    expect(prs).toHaveLength(1)
    expect(prs[0].est1RM).toBeCloseTo(126.7, 1)
  })

  it('does not count the first-ever entry for a lift as a PR', () => {
    expect(detectPRs([], [row({ exercise: 'flat_bench', weight_lbs: 135, reps: 5 })])).toHaveLength(0)
  })

  it('ignores sets that fail to beat the prior best', () => {
    const prev = [row({ exercise: 'flat_bench', weight_lbs: 200, reps: 5 })]
    const added = [row({ exercise: 'flat_bench', weight_lbs: 135, reps: 5 })]
    expect(detectPRs(prev, added)).toHaveLength(0)
  })

  it('sorts multiple PRs heaviest first', () => {
    const prev = [
      row({ exercise: 'flat_bench', weight_lbs: 100, reps: 5 }),
      row({ exercise: 'squat', weight_lbs: 100, reps: 5 }),
    ]
    const added = [
      row({ exercise: 'flat_bench', weight_lbs: 140, reps: 5 }),
      row({ exercise: 'squat', weight_lbs: 250, reps: 5 }),
    ]
    const prs = detectPRs(prev, added)
    expect(prs).toHaveLength(2)
    expect(prs[0].est1RM).toBeGreaterThan(prs[1].est1RM)
  })
})

describe('currentWeekCounts', () => {
  it('counts distinct non-abs sessions, stretch days, and calorie-goal days this week', () => {
    const workouts = [
      row({ session_id: 'a', date: '2026-07-20' }),
      row({ session_id: 'a', date: '2026-07-20' }), // same session — counts once
      row({ session_id: 'b', date: '2026-07-21' }),
      row({ session_id: 'c', date: '2026-07-21', day_type: 'abs' }), // abs excluded
      row({ session_id: 'd', date: '2026-07-10' }), // prior week
    ]
    const flexDates = ['2026-07-20', '2026-07-20', '2026-07-13']
    const cals = [
      { date: '2026-07-21', calories: 4000 },
      { date: '2026-07-19', calories: 2000 }, // under goal
    ]
    const counts = currentWeekCounts(workouts, flexDates, cals, TODAY)
    expect(counts).toEqual({ workouts: 2, flex: 1, calDays: 1 })
  })
})

describe('weekAchievements', () => {
  const g = DEFAULT_WEEKLY_GOALS

  it('marks full goal when every target is met exactly', () => {
    expect(weekAchievements({ workouts: 2, flex: 2, calDays: 6 }, g)).toEqual({
      workoutGoal: true,
      flexGoal: true,
      calGoal: true,
      checkpoint: true,
      fullGoal: true,
      exceeded: false,
    })
  })

  it('marks exceeded only once the full goal is met and a metric is over', () => {
    expect(weekAchievements({ workouts: 3, flex: 2, calDays: 6 }, g).exceeded).toBe(true)
    // Over on workouts but flex/cal unmet → not exceeded (full goal not reached).
    expect(weekAchievements({ workouts: 3, flex: 0, calDays: 0 }, g).exceeded).toBe(false)
  })

  it('reaches the checkpoint at the half-goal marker', () => {
    expect(overallProgress({ workouts: 1, flex: 1, calDays: 5 }, g)).toBeCloseTo(checkpointFraction(g), 6)
    expect(weekAchievements({ workouts: 1, flex: 1, calDays: 5 }, g).checkpoint).toBe(true)
    expect(weekAchievements({ workouts: 0, flex: 0, calDays: 0 }, g).checkpoint).toBe(false)
  })
})

describe('newlyEarned', () => {
  it('returns only achievements that flipped false → true', () => {
    const earned = newlyEarned({ workouts: 1, flex: 1, calDays: 4 }, { workouts: 1, flex: 1, calDays: 5 }, DEFAULT_WEEKLY_GOALS)
    expect(earned).toContain('checkpoint')
    expect(earned).not.toContain('fullGoal')
  })

  it('reports the full-goal crossing', () => {
    const earned = newlyEarned({ workouts: 1, flex: 2, calDays: 6 }, { workouts: 2, flex: 2, calDays: 6 }, DEFAULT_WEEKLY_GOALS)
    expect(earned).toContain('workoutGoal')
    expect(earned).toContain('fullGoal')
  })
})

describe('composeCelebration', () => {
  it('returns null when nothing was earned', () => {
    expect(composeCelebration([null, null])).toBeNull()
  })

  it('promotes the loudest tier to the headline and lists the rest as details', () => {
    const pr = prCelebration([{ exercise: 'Bench', est1RM: 225 }])
    const goal = achievementCelebration('fullGoal', { workouts: 2, flex: 2, calDays: 6 }, DEFAULT_WEEKLY_GOALS)
    const c = composeCelebration([goal, pr])
    expect(c?.tier).toBe('epic')
    expect(c?.title).toBe('NEW PR!')
    expect(c?.details).toContain('Weekly goal complete!')
  })
})
