import { describe, expect, it } from 'vitest'
import { DAYS_IN_WEEK, calDaysBehind, calDaysRequiredByNow, requiredByNow, weekDaysCompleted, weekPace } from './weekPace'
import { WEEKLY_GOAL_HISTORY, type WeeklyGoalConfig } from './weeklyStreak'

// 2026-06-15 is a Monday; the Mon–Sun week runs 06-15 … 06-21.
const MON = 15
const at = (day: number, hour = 9) => new Date(2026, 5, day, hour)

// The workout, flexibility, and calorie goals: six calorie days of seven.
const G: WeeklyGoalConfig = WEEKLY_GOAL_HISTORY[WEEKLY_GOAL_HISTORY.length - 1].goals
// Every day a calorie day, so the staircase steps in whole days.
const G7: WeeklyGoalConfig = { ...G, calDays: 7 }

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
  it('owes nothing all Monday: no day has finished', () => {
    expect(calDaysRequiredByNow(7, at(MON, 9))).toBe(0)
    expect(calDaysRequiredByNow(7, at(MON, 22))).toBe(0)
    expect(calDaysRequiredByNow(7, new Date(2026, 5, MON, 23, 59))).toBe(0)
  })
  it('steps at midnight and holds through the whole day, evening included', () => {
    expect(calDaysRequiredByNow(7, at(MON + 1, 0))).toBe(1)
    expect(calDaysRequiredByNow(7, at(MON + 1, 12))).toBe(1)
    expect(calDaysRequiredByNow(7, at(MON + 1, 22))).toBe(1)
    expect(calDaysRequiredByNow(7, new Date(2026, 5, MON + 1, 23, 59))).toBe(1)
    expect(calDaysRequiredByNow(7, at(MON + 2, 0))).toBe(2)
    expect(calDaysRequiredByNow(7, at(MON + 3, 9))).toBe(3)
  })
  it('never owes the day in progress, so Sunday stops one short and Monday resets', () => {
    expect(calDaysRequiredByNow(7, at(MON + 6, 9))).toBe(6)
    expect(calDaysRequiredByNow(7, new Date(2026, 5, MON + 6, 23, 59))).toBe(6)
    expect(calDaysRequiredByNow(7, at(MON + 7, 9))).toBe(0)
  })
  it('keeps the spare day of a six-of-seven goal in hand, in whole days', () => {
    expect(calDaysRequiredByNow(6, at(MON, 9))).toBe(0)
    expect(calDaysRequiredByNow(6, at(MON + 1, 12))).toBe(0)
    expect(calDaysRequiredByNow(6, at(MON + 2, 20))).toBe(1)
    expect(calDaysRequiredByNow(6, at(MON + 6, 23))).toBe(5)
    // Five of seven has two spare.
    expect(calDaysRequiredByNow(5, at(MON + 2, 20))).toBe(0)
    expect(calDaysRequiredByNow(5, at(MON + 3, 20))).toBe(1)
  })
  it('is a whole number at every hour of the week', () => {
    for (let d = MON; d <= MON + 6; d++) {
      for (let h = 0; h < 24; h++) {
        for (const goal of [1, 3, 5, 6, 7]) {
          expect(Number.isInteger(calDaysRequiredByNow(goal, at(d, h)))).toBe(true)
        }
      }
    }
  })
  it('steps at local midnight across daylight saving transitions', () => {
    for (const month of [2, 10]) {
      const sunday = new Date(2026, month, month === 2 ? 8 : 1, 23, 59)
      expect(calDaysRequiredByNow(7, sunday)).toBe(6)
      sunday.setHours(0, 0)
      expect(calDaysRequiredByNow(7, sunday)).toBe(6)
    }
  })
  it('handles zero goals', () => {
    expect(calDaysRequiredByNow(0, at(MON + 3))).toBe(0)
  })
})

