import { describe, it, expect } from 'vitest'
import {
  classifyWeek,
  computeWeeklyStreak,
  splitAtCurrentRun,
  weeklyStreakHistory,
  DEFAULT_WEEKLY_GOALS,
  FLEX_GOAL_3_FROM,
  type WeekResult,
} from './weeklyStreak'
import { parseISODate } from './dates'

// A fixed "today". 2026-07-10 is a Friday; its Monday is 2026-07-06,
// so the current in-progress week is [2026-07-06 .. 2026-07-12].
// Completed weeks are all Mondays strictly before 2026-07-06.
const TODAY = new Date(2026, 6, 10) // month is 0-indexed: 6 = July

// Helper: n dated entries within a given week, one per day starting Monday.
// Mondays used below are all completed weeks relative to TODAY.
function daysInWeek(monday: string, n: number): string[] {
  const [y, m, d] = monday.split('-').map(Number)
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const date = new Date(y, m - 1, d + i)
    const yy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    out.push(`${yy}-${mm}-${dd}`)
  }
  return out
}

// Three consecutive completed weeks ending just before the current week.
const WK1 = '2026-06-15'
const WK2 = '2026-06-22'
const WK3 = '2026-06-29'
// The week TODAY sits in, still in progress.
const CUR = '2026-07-06'

// Defaults: full = w>=2, f>=3, cal>=6; half = w>=1, f>=2, cal>=5.

describe('classifyWeek', () => {
  it('classifies a full week (exactly at goal, not exceeded)', () => {
    expect(
      classifyWeek({ workouts: 2, flex: 3, calDays: 6 }),
    ).toEqual({ tier: 'full', exceeded: false })
  })

  it('classifies an exceeded full week', () => {
    expect(
      classifyWeek({ workouts: 3, flex: 3, calDays: 6 }),
    ).toEqual({ tier: 'full', exceeded: true })
  })

  it('classifies a half week', () => {
    expect(
      classifyWeek({ workouts: 1, flex: 2, calDays: 5 }),
    ).toEqual({ tier: 'half', exceeded: false })
  })

  it('classifies an under week', () => {
    expect(
      classifyWeek({ workouts: 0, flex: 0, calDays: 0 }),
    ).toEqual({ tier: 'under', exceeded: false })
  })

  it('is under when one dimension misses the half threshold', () => {
    expect(
      classifyWeek({ workouts: 2, flex: 3, calDays: 4 }),
    ).toEqual({ tier: 'under', exceeded: false })
  })

})

