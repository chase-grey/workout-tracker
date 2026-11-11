import { afterEach, describe, it, expect } from 'vitest'
import type { Profile } from './profile'
import { setActiveProfile } from './profileStore'
import { calorieGoalOn, calorieHitDates, type CalorieEntry } from './calories'
import {
  classifyWeek,
  weeklyGoalsFor,
  weeklyStreakHistory,
  WEEKLY_GOAL_HISTORY,
  type WeeklyGoalConfig,
} from './weeklyStreak'
import { overallProgress, weekAchievements, type WeekCounts } from './celebration'
import { weekPace } from './weekPace'

afterEach(() => setActiveProfile(null))

const ALL_PILLARS: Profile['pillars'] = ['strength', 'flexibility', 'cardio', 'diet']

function makeProfile(over: Partial<Profile> = {}): Profile {
  return {
    name: 'Test',
    pillars: ALL_PILLARS,
    weeklyGoals: [{ from: '0000-01-01', goals: { workouts: 3, flex: 2, calDays: 5, cardio: 2 } }],
    calorieGoals: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

// Fixed reference: Friday 2026-07-10. Its week starts Monday 2026-07-06.
const WEEK = '2026-07-06'
const SHIPPED = WEEKLY_GOAL_HISTORY[0].goals

describe('weeklyGoalsFor with a profile', () => {
  it('returns the shipped goals with no active profile', () => {
    expect(weeklyGoalsFor(WEEK)).toEqual(SHIPPED)
  })

  it("returns the profile's own goals with one active", () => {
    setActiveProfile(makeProfile())
    expect(weeklyGoalsFor(WEEK)).toEqual({ workouts: 3, flex: 2, calDays: 5, cardio: 2 })
  })

  it('holds a week to its own entry, whatever is switched on today', () => {
    setActiveProfile(makeProfile({ pillars: ['strength'] }))
    expect(weeklyGoalsFor(WEEK)).toEqual({ workouts: 3, flex: 2, calDays: 5, cardio: 2 })
  })
})

describe('calorieGoalOn with a profile', () => {
  it('returns the shipped target with no active profile', () => {
    expect(calorieGoalOn('2026-07-08')).toBe(4000)
    expect(calorieGoalOn('2026-11-02')).toBe(4500)
  })

  it("returns the profile's own target with one active", () => {
    setActiveProfile(makeProfile({ calorieGoals: [{ from: '0000-01-01', goal: 2200 }] }))
    expect(calorieGoalOn('2026-07-08')).toBe(2200)
    expect(calorieGoalOn('2026-11-02')).toBe(2200)
  })

  it('falls back to the shipped target when the profile has not set one', () => {
    setActiveProfile(makeProfile({ calorieGoals: [] }))
    expect(calorieGoalOn('2026-07-08')).toBe(4000)
  })
})

describe('calorieHitDates with a profile', () => {
  it("counts days at or under the goal for a 'lose' profile and ignores zero-total days", () => {
    setActiveProfile(
      makeProfile({
        dietDirection: 'lose',
        calorieGoals: [{ from: '0000-01-01', goal: 2000 }],
      }),
    )
    const entries: CalorieEntry[] = [
      { date: '2026-07-08', calories: 1800 }, // under: hit
      { date: '2026-07-09', calories: 2400 }, // over: miss
      { date: '2026-07-10', calories: 0 }, // logged as zero: not a hit
    ]
    expect(calorieHitDates(entries)).toEqual(['2026-07-08'])
  })

  it("counts days at or over the goal for a 'gain' profile", () => {
    setActiveProfile(
      makeProfile({
        dietDirection: 'gain',
        calorieGoals: [{ from: '0000-01-01', goal: 2000 }],
      }),
    )
    const entries: CalorieEntry[] = [
      { date: '2026-07-08', calories: 1800 },
      { date: '2026-07-09', calories: 2400 },
    ]
    expect(calorieHitDates(entries)).toEqual(['2026-07-09'])
  })
})

describe('classifyWeek with a cardio goal', () => {
  const config: WeeklyGoalConfig = { workouts: 2, flex: 2, calDays: 6, cardio: 2 }

  it('is short when cardio is under its goal', () => {
    expect(classifyWeek({ workouts: 2, flex: 2, calDays: 6, cardio: 1 }, config)).toEqual({
      tier: 'short',
      exceeded: false,
      earned: 0,
      cost: 1,
    })
  })

  it('is full when all four goals are met', () => {
    expect(classifyWeek({ workouts: 2, flex: 2, calDays: 6, cardio: 2 }, config)).toEqual({
      tier: 'full',
      exceeded: false,
      earned: 0,
      cost: 0,
    })
  })

  it('earns a freeze for surplus cardio days', () => {
    expect(classifyWeek({ workouts: 2, flex: 2, calDays: 6, cardio: 4 }, config)).toEqual({
      tier: 'full',
      exceeded: true,
      earned: 2,
      cost: 0,
    })
  })

  it('behaves as before for a config with no cardio field', () => {
    const legacy: WeeklyGoalConfig = { workouts: 2, flex: 2, calDays: 6 }
    expect(classifyWeek({ workouts: 2, flex: 2, calDays: 6, cardio: 9 }, legacy)).toEqual({
      tier: 'full',
      exceeded: false,
      earned: 0,
      cost: 0,
    })
    expect(classifyWeek({ workouts: 2, flex: 2, calDays: 6 }, legacy)).toEqual({
      tier: 'full',
      exceeded: false,
      earned: 0,
      cost: 0,
    })
    expect(classifyWeek({ workouts: 1, flex: 2, calDays: 6 }, legacy)).toMatchObject({
      tier: 'short',
      cost: 1,
    })
  })
})

describe('weeklyStreakHistory with cardioDates', () => {
  it('counts distinct cardio days per week', () => {
    const history = weeklyStreakHistory({
      workoutDates: ['2026-06-15', '2026-06-22'],
      flexDates: ['2026-06-15', '2026-06-22'],
      calorieHitDates: [],
      // Two days in the week of 2026-06-15 (one repeated), one in the week of 2026-06-22.
      cardioDates: ['2026-06-15', '2026-06-16', '2026-06-16', '2026-06-22'],
      today: new Date(2026, 6, 10),
      config: { workouts: 1, flex: 1, calDays: 0, cardio: 2 },
    })
    const byWeek = Object.fromEntries(history.map((w) => [w.week, w.counts.cardio]))
    // The empty week of 2026-06-29 is replayed too, with no cardio in it.
    expect(byWeek).toEqual({ '2026-06-15': 2, '2026-06-22': 1, '2026-06-29': 0 })
  })
})

describe('overallProgress', () => {
  const goals: WeeklyGoalConfig = { workouts: 2, flex: 2, calDays: 6, cardio: 2 }

  it('averages the capped ratio over every goal above zero', () => {
    const counts: WeekCounts = { workouts: 1, flex: 2, calDays: 3, cardio: 1 }
    // 1/2, 2/2, 3/6, 1/2 -> mean of 0.5, 1, 0.5, 0.5
    expect(overallProgress(counts, goals)).toBeCloseTo(0.625, 10)
  })

  it('caps each ratio at 1', () => {
    expect(overallProgress({ workouts: 9, flex: 9, calDays: 9, cardio: 9 }, goals)).toBe(1)
  })

  it('leaves out goals of 0 rather than averaging them in', () => {
    const offGoals: WeeklyGoalConfig = { workouts: 2, flex: 0, calDays: 0, cardio: 0 }
    expect(overallProgress({ workouts: 1, flex: 0, calDays: 0, cardio: 0 }, offGoals)).toBeCloseTo(0.5, 10)
  })

  it('is 0 when every goal is 0', () => {
    const none: WeeklyGoalConfig = { workouts: 0, flex: 0, calDays: 0, cardio: 0 }
    expect(overallProgress({ workouts: 3, flex: 3, calDays: 3, cardio: 3 }, none)).toBe(0)
  })
})

describe('weekAchievements', () => {
  it('reports the cardio goal', () => {
    const goals: WeeklyGoalConfig = { workouts: 2, flex: 2, calDays: 6, cardio: 2 }
    expect(weekAchievements({ workouts: 2, flex: 2, calDays: 6, cardio: 2 }, goals)).toMatchObject({
      cardioGoal: true,
      fullGoal: true,
      exceeded: false,
    })
    expect(weekAchievements({ workouts: 2, flex: 2, calDays: 6, cardio: 1 }, goals)).toMatchObject({
      cardioGoal: false,
      fullGoal: false,
    })
  })

  it('never counts a goal of 0 as exceeded', () => {
    const goals: WeeklyGoalConfig = { workouts: 0, flex: 2, calDays: 6, cardio: 2 }
    const got = weekAchievements({ workouts: 3, flex: 2, calDays: 6, cardio: 2 }, goals)
    expect(got.fullGoal).toBe(true)
    expect(got.exceeded).toBe(false)
  })

  it('does not count a zero cardio goal as exceeded either', () => {
    const goals: WeeklyGoalConfig = { workouts: 2, flex: 2, calDays: 6, cardio: 0 }
    const got = weekAchievements({ workouts: 2, flex: 2, calDays: 6, cardio: 5 }, goals)
    expect(got).toMatchObject({ cardioGoal: true, fullGoal: true, exceeded: false })
  })
})

describe('weekPace', () => {
  // Wednesday 2026-07-08 at noon: two days of the week have ended.
  const NOW = new Date(2026, 6, 8, 12, 0)

  it('leaves a goal-0 metric out of metrics entirely', () => {
    const pace = weekPace(
      { workouts: 0, flex: 1, calDays: 3, cardio: 4 },
      { workouts: 0, flex: 2, calDays: 6, cardio: 0 },
      NOW,
    )
    expect(pace.metrics.map((m) => m.key)).toEqual(['flex', 'calDays'])
  })

  it('includes cardio when its goal is above 0', () => {
    const pace = weekPace(
      { workouts: 0, flex: 1, calDays: 3, cardio: 0 },
      { workouts: 0, flex: 2, calDays: 6, cardio: 2 },
      NOW,
    )
    expect(pace.metrics.map((m) => m.key)).toEqual(['flex', 'calDays', 'cardio'])
    const cardio = pace.metrics.find((m) => m.key === 'cardio')
    expect(cardio).toMatchObject({ done: 0, goal: 2, remaining: 2 })
  })
})
