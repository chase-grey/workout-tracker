import { describe, expect, it } from 'vitest'
import { DAYS_IN_WEEK, requiredByNow, weekDaysCompleted, weekDaysDue, weekPace } from './weekPace'
import { DEFAULT_WEEKLY_GOALS, type WeeklyGoalConfig } from './weeklyStreak'

// 2026-06-15 is a Monday; the Mon–Sun week runs 06-15 … 06-21.
const MON = 15
const at = (day: number, hour = 9) => new Date(2026, 5, day, hour)

// 2 workouts, 2 flex, 6 calorie days, 6 pill days. The pill goal matches the
// calorie one in size and window, so the counts below give it the same value as
// calorie days: it rides along instead of becoming the binding metric in every
// case these were written to pin down.
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

describe('weekDaysDue', () => {
  it('tracks ended days up to Sunday', () => {
    expect(weekDaysDue(at(MON, 23))).toBe(0)
    expect(weekDaysDue(at(MON + 3))).toBe(3)
    expect(weekDaysDue(at(MON + 6, 20))).toBe(6)
  })

  it('brings the last day due at 9pm Sunday, not midnight', () => {
    expect(weekDaysDue(at(MON + 6, 21))).toBe(DAYS_IN_WEEK)
    expect(weekDaysDue(new Date(2026, 5, MON + 6, 23, 59, 59, 999))).toBe(DAYS_IN_WEEK)
    // 9pm on any earlier day is just that day in progress.
    expect(weekDaysDue(at(MON + 5, 21))).toBe(5)
  })
})

describe('requiredByNow', () => {
  it('asks for nothing until a whole unit is genuinely due', () => {
    // Two workouts across seven days: one by the end of Thursday (4 days done),
    // the other by Sunday's deadline.
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((c) => requiredByNow(2, c))).toEqual([0, 0, 0, 0, 1, 1, 1, 2])
  })

  it('spreads a near-daily goal one unit at a time', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((c) => requiredByNow(6, c))).toEqual([0, 0, 1, 2, 3, 4, 5, 6])
  })

  it('packs a short window into its own days and comes due at its end', () => {
    // Two sessions across Mon–Fri: one by the end of Wednesday, both by the end
    // of Friday — after which the window is closed and stays closed.
    expect([0, 1, 2, 3, 4, 5, 6].map((c) => requiredByNow(2, c, 5))).toEqual([0, 0, 0, 1, 1, 2, 2])
  })

  it('holds a full-week goal back until its last day comes due', () => {
    for (const goal of [1, 2, 3, 6, 7, 14]) {
      expect(requiredByNow(goal, DAYS_IN_WEEK - 1)).toBeLessThan(goal)
      expect(requiredByNow(goal, DAYS_IN_WEEK)).toBe(goal)
    }
  })

  it('is zero for a goal of zero rather than NaN', () => {
    expect(requiredByNow(0, 4)).toBe(0)
  })
})

describe('weekPace — the schedule marker', () => {
  it('sits at zero all of Monday, so an untouched week is never already behind', () => {
    const p = weekPace({ workouts: 0, flex: 0, calDays: 0, vitaminDays: 0, whiteningDays: 0 }, G, at(MON, 16))
    expect(p.requiredFraction).toBe(0)
    expect(p.metrics.every((m) => m.required === 0)).toBe(true)
  })

  it('holds still through the day it is judging', () => {
    const morning = weekPace({ workouts: 0, flex: 0, calDays: 2, vitaminDays: 2, whiteningDays: 2 }, G, at(MON + 2, 6))
    const night = weekPace({ workouts: 0, flex: 0, calDays: 2, vitaminDays: 2, whiteningDays: 2 }, G, at(MON + 2, 23))
    expect(morning.requiredFraction).toBe(night.requiredFraction)
  })

  it('climbs monotonically across the week', () => {
    let prev = -1
    for (let d = MON; d <= MON + 6; d++) {
      const frac = weekPace({ workouts: 0, flex: 0, calDays: 0, vitaminDays: 0, whiteningDays: 0 }, G, at(d)).requiredFraction
      expect(frac).toBeGreaterThanOrEqual(prev)
      prev = frac
    }
  })

  it('holds flex to its Mon–Fri window rather than the whole week', () => {
    // Thursday: one of the two sessions was due by the end of Wednesday, where a
    // seven-day spread would still have asked for none.
    expect(weekPace({ workouts: 0, flex: 0, calDays: 0, vitaminDays: 0, whiteningDays: 0 }, G, at(MON + 3)).metrics.find((m) => m.key === 'flex')!
      .required).toBe(1)
    // Saturday: the window has closed, so both are due and stay due.
    for (const d of [MON + 5, MON + 6]) {
      expect(weekPace({ workouts: 0, flex: 0, calDays: 0, vitaminDays: 0, whiteningDays: 0 }, G, at(d)).metrics.find((m) => m.key === 'flex')!
        .required).toBe(2)
    }
  })

  it('finishes at the end of the bar at 9pm Sunday, where the marker retires', () => {
    const before = weekPace({ workouts: 0, flex: 0, calDays: 0, vitaminDays: 0, whiteningDays: 0 }, G, at(MON + 6, 20))
    expect(before.requiredFraction).toBeLessThan(1)

    const after = weekPace({ workouts: 0, flex: 0, calDays: 0, vitaminDays: 0, whiteningDays: 0 }, G, at(MON + 6, 21))
    expect(after.requiredFraction).toBe(1)
    expect(after.metrics.every((m) => m.required === m.goal)).toBe(true)
  })

  it('leaves the last three hours open even with the schedule finished', () => {
    // 9pm Sunday, a calorie day short: the whole goal is due, but the day it can
    // still be logged on has not ended, so nothing is lost yet.
    const p = weekPace({ workouts: 2, flex: 2, calDays: 5, vitaminDays: 5, whiteningDays: 5 }, G, at(MON + 6, 21))
    expect(p.requiredFraction).toBe(1)
    expect(p.binding?.key).toBe('calDays')
    expect(p.binding?.missed).toBe(false)
    expect(p.buffer).toBe(0)
  })

  it('is behind on a metric only once a scheduled unit went unbanked', () => {
    // Friday (4 days done): one workout was due by the end of Thursday.
    const none = weekPace({ workouts: 0, flex: 0, calDays: 3, vitaminDays: 3, whiteningDays: 3 }, G, at(MON + 4))
    expect(none.metrics.find((m) => m.key === 'workouts')!.required).toBe(1)
    const one = weekPace({ workouts: 1, flex: 1, calDays: 3, vitaminDays: 3, whiteningDays: 3 }, G, at(MON + 4))
    expect(one.metrics.every((m) => m.done >= m.required)).toBe(true)
  })
})