describe('computeWeeklyStreak', () => {
  it('returns zero when there are no dates', () => {
    expect(
      computeWeeklyStreak({
        workoutDates: [],
        flexDates: [],
        calorieHitDates: [],
        today: TODAY,
      }),
    ).toEqual({ streak: 0, freezes: 0 })
  })

  it('counts three consecutive FULL weeks as streak 3', () => {
    const result = computeWeeklyStreak({
      workoutDates: [
        ...daysInWeek(WK1, 2),
        ...daysInWeek(WK2, 2),
        ...daysInWeek(WK3, 2),
      ],
      flexDates: [
        ...daysInWeek(WK1, 2),
        ...daysInWeek(WK2, 2),
        ...daysInWeek(WK3, 2),
      ],
      calorieHitDates: [
        ...daysInWeek(WK1, 6),
        ...daysInWeek(WK2, 6),
        ...daysInWeek(WK3, 6),
      ],
      today: TODAY,
    })
    expect(result).toEqual({ streak: 3, freezes: 0 })
  })

  it('grants a freeze for an EXCEEDED full week', () => {
    const result = computeWeeklyStreak({
      // Use the two weeks right before the current one (no trailing empty week).
      // WK2 exceeded (3 workouts), WK3 exactly full.
      workoutDates: [...daysInWeek(WK2, 3), ...daysInWeek(WK3, 2)],
      flexDates: [...daysInWeek(WK2, 2), ...daysInWeek(WK3, 2)],
      calorieHitDates: [...daysInWeek(WK2, 6), ...daysInWeek(WK3, 6)],
      today: TODAY,
    })
    expect(result).toEqual({ streak: 2, freezes: 1 })
  })

  it('spends 1 freeze on a HALF week and keeps the streak', () => {
    const result = computeWeeklyStreak({
      // WK2 exceeded -> streak 1, freeze 1. WK3 half -> spends freeze, streak kept.
      workoutDates: [...daysInWeek(WK2, 3), ...daysInWeek(WK3, 1)],
      flexDates: [...daysInWeek(WK2, 2), ...daysInWeek(WK3, 1)],
      calorieHitDates: [...daysInWeek(WK2, 6), ...daysInWeek(WK3, 5)],
      today: TODAY,
    })
    expect(result).toEqual({ streak: 1, freezes: 0 })
  })

  it('resets the streak on a HALF week with 0 freezes', () => {
    const result = computeWeeklyStreak({
      // WK1 exactly full (no freeze) -> streak 1. WK2 half, 0 freezes -> reset.
      workoutDates: [...daysInWeek(WK1, 2), ...daysInWeek(WK2, 1)],
      flexDates: [...daysInWeek(WK1, 2), ...daysInWeek(WK2, 1)],
      calorieHitDates: [...daysInWeek(WK1, 6), ...daysInWeek(WK2, 5)],
      today: TODAY,
    })
    expect(result).toEqual({ streak: 0, freezes: 0 })
  })

  it('keeps the streak on an UNDER week when >= 2 freezes are banked', () => {
    const result = computeWeeklyStreak({
      // WK1 & WK2 both exceeded -> streak 2, freezes 2. WK3 under -> spends 2.
      workoutDates: [
        ...daysInWeek(WK1, 3),
        ...daysInWeek(WK2, 3),
        ...daysInWeek(WK3, 0),
      ],
      flexDates: [...daysInWeek(WK1, 2), ...daysInWeek(WK2, 2)],
      calorieHitDates: [...daysInWeek(WK1, 6), ...daysInWeek(WK2, 6)],
      today: TODAY,
    })
    expect(result).toEqual({ streak: 2, freezes: 0 })
  })

  it('resets the streak on an UNDER week with < 2 freezes', () => {
    const result = computeWeeklyStreak({
      // WK1 exceeded -> streak 1, freeze 1. WK2 under, only 1 freeze -> reset.
      workoutDates: [...daysInWeek(WK1, 3)],
      flexDates: [...daysInWeek(WK1, 2)],
      calorieHitDates: [...daysInWeek(WK1, 6)],
      today: TODAY,
    })
    expect(result).toEqual({ streak: 0, freezes: 1 })
  })

  it('advances on the current week as soon as it goes full', () => {
    // Current week is [2026-07-06 .. 2026-07-12]; TODAY = 2026-07-10.
    // The goals are met with days to spare, so the streak lands now.
    const result = computeWeeklyStreak({
      workoutDates: daysInWeek(CUR, 2),
      flexDates: daysInWeek(CUR, 2),
      calorieHitDates: daysInWeek(CUR, 6),
      today: TODAY,
    })
    expect(result).toEqual({ streak: 1, freezes: 0 })
  })

  it('grants the freeze mid-week for one-upping the current week', () => {
    const result = computeWeeklyStreak({
      workoutDates: daysInWeek(CUR, 3),
      flexDates: daysInWeek(CUR, 2),
      calorieHitDates: daysInWeek(CUR, 6),
      today: TODAY,
    })
    expect(result).toEqual({ streak: 1, freezes: 1 })
  })

  it('ignores a current week that has not gone full yet', () => {
    // Half the week's work in, mid-week: no advance, and crucially no freeze
    // spent and no reset — the week is still being lived.
    const result = computeWeeklyStreak({
      workoutDates: [...daysInWeek(WK3, 3), ...daysInWeek(CUR, 1)],
      flexDates: [...daysInWeek(WK3, 2), ...daysInWeek(CUR, 1)],
      calorieHitDates: [...daysInWeek(WK3, 6), ...daysInWeek(CUR, 5)],
      today: TODAY,
    })
    // Only WK3 counts: exceeded full -> streak 1, freeze 1.
    expect(result).toEqual({ streak: 1, freezes: 1 })
  })

  it('counts the current week once, not twice, when it goes full', () => {
    const rows = weeklyStreakHistory({
      workoutDates: [...daysInWeek(WK3, 2), ...daysInWeek(CUR, 2)],
      flexDates: [...daysInWeek(WK3, 2), ...daysInWeek(CUR, 2)],
      calorieHitDates: [...daysInWeek(WK3, 6), ...daysInWeek(CUR, 6)],
      today: TODAY,
    })
    expect(rows.filter((r) => r.week === CUR)).toHaveLength(1)
    expect(rows[rows.length - 1].streakAfter).toBe(2)
  })

  it('respects a custom config', () => {
    const config = {
      ...DEFAULT_WEEKLY_GOALS,
      workouts: 4,
      halfWorkouts: 2,
    }
    // 3 workouts: below full(4), at/above half(2) -> half tier.
    const result = computeWeeklyStreak({
      workoutDates: daysInWeek(WK1, 3),
      flexDates: daysInWeek(WK1, 2),
      calorieHitDates: daysInWeek(WK1, 6),
      today: TODAY,
      config,
    })
    // Half week, 0 freezes -> streak resets to 0.
    expect(result).toEqual({ streak: 0, freezes: 0 })
  })
})

