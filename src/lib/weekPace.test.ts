import { describe, expect, it } from 'vitest'
import { DAYS_IN_WEEK, requiredByNow, weekDaysCompleted, weekPace } from './weekPace'
import { DEFAULT_WEEKLY_GOALS, type WeeklyGoalConfig } from './weeklyStreak'

// 2026-06-15 is a Monday; the Mon–Sun week runs 06-15 … 06-21.
const MON = 15
const at = (day: number, hour = 9) => new Date(2026, 5, day, hour)

// The shipped workout, flexibility, and calorie goals.
const G: WeeklyGoalConfig = DEFAULT_WEEKLY_GOALS

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
  it('starts Monday at 6pm and resets the following Monday', () => {
    expect(requiredByNow(2, at(MON, 9))).toBe(0)
    expect(requiredByNow(2, at(MON, 18))).toBe(0)
    expect(requiredByNow(2, at(MON, 19))).toBeGreaterThan(0)
    expect(requiredByNow(2, at(MON + 7, 9))).toBe(0)
  })
  it('moves proportionally through Sunday at 9pm', () => {
    expect(requiredByNow(2, at(MON + 1, 18))).toBeCloseTo(2 * 24 / 147)
    expect(requiredByNow(2, new Date(2026, 5, MON + 3, 19, 30))).toBe(1)
    expect(requiredByNow(2, at(MON + 6, 21))).toBe(2)
    expect(requiredByNow(2, at(MON + 6, 23))).toBe(2)
  })
  it('finishes flex Saturday at 9pm', () => {
    expect(requiredByNow(3, at(MON + 5, 20), 6)).toBeLessThan(3)
    expect(requiredByNow(3, at(MON + 5, 21), 6)).toBe(3)
    expect(requiredByNow(3, at(MON + 6), 6)).toBe(3)
    expect(requiredByNow(3, at(MON + 5, 21), DAYS_IN_WEEK)).toBeLessThan(3)
  })
  it('uses local evening deadlines in daylight saving transition weeks', () => {
    for (const month of [2, 10]) {
      const sunday = new Date(2026, month, month === 2 ? 8 : 1, 21)
      expect(requiredByNow(2, sunday)).toBe(2)
      sunday.setHours(20)
      expect(requiredByNow(2, sunday)).toBeLessThan(2)
    }
  })
  it('handles zero goals', () => {
    expect(requiredByNow(0, at(MON + 3))).toBe(0)
  })
})

describe('weekPace — the schedule marker', () => {
  it('sits at zero before Monday evening', () => {
    const p = weekPace({ workouts: 0, flex: 0, calDays: 0 }, G, at(MON, 16))
    expect(p.requiredFraction).toBe(0)
    expect(p.metrics.every((m) => m.required === 0)).toBe(true)
  })

  it('advances throughout the day', () => {
    const morning = weekPace({ workouts: 0, flex: 0, calDays: 2 }, G, at(MON + 2, 6))
    const night = weekPace({ workouts: 0, flex: 0, calDays: 2 }, G, at(MON + 2, 23))
    expect(morning.requiredFraction).toBeLessThan(night.requiredFraction)
  })

  it('climbs monotonically across the week', () => {
    let prev = -1
    for (let d = MON; d <= MON + 6; d++) {
      const frac = weekPace({ workouts: 0, flex: 0, calDays: 0 }, G, at(d)).requiredFraction
      expect(frac).toBeGreaterThanOrEqual(prev)
      prev = frac
    }
  })

  it('holds flex to its Mon–Sat window rather than the whole week', () => {
    const flexRequired = (d: number) =>
      weekPace({ workouts: 0, flex: 0, calDays: 0 }, G, at(d))
        .metrics.find((m) => m.key === 'flex')!.required
    expect(flexRequired(MON + 3)).toBeCloseTo(3 * 63 / 123)
    expect(flexRequired(MON + 4)).toBeCloseTo(3 * 87 / 123)
    expect(flexRequired(MON + 6)).toBe(3)
  })

  it('finishes at the end of the bar at 9pm Sunday, where the marker retires', () => {
    const before = weekPace({ workouts: 0, flex: 0, calDays: 0 }, G, at(MON + 6, 20))
    expect(before.requiredFraction).toBeLessThan(1)

    const after = weekPace({ workouts: 0, flex: 0, calDays: 0 }, G, at(MON + 6, 21))
    expect(after.requiredFraction).toBe(1)
    expect(after.metrics.every((m) => m.required === m.goal)).toBe(true)
  })

  it('leaves the last three hours open even with the schedule finished', () => {
    // 9pm Sunday, a calorie day short: the whole goal is due, but the day it can
    // still be logged on has not ended, so nothing is lost yet.
    const p = weekPace({ workouts: 2, flex: 3, calDays: 5 }, G, at(MON + 6, 21))
    expect(p.requiredFraction).toBe(1)
    expect(p.binding?.key).toBe('calDays')
    expect(p.binding?.missed).toBe(false)
    expect(p.buffer).toBe(0)
  })

  it('keeps the target independent of completed sessions', () => {
    const none = weekPace({ workouts: 0, flex: 0, calDays: 0 }, G, at(MON + 3))
    const done = weekPace({ workouts: 2, flex: 3, calDays: 6 }, G, at(MON + 3))
    expect(none.requiredFraction).toBe(done.requiredFraction)
    expect(none.metrics.map((m) => m.required)).toEqual(done.metrics.map((m) => m.required))
    expect(none.requiredFraction).toBeCloseTo((63 / 147 * 2 + 63 / 123) / 3)
  })
})