// The complaint, twice now: "days on calorie target is moving too soon again.
// I'm somehow behind pace on a Wednesday evening when I hit my goal Monday and
// Tuesday". Whatever else changes about pacing, this must not.
describe('days on calorie target is moving too soon', () => {
  const WED = MON + 2
  const evening = [18, 20, 21, 22, 23].map((h) => at(WED, h)).concat(new Date(2026, 5, WED, 23, 59, 59))
  const calRow = (calDays: number, goals: WeeklyGoalConfig, now: Date) =>
    weekPace({ workouts: 0, flex: 0, calDays }, goals, now).metrics.find((m) => m.key === 'calDays')!

  it('is not behind on Wednesday evening with Monday and Tuesday hit', () => {
    for (const now of evening) {
      for (const goal of [5, 6, 7]) {
        expect(calDaysBehind(2, goal, now)).toBe(false)
        expect(calDaysRequiredByNow(goal, now)).toBeLessThanOrEqual(2)
      }
    }
  })

  it('draws the row marker no further than the fill, and holds it still all Wednesday', () => {
    for (const goals of [G, G7]) {
      const rows = evening.map((now) => calRow(2, goals, now))
      for (const m of rows) expect(m.required).toBeLessThanOrEqual(m.done)
      const morning = calRow(2, goals, at(WED, 0))
      expect(new Set([morning.required, ...rows.map((m) => m.required)]).size).toBe(1)
    }
  })

  it('is behind only once the days left cannot cover what is owed', () => {
    // Seven of seven, Monday missed: lost the moment Monday ended.
    expect(calDaysBehind(0, 7, at(MON, 23))).toBe(false)
    expect(calDaysBehind(0, 7, at(MON + 1, 0))).toBe(true)
    // Six of seven, Monday missed: the spare day covers it for the rest of the week.
    expect(calDaysBehind(0, 6, at(MON + 1, 9))).toBe(false)
    expect(calDaysBehind(1, 6, at(MON + 2, 9))).toBe(false)
    expect(calDaysBehind(5, 6, at(MON + 6, 23))).toBe(false)
    // A second miss is one too many.
    expect(calDaysBehind(0, 6, at(MON + 2, 0))).toBe(true)
  })

  it('agrees with the metric being out of reach', () => {
    for (let d = MON; d <= MON + 6; d++) {
      for (let done = 0; done <= 7; done++) {
        expect(calDaysBehind(done, G.calDays, at(d, 20))).toBe(calRow(done, G, at(d, 20)).missed)
      }
    }
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

  it('steps calorie days at midnight while the other two ramp', () => {
    const cal = (d: number, h: number) =>
      weekPace({ workouts: 0, flex: 0, calDays: 0 }, G7, at(d, h)).metrics.find((m) => m.key === 'calDays')!.required
    expect(cal(MON + 2, 8)).toBe(2)
    expect(cal(MON + 2, 23)).toBe(2)
    expect(cal(MON + 3, 0)).toBe(3)
  })

  it('finishes workouts and flex at 9pm Sunday, and never calls the calorie day of Sunday due', () => {
    const nine = weekPace({ workouts: 0, flex: 0, calDays: 0 }, G7, at(MON + 6, 21))
    const byKey = new Map(nine.metrics.map((m) => [m.key, m]))
    expect(byKey.get('workouts')!.required).toBe(G7.workouts)
    expect(byKey.get('flex')!.required).toBe(G7.flex)
    expect(byKey.get('calDays')!.required).toBe(6)
    expect(nine.requiredFraction).toBeLessThan(1)

    const late = weekPace({ workouts: 0, flex: 0, calDays: 0 }, G7, at(MON + 6, 23))
    expect(late.metrics.find((m) => m.key === 'calDays')!.required).toBe(6)
    expect(late.requiredFraction).toBeLessThan(1)
  })

  it('retires the marker at 9pm Sunday when no calorie days are asked for', () => {
    const p = weekPace({ workouts: 0, flex: 0, calDays: 0 }, { ...G, calDays: 0 }, at(MON + 6, 21))
    expect(p.requiredFraction).toBe(1)
  })

  it('leaves Sunday night open a calorie day short', () => {
    const p = weekPace({ workouts: 2, flex: 3, calDays: 5 }, G, at(MON + 6, 22))
    expect(p.metrics.find((m) => m.key === 'calDays')!.required).toBe(5)
    expect(p.binding?.key).toBe('calDays')
    expect(p.binding?.missed).toBe(false)
    expect(p.buffer).toBe(0)
  })

  it('keeps the target independent of completed sessions', () => {
    const none = weekPace({ workouts: 0, flex: 0, calDays: 0 }, G, at(MON + 3))
    const done = weekPace({ workouts: 2, flex: 3, calDays: 6 }, G, at(MON + 3))
    expect(none.requiredFraction).toBe(done.requiredFraction)
    expect(none.metrics.map((m) => m.required)).toEqual(done.metrics.map((m) => m.required))
    // Thursday 9am: 63 of the 147 ramp hours, 63 of flex's 123, and two of six
    // calorie days: three days done, one of them the spare.
    expect(none.requiredFraction).toBeCloseTo((63 / 147 + 63 / 123 + 2 / 6) / 3)
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
    // Saturday 9am: five days done, so four of the six had to be in.
    expect(p.requiredFraction).toBeCloseTo((111 / 147 + 111 / 123 + 4 / 6) / 3)
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
