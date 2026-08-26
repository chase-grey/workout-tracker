import { describe, expect, it } from 'vitest'
import type { WorkoutRow } from '../types'
import { DEFAULT_WEEKLY_GOALS } from './weeklyStreak'
import {
  achievementCelebration,
  baselineCelebration,
  checkpointFraction,
  composeCelebration,
  currentWeekCounts,
  detectPRs,
  newlyEarned,
  overallProgress,
  prCelebration,
  stretchDoneCelebration,
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
  it('flags an all-time est-1RM PR once a lift has ≥2 days of history', () => {
    const prev = [
      row({ exercise: 'flat_bench', date: '2026-07-14', weight_lbs: 100, reps: 5 }),
      row({ exercise: 'flat_bench', date: '2026-07-18', weight_lbs: 100, reps: 5 }),
    ]
    const added = [row({ exercise: 'flat_bench', weight_lbs: 100, reps: 8 })]
    const prs = detectPRs(prev, added)
    expect(prs).toHaveLength(1)
    expect(prs[0].est1RM).toBeCloseTo(126.7, 1)
  })

  it('does not count the first-ever entry for a lift as a PR', () => {
    expect(detectPRs([], [row({ exercise: 'flat_bench', weight_lbs: 135, reps: 5 })])).toHaveLength(0)
  })

  it('does not crown a PR when the lift has only ONE day of history', () => {
    // A real prior best exists, but on a single day — no genuine baseline yet.
    const prev = [row({ exercise: 'flat_bench', date: '2026-07-18', weight_lbs: 100, reps: 5 })]
    const added = [row({ exercise: 'flat_bench', weight_lbs: 100, reps: 10 })]
    expect(detectPRs(prev, added)).toHaveLength(0)
  })

  it('counts distinct days, not distinct rows on the same day', () => {
    // Two sets, same day → still only one day of history → no PR.
    const prev = [
      row({ exercise: 'flat_bench', date: '2026-07-18', set_number: 1, weight_lbs: 100, reps: 5 }),
      row({ exercise: 'flat_bench', date: '2026-07-18', set_number: 2, weight_lbs: 105, reps: 5 }),
    ]
    const added = [row({ exercise: 'flat_bench', weight_lbs: 150, reps: 5 })]
    expect(detectPRs(prev, added)).toHaveLength(0)
  })

  it('ignores sets that fail to beat the prior best', () => {
    const prev = [
      row({ exercise: 'flat_bench', date: '2026-07-14', weight_lbs: 200, reps: 5 }),
      row({ exercise: 'flat_bench', date: '2026-07-18', weight_lbs: 200, reps: 5 }),
    ]
    const added = [row({ exercise: 'flat_bench', weight_lbs: 135, reps: 5 })]
    expect(detectPRs(prev, added)).toHaveLength(0)
  })

  it('sorts multiple PRs heaviest first', () => {
    const prev = [
      row({ exercise: 'flat_bench', date: '2026-07-14', weight_lbs: 100, reps: 5 }),
      row({ exercise: 'flat_bench', date: '2026-07-18', weight_lbs: 100, reps: 5 }),
      row({ exercise: 'squat', date: '2026-07-14', weight_lbs: 100, reps: 5 }),
      row({ exercise: 'squat', date: '2026-07-18', weight_lbs: 100, reps: 5 }),
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

describe('baselineCelebration', () => {
  it('is null when nothing was beaten', () => {
    expect(baselineCelebration([])).toBeNull()
  })

  it('leads with the first name and lists the rest as details', () => {
    const c = baselineCelebration(['Bench', 'Squat'])
    expect(c?.tier).toBe('medium')
    expect(c?.title).toBe('new baselines set')
    expect(c?.details).toEqual(['Squat'])
  })
})

describe('currentWeekCounts', () => {
  it('counts distinct training days, stretch days, and calorie-goal days this week', () => {
    const workouts = [
      row({ session_id: 'a', date: '2026-07-20' }),
      row({ session_id: 'a', date: '2026-07-20' }), // same session — counts once
      row({ session_id: 'b', date: '2026-07-21' }),
      row({ session_id: 'c', date: '2026-07-21', exercise: 'deadbug' }), // core-only, supplemental → excluded
      row({ session_id: 'd', date: '2026-07-10' }), // prior week
    ]
    const flexDates = ['2026-07-20', '2026-07-20', '2026-07-13']
    const cals = [
      { date: '2026-07-21', calories: 4000 },
      { date: '2026-07-19', calories: 2000 }, // under goal
    ]
    const pills = [
      { date: '2026-07-20', vitamins: true, iron: true },
      { date: '2026-07-21', vitamins: true, iron: false }, // iron already in yesterday
      { date: '2026-07-12', vitamins: true, iron: true }, // prior week
    ]
    const strips = [
      { date: '2026-07-20', strips: true },
      { date: '2026-07-21', strips: false }, // logged, then undone
      { date: '2026-07-13', strips: true }, // prior week
    ]
    const counts = currentWeekCounts(workouts, flexDates, cals, pills, strips, TODAY)
    expect(counts).toEqual({
      workouts: 2,
      flex: 1,
      calDays: 1,
      vitaminDays: 2,
      whiteningDays: 1,
    })
  })

  it('leaves out a day that skipped the iron it owed', () => {
    const pills = [{ date: '2026-07-21', vitamins: true, iron: false }]
    expect(currentWeekCounts([], [], [], pills, [], TODAY).vitaminDays).toBe(0)
  })

  it('counts two workouts in one day as one', () => {
    const workouts = [
      row({ session_id: 'am', date: '2026-07-21', day_type: 'push' }),
      row({ session_id: 'pm', date: '2026-07-21', day_type: 'pull' }),
    ]
    expect(currentWeekCounts(workouts, [], [], [], [], TODAY).workouts).toBe(1)
  })
})

describe('weekAchievements', () => {
  const g = DEFAULT_WEEKLY_GOALS

  it('marks full goal when every target is met exactly', () => {
    expect(
      weekAchievements(
        { workouts: 2, flex: 3, calDays: 6, vitaminDays: 6, whiteningDays: 6 },
        g,
      ),
    ).toEqual({
      workoutGoal: true,
      flexGoal: true,
      calGoal: true,
      vitaminGoal: true,
      whiteningGoal: true,
      checkpoint: true,
      fullGoal: true,
      exceeded: false,
    })
  })

  it('withholds the full goal until the pills are in too', () => {
    const a = weekAchievements(
      { workouts: 2, flex: 3, calDays: 6, vitaminDays: 5, whiteningDays: 6 },
      g,
    )
    expect(a.vitaminGoal).toBe(false)
    expect(a.fullGoal).toBe(false)
  })

  it('withholds the full goal until the strips are in too', () => {
    const a = weekAchievements(
      { workouts: 2, flex: 3, calDays: 6, vitaminDays: 6, whiteningDays: 5 },
      g,
    )
    expect(a.whiteningGoal).toBe(false)
    expect(a.fullGoal).toBe(false)
  })

  it('marks exceeded only once the full goal is met and a metric is over', () => {
    expect(
      weekAchievements(
        { workouts: 3, flex: 3, calDays: 6, vitaminDays: 6, whiteningDays: 6 },
        g,
      ).exceeded,
    ).toBe(true)
    // Over on workouts but flex/cal unmet → not exceeded (full goal not reached).
    expect(
      weekAchievements(
        { workouts: 3, flex: 0, calDays: 0, vitaminDays: 0, whiteningDays: 0 },
        g,
      ).exceeded,
    ).toBe(false)
  })

  it('reaches the checkpoint at the half-goal marker', () => {
    const half = { workouts: 1, flex: 2, calDays: 5, vitaminDays: 5, whiteningDays: 5 }
    expect(overallProgress(half, g)).toBeCloseTo(checkpointFraction(g), 6)
    expect(weekAchievements(half, g).checkpoint).toBe(true)
    expect(
      weekAchievements(
        { workouts: 0, flex: 0, calDays: 0, vitaminDays: 0, whiteningDays: 0 },
        g,
      ).checkpoint,
    ).toBe(false)
  })
})

describe('newlyEarned', () => {
  it('returns only achievements that flipped false → true', () => {
    const earned = newlyEarned(
      { workouts: 1, flex: 2, calDays: 4, vitaminDays: 5, whiteningDays: 5 },
      { workouts: 1, flex: 2, calDays: 5, vitaminDays: 5, whiteningDays: 5 },
      DEFAULT_WEEKLY_GOALS,
    )
    expect(earned).toContain('checkpoint')
    expect(earned).not.toContain('fullGoal')
  })

  it('reports the full-goal crossing', () => {
    const earned = newlyEarned(
      { workouts: 1, flex: 3, calDays: 6, vitaminDays: 6, whiteningDays: 6 },
      { workouts: 2, flex: 3, calDays: 6, vitaminDays: 6, whiteningDays: 6 },
      DEFAULT_WEEKLY_GOALS,
    )
    expect(earned).toContain('workoutGoal')
    expect(earned).toContain('fullGoal')
  })

  it('reports the pill goal on its own crossing', () => {
    const earned = newlyEarned(
      { workouts: 0, flex: 0, calDays: 0, vitaminDays: 5, whiteningDays: 0 },
      { workouts: 0, flex: 0, calDays: 0, vitaminDays: 6, whiteningDays: 0 },
      DEFAULT_WEEKLY_GOALS,
    )
    expect(earned).toEqual(['vitaminGoal'])
  })

  it('reports the strip goal on its own crossing', () => {
    const earned = newlyEarned(
      { workouts: 0, flex: 0, calDays: 0, vitaminDays: 0, whiteningDays: 5 },
      { workouts: 0, flex: 0, calDays: 0, vitaminDays: 0, whiteningDays: 6 },
      DEFAULT_WEEKLY_GOALS,
    )
    expect(earned).toEqual(['whiteningGoal'])
  })
})

describe('composeCelebration', () => {
  it('returns null when nothing was earned', () => {
    expect(composeCelebration([null, null])).toBeNull()
  })

  it('promotes the loudest tier to the headline and lists the rest as details', () => {
    const pr = prCelebration([{ exercise: 'Bench', est1RM: 225 }])
    const goal = achievementCelebration(
      'fullGoal',
      { workouts: 2, flex: 3, calDays: 6, vitaminDays: 6, whiteningDays: 6 },
      DEFAULT_WEEKLY_GOALS,
    )
    const c = composeCelebration([goal, pr])
    expect(c?.tier).toBe('epic')
    expect(c?.title).toBe('new pr!')
    expect(c?.details).toContain('weekly goal complete!')
  })

  it('keeps the ack flag when a louder win leads the session-end cheer', () => {
    const goal = achievementCelebration(
      'fullGoal',
      { workouts: 2, flex: 3, calDays: 6, vitaminDays: 6, whiteningDays: 6 },
      DEFAULT_WEEKLY_GOALS,
    )
    const c = composeCelebration([goal, stretchDoneCelebration])
    expect(c?.title).toBe('weekly goal complete!')
    expect(c?.ack).toBe(true)
  })

  it('leaves ack unset when nothing earned asks for it', () => {
    const goal = achievementCelebration(
      'checkpoint',
      { workouts: 1, flex: 2, calDays: 3, vitaminDays: 3, whiteningDays: 3 },
      DEFAULT_WEEKLY_GOALS,
    )
    expect(composeCelebration([goal])?.ack).toBeUndefined()
  })
})