describe('weekPace — the buffer', () => {
  it('reads the spare day a 6-of-7 goal allows at the start of the week', () => {
    const p = weekPace({ workouts: 0, flex: 0, calDays: 0 }, G, at(MON))
    expect(p.buffer).toBe(1)
    expect(p.binding?.key).toBe('calDays')
  })

  it('calls out no room left even when the overall bar looks well ahead', () => {
    // Saturday, the workouts and all three flex banked, four calorie days:
    // progress is ahead of the schedule marker, but the two remaining
    // calorie days need the two remaining days. This is the case an averaged bar
    // gets wrong.
    const counts = { workouts: 2, flex: 3, calDays: 4 }
    const p = weekPace(counts, G, at(MON + 5))
    expect(p.requiredFraction).toBeCloseTo((111 / 147 * 2 + 111 / 123) / 3)
    expect(p.buffer).toBe(0)
    expect(p.binding?.key).toBe('calDays')
  })

  it('binds on flex once its own window runs out, days before the week does', () => {
    // Thursday with no flex done: four days are left in the week, but only two of
    // them are days flex actually happens on, and both sessions are still owed.
    const p = weekPace({ workouts: 1, flex: 0, calDays: 3 }, G, at(MON + 3))
    expect(p.binding?.key).toBe('flex')
    expect(p.buffer).toBe(0)
    expect(p.binding?.missed).toBe(false)
  })

  it('separates falling off the flex plan from losing the goal outright', () => {
    // Saturday, one session short: past the plan, still reachable this week.
    const sat = weekPace({ workouts: 2, flex: 1, calDays: 6 }, G, at(MON + 5))
    expect(sat.buffer).toBe(-1)
    expect(sat.binding?.missed).toBe(false)

    // Sunday, both short: one day left can only carry one session.
    const sun = weekPace({ workouts: 2, flex: 0, calDays: 6 }, G, at(MON + 6))
    expect(sun.binding?.key).toBe('flex')
    expect(sun.binding?.missed).toBe(true)
  })

  it('does not bind on flex once it is done, even with its window closed', () => {
    // Saturday: flex is met and out of window, so its slack is 0 too — the unmet
    // workouts are what the week hangs on.
    const p = weekPace({ workouts: 0, flex: 3, calDays: 6 }, G, at(MON + 5))
    expect(p.binding?.key).toBe('workouts')
    expect(p.buffer).toBe(0)
  })

  it('goes negative once a goal can no longer be reached', () => {
    // Sunday with three calorie days logged: three more owed, one day left.
    const p = weekPace({ workouts: 2, flex: 3, calDays: 3 }, G, at(MON + 6))
    expect(p.buffer).toBe(-2)
    expect(p.binding?.key).toBe('calDays')
  })

  it('never binds on a metric already met, and drops the binding once all are', () => {
    const partly = weekPace({ workouts: 2, flex: 0, calDays: 6 }, G, at(MON + 3))
    expect(partly.binding?.key).toBe('flex')

    const done = weekPace({ workouts: 2, flex: 3, calDays: 6 }, G, at(MON + 3))
    expect(done.binding).toBeNull()
    expect(done.buffer).toBe(4) // every day left is spare
  })

  it('counts overshoot as met rather than as extra room', () => {
    const p = weekPace({ workouts: 5, flex: 3, calDays: 6 }, G, at(MON + 2))
    expect(p.metrics.find((m) => m.key === 'workouts')!.remaining).toBe(0)
    expect(p.binding).toBeNull()
  })

  it('breaks a tie on the first-listed metric', () => {
    // Tuesday: workouts owes 2 and calorie days owes 2, both of the same six
    // days left, so both slack 4.
    const p = weekPace({ workouts: 0, flex: 3, calDays: 4 }, G, at(MON + 1))
    expect(p.buffer).toBe(4)
    expect(p.binding?.key).toBe('workouts')
  })
})
