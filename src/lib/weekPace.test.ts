import { describe, expect, it } from 'vitest'
import { DAYS_IN_WEEK, calDaysRequiredByNow, requiredByNow, weekDaysCompleted, weekPace } from './weekPace'
import { WEEKLY_GOAL_HISTORY, type WeeklyGoalConfig } from './weeklyStreak'

// 2026-06-15 is a Monday; the Mon–Sun week runs 06-15 … 06-21.
const MON = 15
const at = (day: number, hour = 9) => new Date(2026, 5, day, hour)

// The original workout, flexibility, and calorie goals: six calorie days of seven.
const G: WeeklyGoalConfig = WEEKLY_GOAL_HISTORY[0].goals
// Today's goals: every day a calorie day.
const G7: WeeklyGoalConfig = WEEKLY_GOAL_HISTORY[WEEKLY_GOAL_HISTORY.length - 1].goals

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

describe('calDaysRequiredByNow', () => {
  it('owes nothing until Monday 10pm, then one day', () => {
    expect(calDaysRequiredByNow(7, at(MON, 9))).toBe(0)
    expect(calDaysRequiredByNow(7, new Date(2026, 5, MON, 21, 59))).toBe(0)
    expect(calDaysRequiredByNow(7, at(MON, 22))).toBe(1)
    expect(calDaysRequiredByNow(7, at(MON, 23))).toBe(1)
  })
  it('holds steady through the day and steps once at each 10pm', () => {
    expect(calDaysRequiredByNow(7, at(MON + 1, 0))).toBe(1)
    expect(calDaysRequiredByNow(7, at(MON + 1, 12))).toBe(1)
    expect(calDaysRequiredByNow(7, at(MON + 1, 21))).toBe(1)
    expect(calDaysRequiredByNow(7, at(MON + 1, 22))).toBe(2)
    expect(calDaysRequiredByNow(7, at(MON + 3, 9))).toBe(3)
    expect(calDaysRequiredByNow(7, at(MON + 3, 22))).toBe(4)
  })
  it('comes fully due at Sunday 10pm, an hour after the rest of the week, and resets Monday', () => {
    expect(calDaysRequiredByNow(7, at(MON + 6, 21))).toBe(6)
    expect(calDaysRequiredByNow(7, at(MON + 6, 22))).toBe(7)
    expect(calDaysRequiredByNow(7, new Date(2026, 5, MON + 6, 23, 59))).toBe(7)
    expect(calDaysRequiredByNow(7, at(MON + 7, 9))).toBe(0)
  })
  it('scales a smaller goal across the same seven steps', () => {
    expect(calDaysRequiredByNow(6, at(MON + 1, 12))).toBeCloseTo(6 / 7)
    expect(calDaysRequiredByNow(6, at(MON + 6, 22))).toBe(6)
  })
  it('keeps the 10pm deadline local across daylight saving transitions', () => {
    for (const month of [2, 10]) {
      const sunday = new Date(2026, month, month === 2 ? 8 : 1, 22)
      expect(calDaysRequiredByNow(7, sunday)).toBe(7)
      sunday.setHours(21, 59)
      expect(calDaysRequiredByNow(7, sunday)).toBe(6)
    }
  })
  it('handles zero goals', () => {
    expect(calDaysRequiredByNow(0, at(MON + 3))).toBe(0)
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
    expect(flexRequired(MON + 3)).toBeCloseTo(2 * 63 / 123)
    expect(flexRequired(MON + 4)).toBeCloseTo(2 * 87 / 123)
    expect(flexRequired(MON + 6)).toBe(2)
  })

  it('steps calorie days once a night while the other two ramp', () => {
    const cal = (d: number, h: number) =>
      weekPace({ workouts: 0, flex: 0, calDays: 0 }, G7, at(d, h)).metrics.find((m) => m.key === 'calDays')!.required
    expect(cal(MON + 2, 8)).toBe(2)
    expect(cal(MON + 2, 21)).toBe(2)
    expect(cal(MON + 2, 22)).toBe(3)
  })

  it('finishes workouts and flex at 9pm Sunday, and the whole bar at 10pm, where the marker retires', () => {
    const nine = weekPace({ workouts: 0, flex: 0, calDays: 0 }, G7, at(MON + 6, 21))
    const byKey = new Map(nine.metrics.map((m) => [m.key, m]))
    expect(byKey.get('workouts')!.required).toBe(G7.workouts)
    expect(byKey.get('flex')!.required).toBe(G7.flex)
    expect(byKey.get('calDays')!.required).toBe(6)
    expect(nine.requiredFraction).toBeLessThan(1)

    const ten = weekPace({ workouts: 0, flex: 0, calDays: 0 }, G7, at(MON + 6, 22))
    expect(ten.requiredFraction).toBe(1)
    expect(ten.metrics.every((m) => m.required === m.goal)).toBe(true)
  })

  it('leaves the last two hours open even with the schedule finished', () => {
    // 10pm Sunday, a calorie day short: the whole goal is due, but the day it can
    // still be logged on has not ended, so nothing is lost yet.
    const p = weekPace({ workouts: 2, flex: 3, calDays: 6 }, G7, at(MON + 6, 22))
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
    // Thursday 9am: 63 of the 147 ramp hours, 63 of flex's 123, three calorie nights of seven.
    expect(none.requiredFraction).toBeCloseTo((63 / 147 + 63 / 123 + 3 / 7) / 3)
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
    // Saturday 9am: five calorie nights have passed.
    expect(p.requiredFraction).toBeCloseTo((111 / 147 + 111 / 123 + 5 / 7) / 3)
    expect(p.buffer).toBe(0)
    expect(p.binding?.key).toBe('calDays')
  })

  it('binds on flex once its own window runs out, days before the week does', () => {
    // Friday with no flex done: three days are left in the week, but only two of
    // them are days flex actually happens on, and both sessions are still owed.
    const p = weekPace({ workouts: 1, flex: 0, calDays: 4 }, G, at(MON + 4))
    expect(p.binding?.key).toBe('flex')
    expect(p.buffer).toBe(0)
    expect(p.binding?.missed).toBe(false)
  })

  it('separates falling off the flex plan from losing the goal outright', () => {
    // Saturday, two sessions owed: past the plan, still reachable this week.
    const sat = weekPace({ workouts: 2, flex: 0, calDays: 6 }, G, at(MON + 5))
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