describe('weeklyStreakHistory — the stretch goal going to three', () => {
  // Raising a goal re-judges every week ever logged, so a two-stretch week from
  // before the change would drop out of `full` and take the run down with it.
  // These pin that it doesn't — see FLEX_GOAL_3_FROM.
  const before = '2026-08-17'
  const after = FLEX_GOAL_3_FROM
  const laterToday = parseISODate('2026-09-14')
  const week = (monday: string, flex: number) => ({
    workoutDates: daysInWeek(monday, 2),
    flexDates: daysInWeek(monday, flex),
    calorieHitDates: daysInWeek(monday, 6),
    today: laterToday,
  })

  it('still calls a two-stretch week full when it predates the change', () => {
    const [wk] = weeklyStreakHistory(week(before, 2))
    expect(wk.week).toBe(before)
    expect(wk.counts.flex).toBe(2)
    expect(wk.tier).toBe('full')
  })

  it('asks a week from the change onward for three', () => {
    const [wk] = weeklyStreakHistory(week(after, 2))
    expect(wk.week).toBe(after)
    expect(wk.tier).not.toBe('full')
    expect(weeklyStreakHistory(week(after, 3))[0].tier).toBe('full')
  })

  // A caller handing in its own config is asking for that config over every week,
  // change date or not.
  it('leaves an explicit config alone on both sides of the date', () => {
    const goals = { ...DEFAULT_WEEKLY_GOALS, flex: 3, halfFlex: 3 }
    expect(weeklyStreakHistory({ ...week(before, 2), config: goals })[0].tier).not.toBe('full')
    expect(weeklyStreakHistory({ ...week(before, 3), config: goals })[0].tier).toBe('full')
  })
})

