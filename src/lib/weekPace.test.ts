import { describe, expect, it } from 'vitest'
import { DAYS_IN_WEEK, requiredByNow, weekDaysCompleted, weekPace } from './weekPace'
import { DEFAULT_WEEKLY_GOALS, type WeeklyGoalConfig } from './weeklyStreak'

// 2026-06-15 is a Monday; the Mon–Sun week runs 06-15 … 06-21.
const MON = 15
const at = (day: number, hour = 9) => new Date(2026, 5, day, hour)

const G: WeeklyGoalConfig = DEFAULT_WEEKLY_GOALS // 2 workouts, 2 flex, 6 calorie days

describe('weekDaysCompleted', () => {
  it('is 0 for all of Monday — the day in progress never counts', () => {
    expect(weekDaysCompleted(at(MON, 0))).toBe(0)
    expect(weekDaysCompleted(at(MON, 23))).toBe(0)
  })

  it('steps once at each midnight boundary', () => {
    expect(weekDaysCompleted(at(MON + 1, 0))).toBe(1)
    expect(weekDaysCompleted(at(MON + 1, 23))).toBe(1)
    expect(weekDaysCompleted(at(MON + 3))).toBe(3)
  })

  it('tops out at 6 during Sunday and resets on the next Monday', () => {
    expect(weekDaysCompleted(new Date(2026, 5, MON + 6, 23, 59, 59, 999))).toBe(6)
    expect(weekDaysCompleted(at(MON + 7, 0))).toBe(0)
  })
})

describe('requiredByNow', () => {
  it('asks for nothing until a whole unit is genuinely due', () => {
    // Two workouts across seven days: one by the end of Thursday (4 days done),
    // the other by the end of Sunday — which the week never reaches.
    expect([0, 1, 2, 3, 4, 5, 6].map((c) => requiredByNow(2, c))).toEqual([0, 0, 0, 0, 1, 1, 1])
  })

  it('spreads a near-daily goal one unit at a time', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((c) => requiredByNow(6, c))).toEqual([0, 0, 1, 2, 3, 4, 5])
  })

  it('never demands the whole goal, since the last day is always still in play', () => {
    for (const goal of [1, 2, 3, 6, 7, 14]) {
      expect(requiredByNow(goal, DAYS_IN_WEEK - 1)).toBeLessThan(goal)
    }
  })

  it('is zero for a goal of zero rather than NaN', () => {
    expect(requiredByNow(0, 4)).toBe(0)
  })
})

describe('weekPace — the schedule marker', () => {
  it('sits at zero all of Monday, so an untouched week is never already behind', () => {
    const p = weekPace({ workouts: 0, flex: 0, calDays: 0 }, G, at(MON, 16))
    expect(p.requiredFraction).toBe(0)
    expect(p.metrics.every((m) => m.required === 0)).toBe(true)
  })

  it('holds still through the day it is judging', () => {
    const morning = weekPace({ workouts: 0, flex: 0, calDays: 2 }, G, at(MON + 2, 6))
    const night = weekPace({ workouts: 0, flex: 0, calDays: 2 }, G, at(MON + 2, 23))
    expect(morning.requiredFraction).toBe(night.requiredFraction)
  })

  it('climbs monotonically across the week', () => {
    let prev = -1
    for (let d = MON; d <= MON + 6; d++) {
      const frac = weekPace({ workouts: 0, flex: 0, calDays: 0 }, G, at(d)).requiredFraction
      expect(frac).toBeGreaterThanOrEqual(prev)
      prev = frac
    }
  })

  it('is behind on a metric only once a scheduled unit went unbanked', () => {
    // Friday (4 days done): one workout was due by the end of Thursday.
    const none = weekPace({ workouts: 0, flex: 0, calDays: 3 }, G, at(MON + 4))
    expect(none.metrics.find((m) => m.key === 'workouts')!.required).toBe(1)
    const one = weekPace({ workouts: 1, flex: 1, calDays: 3 }, G, at(MON + 4))
    expect(one.metrics.every((m) => m.done >= m.required)).toBe(true)
  })
})

describe('weekPace — the buffer', () => {
  it('reads the spare day a 6-of-7 goal allows at the start of the week', () => {
    const p = weekPace({ workouts: 0, flex: 0, calDays: 0 }, G, at(MON))
    expect(p.buffer).toBe(1)
    expect(p.binding?.key).toBe('calDays')
  })

  it('calls out no room left even when the overall bar looks well ahead', () => {
    // Saturday, two workouts and two flex banked, four calorie days: the mean
    // progress is ~89% against a ~56% marker, but the two remaining calorie days
    // need the two remaining days. This is the case an averaged bar gets wrong.
    const counts = { workouts: 2, flex: 2, calDays: 4 }
    const p = weekPace(counts, G, at(MON + 5))
    expect(p.requiredFraction).toBeLessThan(0.6)
    expect(p.buffer).toBe(0)
    expect(p.binding?.key).toBe('calDays')
  })

  it('goes negative once a goal can no longer be reached', () => {
    // Sunday with three calorie days logged: three more owed, one day left.
    const p = weekPace({ workouts: 2, flex: 2, calDays: 3 }, G, at(MON + 6))
    expect(p.buffer).toBe(-2)
    expect(p.binding?.key).toBe('calDays')
  })

  it('never binds on a metric already met, and drops the binding once all are', () => {
    const partly = weekPace({ workouts: 2, flex: 0, calDays: 6 }, G, at(MON + 3))
    expect(partly.binding?.key).toBe('flex')

    const done = weekPace({ workouts: 2, flex: 2, calDays: 6 }, G, at(MON + 3))
    expect(done.binding).toBeNull()
    expect(done.buffer).toBe(4) // every day left is spare
  })

  it('counts overshoot as met rather than as extra room', () => {
    const p = weekPace({ workouts: 5, flex: 2, calDays: 6 }, G, at(MON + 2))
    expect(p.metrics.find((m) => m.key === 'workouts')!.remaining).toBe(0)
    expect(p.binding).toBeNull()
  })

  it('breaks a tie on the first-listed metric', () => {
    // Tuesday: workouts and flex each owe 2 of 6 days left, so both slack 4.
    const p = weekPace({ workouts: 0, flex: 0, calDays: 6 }, G, at(MON + 1))
    expect(p.buffer).toBe(4)
    expect(p.binding?.key).toBe('workouts')
  })
})