describe('weekPace — the buffer', () => {
  it('reads the spare day a 6-of-7 goal allows at the start of the week', () => {
    const p = weekPace({ workouts: 0, flex: 0, calDays: 0, vitaminDays: 0, whiteningDays: 0 }, G, at(MON))
    expect(p.buffer).toBe(1)
    expect(p.binding?.key).toBe('calDays')
  })

  it('calls out no room left even when the overall bar looks well ahead', () => {
    // Saturday, two workouts and two flex banked, four of each daily habit: the
    // mean progress is ~80% against a 70% marker, but the two remaining calorie
    // days need the two remaining days. This is the case an averaged bar gets
    // wrong.
    const counts = { workouts: 2, flex: 2, calDays: 4, vitaminDays: 4, whiteningDays: 4 }
    const p = weekPace(counts, G, at(MON + 5))
    expect(p.requiredFraction).toBeCloseTo(0.7, 3)
    expect(p.buffer).toBe(0)
    expect(p.binding?.key).toBe('calDays')
  })

  it('binds on flex once its own window runs out, days before the week does', () => {
    // Thursday with no flex done: four days are left in the week, but only two of
    // them are days flex actually happens on, and both sessions are still owed.
    const p = weekPace({ workouts: 1, flex: 0, calDays: 3, vitaminDays: 3, whiteningDays: 3 }, G, at(MON + 3))
    expect(p.binding?.key).toBe('flex')
    expect(p.buffer).toBe(0)
    expect(p.binding?.missed).toBe(false)
  })

  it('separates falling off the flex plan from losing the goal outright', () => {
    // Saturday, one session short: past the plan, still reachable this week.
    const sat = weekPace({ workouts: 2, flex: 1, calDays: 6, vitaminDays: 6, whiteningDays: 6 }, G, at(MON + 5))
    expect(sat.buffer).toBe(-1)
    expect(sat.binding?.missed).toBe(false)

    // Sunday, both short: one day left can only carry one session.
    const sun = weekPace({ workouts: 2, flex: 0, calDays: 6, vitaminDays: 6, whiteningDays: 6 }, G, at(MON + 6))
    expect(sun.binding?.key).toBe('flex')
    expect(sun.binding?.missed).toBe(true)
  })

  it('does not bind on flex once it is done, even with its window closed', () => {
    // Saturday: flex is met and out of window, so its slack is 0 too — the unmet
    // workouts are what the week hangs on.
    const p = weekPace({ workouts: 0, flex: 2, calDays: 6, vitaminDays: 6, whiteningDays: 6 }, G, at(MON + 5))
    expect(p.binding?.key).toBe('workouts')
    expect(p.buffer).toBe(0)
  })

  it('goes negative once a goal can no longer be reached', () => {
    // Sunday with three calorie days logged: three more owed, one day left.
    const p = weekPace({ workouts: 2, flex: 2, calDays: 3, vitaminDays: 3, whiteningDays: 3 }, G, at(MON + 6))
    expect(p.buffer).toBe(-2)
    expect(p.binding?.key).toBe('calDays')
  })

  it('never binds on a metric already met, and drops the binding once all are', () => {
    const partly = weekPace({ workouts: 2, flex: 0, calDays: 6, vitaminDays: 6, whiteningDays: 6 }, G, at(MON + 3))
    expect(partly.binding?.key).toBe('flex')

    const done = weekPace({ workouts: 2, flex: 2, calDays: 6, vitaminDays: 6, whiteningDays: 6 }, G, at(MON + 3))
    expect(done.binding).toBeNull()
    expect(done.buffer).toBe(4) // every day left is spare
  })

  it('counts overshoot as met rather than as extra room', () => {
    const p = weekPace({ workouts: 5, flex: 2, calDays: 6, vitaminDays: 6, whiteningDays: 6 }, G, at(MON + 2))
    expect(p.metrics.find((m) => m.key === 'workouts')!.remaining).toBe(0)
    expect(p.binding).toBeNull()
  })

  it('breaks a tie on the first-listed metric', () => {
    // Tuesday: workouts owes 2 and calorie days owes 2, both of the same six
    // days left, so both slack 4.
    const p = weekPace({ workouts: 0, flex: 2, calDays: 4, vitaminDays: 4, whiteningDays: 4 }, G, at(MON + 1))
    expect(p.buffer).toBe(4)
    expect(p.binding?.key).toBe('workouts')
  })
})