describe('weeklyStreakHistory', () => {
  it('returns no rows when there are no dates', () => {
    expect(
      weeklyStreakHistory({
        workoutDates: [],
        flexDates: [],
        calorieHitDates: [],
        today: TODAY,
      }),
    ).toEqual([])
  })

  it('reports the counts behind each week', () => {
    const [wk1] = weeklyStreakHistory({
      workoutDates: daysInWeek(WK1, 2),
      flexDates: daysInWeek(WK1, 2),
      calorieHitDates: daysInWeek(WK1, 6),
      today: TODAY,
    })
    expect(wk1.week).toBe(WK1)
    expect(wk1.counts).toEqual({ workouts: 2, flex: 2, calDays: 6 })
    expect(wk1.tier).toBe('full')
    expect(wk1.outcome).toBe('advanced')
    expect(wk1.streakAfter).toBe(1)
  })

  it('counts a day trained twice as one day', () => {
    // Two workouts and two stretches crammed into Monday is one of each, so the
    // week lands half rather than full.
    const [wk1] = weeklyStreakHistory({
      workoutDates: [WK1, WK1],
      flexDates: [WK1, WK1],
      calorieHitDates: daysInWeek(WK1, 6),
      today: TODAY,
    })
    expect(wk1.counts).toEqual({ workouts: 1, flex: 1, calDays: 6 })
    expect(wk1.tier).toBe('half')
  })

  it('names the week that broke the run', () => {
    // WK1 full -> 1. WK2 misses calorie days (4) with no freezes -> reset. WK3 full -> 1.
    const rows = weeklyStreakHistory({
      workoutDates: [...daysInWeek(WK1, 2), ...daysInWeek(WK2, 2), ...daysInWeek(WK3, 2)],
      flexDates: [...daysInWeek(WK1, 2), ...daysInWeek(WK2, 2), ...daysInWeek(WK3, 2)],
      calorieHitDates: [...daysInWeek(WK1, 6), ...daysInWeek(WK2, 4), ...daysInWeek(WK3, 6)],
      today: TODAY,
    })
    expect(rows.map((r) => r.outcome)).toEqual(['advanced', 'reset', 'advanced'])
    expect(rows[1].counts.calDays).toBe(4)
    expect(rows[1].streakAfter).toBe(0)
    expect(rows[2].streakAfter).toBe(1)
  })

  it('records a freeze being spent rather than the run ending', () => {
    // WK2 exceeded -> streak 1, freeze 1. WK3 half -> spends the freeze.
    const rows = weeklyStreakHistory({
      workoutDates: [...daysInWeek(WK2, 3), ...daysInWeek(WK3, 1)],
      flexDates: [...daysInWeek(WK2, 2), ...daysInWeek(WK3, 1)],
      calorieHitDates: [...daysInWeek(WK2, 6), ...daysInWeek(WK3, 5)],
      today: TODAY,
    })
    expect(rows[0]).toMatchObject({ exceeded: true, outcome: 'advanced', freezesAfter: 1 })
    expect(rows[1]).toMatchObject({
      tier: 'half',
      outcome: 'froze',
      freezesSpent: 1,
      streakAfter: 1,
      freezesAfter: 0,
    })
  })

  it('returns a spent freeze when a missed calorie day is corrected later', () => {
    const shared = {
      workoutDates: [...daysInWeek(WK2, 3), ...daysInWeek(WK3, 2)],
      flexDates: [...daysInWeek(WK2, 2), ...daysInWeek(WK3, 2)],
      today: TODAY,
    }

    // WK2 earns a freeze. With only five calorie days in WK3, replay spends it.
    const before = weeklyStreakHistory({
      ...shared,
      calorieHitDates: [...daysInWeek(WK2, 6), ...daysInWeek(WK3, 5)],
    })
    expect(before.at(-1)).toMatchObject({
      week: WK3,
      outcome: 'froze',
      freezesAfter: 0,
      streakAfter: 1,
    })

    // Backfilling Sunday makes WK3 full. Replaying history now advances the
    // streak and leaves the earned freeze untouched.
    const after = weeklyStreakHistory({
      ...shared,
      calorieHitDates: [...daysInWeek(WK2, 6), ...daysInWeek(WK3, 6)],
    })
    expect(after.at(-1)).toMatchObject({
      week: WK3,
      outcome: 'advanced',
      freezesAfter: 1,
      streakAfter: 2,
    })
  })

  it('charges an under week two freezes', () => {
    const rows = weeklyStreakHistory({
      workoutDates: [...daysInWeek(WK1, 3), ...daysInWeek(WK2, 3)],
      flexDates: [...daysInWeek(WK1, 2), ...daysInWeek(WK2, 2)],
      calorieHitDates: [...daysInWeek(WK1, 6), ...daysInWeek(WK2, 6)],
      today: TODAY,
    })
    // WK3 has no data at all but sits before the current week, so it's replayed.
    const wk3 = rows.find((r) => r.week === WK3)!
    expect(wk3).toMatchObject({ tier: 'under', outcome: 'froze', freezesSpent: 2, streakAfter: 2 })
  })

  it('flags the current week when it earned its place in the run', () => {
    const rows = weeklyStreakHistory({
      workoutDates: [...daysInWeek(WK3, 2), ...daysInWeek(CUR, 3)],
      flexDates: [...daysInWeek(WK3, 2), ...daysInWeek(CUR, 2)],
      calorieHitDates: [...daysInWeek(WK3, 6), ...daysInWeek(CUR, 6)],
      today: TODAY,
    })
    const last = rows[rows.length - 1]
    expect(last).toMatchObject({ week: CUR, inProgress: true, exceeded: true, streakAfter: 2 })
    expect(rows.slice(0, -1).every((r) => !r.inProgress)).toBe(true)
  })

  it('leaves an unfinished current week out of the rows', () => {
    const rows = weeklyStreakHistory({
      workoutDates: [...daysInWeek(WK3, 2), ...daysInWeek(CUR, 1)],
      flexDates: [...daysInWeek(WK3, 2), ...daysInWeek(CUR, 1)],
      calorieHitDates: [...daysInWeek(WK3, 6), ...daysInWeek(CUR, 5)],
      today: TODAY,
    })
    expect(rows.every((r) => r.week < CUR)).toBe(true)
  })

  it('agrees with computeWeeklyStreak', () => {
    const input = {
      workoutDates: [...daysInWeek(WK1, 3), ...daysInWeek(WK2, 1), ...daysInWeek(WK3, 2)],
      flexDates: [...daysInWeek(WK1, 2), ...daysInWeek(WK2, 1), ...daysInWeek(WK3, 2)],
      calorieHitDates: [...daysInWeek(WK1, 6), ...daysInWeek(WK2, 5), ...daysInWeek(WK3, 6)],
      today: TODAY,
    }
    const rows = weeklyStreakHistory(input)
    const last = rows[rows.length - 1]
    expect(computeWeeklyStreak(input)).toEqual({
      streak: last.streakAfter,
      freezes: last.freezesAfter,
    })
  })
})

describe('splitAtCurrentRun', () => {
  const row = (week: string, outcome: WeekResult['outcome']) => ({ week, outcome }) as WeekResult
  const weeksOf = (rows: WeekResult[]) => rows.map((r) => r.week)

  it('keeps every week when nothing broke the run', () => {
    const rows = [row('a', 'advanced'), row('b', 'froze'), row('c', 'advanced')]
    const { earlier, run } = splitAtCurrentRun(rows)
    expect(earlier).toEqual([])
    expect(weeksOf(run)).toEqual(['a', 'b', 'c'])
  })

  it('folds away the reset week and everything before it', () => {
    const rows = [
      row('a', 'advanced'),
      row('b', 'reset'),
      row('c', 'advanced'),
      row('d', 'froze'),
    ]
    const { earlier, run } = splitAtCurrentRun(rows)
    expect(weeksOf(earlier)).toEqual(['a', 'b'])
    expect(weeksOf(run)).toEqual(['c', 'd'])
  })

  it('splits at the last reset, not the first', () => {
    const rows = [row('a', 'reset'), row('b', 'advanced'), row('c', 'reset'), row('d', 'advanced')]
    const { earlier, run } = splitAtCurrentRun(rows)
    expect(weeksOf(earlier)).toEqual(['a', 'b', 'c'])
    expect(weeksOf(run)).toEqual(['d'])
  })

  it('leaves an empty run when the streak just broke', () => {
    const rows = [row('a', 'advanced'), row('b', 'reset')]
    const { earlier, run } = splitAtCurrentRun(rows)
    expect(weeksOf(earlier)).toEqual(['a', 'b'])
    expect(run).toEqual([])
  })

  it('handles an empty history', () => {
    expect(splitAtCurrentRun([])).toEqual({ earlier: [], run: [] })
  })
})
