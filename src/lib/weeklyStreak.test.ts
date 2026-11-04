import { describe, it, expect } from 'vitest'
import {
  classifyWeek as classifyWith,
  computeWeeklyStreak,
  splitAtCurrentRun,
  weeklyStreakHistory,
  weeklyGoalsFor,
  DEFAULT_WEEKLY_GOALS,
  WEEKLY_GOAL_HISTORY,
  type WeekCounts,
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

// The original goals, which every week below is dated under: w>=2, f>=2, cal>=6.
const G = WEEKLY_GOAL_HISTORY[0].goals
const classifyWeek = (counts: WeekCounts) => classifyWith(counts, G)

describe('classifyWeek', () => {
  it('classifies a full week (exactly at goal, not exceeded)', () => {
    expect(
      classifyWeek({ workouts: 2, flex: 2, calDays: 6 }),
    ).toEqual({ tier: 'full', exceeded: false, earned: 0, cost: 0 })
  })

  it('classifies an exceeded full week', () => {
    expect(
      classifyWeek({ workouts: 3, flex: 3, calDays: 6 }),
    ).toEqual({ tier: 'full', exceeded: true, earned: 2, cost: 0 })
  })

  it('earns one freeze per day over, summed across the goals, once every goal is met', () => {
    // 4/2 workouts, 3/2 stretches, 7/6 calorie days: two, one and one over.
    expect(classifyWeek({ workouts: 4, flex: 3, calDays: 7 }).earned).toBe(4)
    expect(classifyWeek({ workouts: 2, flex: 2, calDays: 7 }).earned).toBe(1)
    // Over on two goals but short on the third earns nothing: the surplus goes
    // toward the shortfall instead.
    expect(classifyWeek({ workouts: 4, flex: 3, calDays: 5 })).toMatchObject({
      tier: 'short',
      earned: 0,
      cost: 1,
    })
  })

  it('mints nothing over a goal of 0, which is a goal not being judged', () => {
    expect(
      classifyWith({ workouts: 2, flex: 2, calDays: 7 }, { ...G, calDays: 0 }),
    ).toEqual({ tier: 'full', exceeded: false, earned: 0, cost: 0 })
    // Nor does an unjudged goal's count pay down a shortfall elsewhere.
    expect(classifyWith({ workouts: 1, flex: 2, calDays: 7 }, { ...G, calDays: 0 }).cost).toBe(1)
  })

  it('charges one freeze per day short, summed across the goals', () => {
    expect(classifyWeek({ workouts: 1, flex: 2, calDays: 6 })).toEqual({
      tier: 'short',
      exceeded: false,
      earned: 0,
      cost: 1,
    })
    expect(classifyWeek({ workouts: 1, flex: 2, calDays: 5 })).toEqual({
      tier: 'short',
      exceeded: false,
      earned: 0,
      cost: 2,
    })
    expect(classifyWeek({ workouts: 0, flex: 2, calDays: 4 })).toEqual({
      tier: 'short',
      exceeded: false,
      earned: 0,
      cost: 4,
    })
  })

  it('charges a blank week every day of every goal', () => {
    expect(classifyWeek({ workouts: 0, flex: 0, calDays: 0 }).cost).toBe(10)
  })

  it('lets a day over on one goal pay for a day short on another', () => {
    // Short 3 (one workout, two calorie days), over 1 on stretches: 2.
    expect(classifyWeek({ workouts: 1, flex: 3, calDays: 4 })).toEqual({
      tier: 'short',
      exceeded: false,
      earned: 0,
      cost: 2,
    })
    expect(classifyWeek({ workouts: 0, flex: 2, calDays: 7 }).cost).toBe(1)
  })

  it.each([
    { workouts: 2, flex: 1, calDays: 7 },
    { workouts: 4, flex: 0, calDays: 6 },
    { workouts: 0, flex: 4, calDays: 6 },
    { workouts: 3, flex: 3, calDays: 4 },
  ])('never lets surplus make a missed goal full, or free: %o', (counts) => {
    expect(classifyWeek(counts)).toEqual({ tier: 'short', exceeded: false, earned: 0, cost: 1 })
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

  it('grants a freeze for every day over when the week is full', () => {
    // WK2: 4/2 workouts, 3/2 stretches, 7/6 calorie days -> four freezes.
    const result = computeWeeklyStreak({
      workoutDates: daysInWeek(WK2, 4),
      flexDates: daysInWeek(WK2, 3),
      calorieHitDates: daysInWeek(WK2, 7),
      today: TODAY,
    })
    // WK3 is empty and gets replayed: cost 10 against a bank of 4 -> reset.
    expect(result).toEqual({ streak: 0, freezes: 4 })
    const rows = weeklyStreakHistory({
      workoutDates: daysInWeek(WK2, 4),
      flexDates: daysInWeek(WK2, 3),
      calorieHitDates: daysInWeek(WK2, 7),
      today: TODAY,
    })
    expect(rows[0]).toMatchObject({ outcome: 'advanced', freezesEarned: 4, freezesAfter: 4 })
  })

  it('spends 1 freeze on a week one day short and keeps the streak', () => {
    const result = computeWeeklyStreak({
      // WK2 exceeded -> streak 1, freeze 1. WK3 one workout short -> spends it.
      workoutDates: [...daysInWeek(WK2, 3), ...daysInWeek(WK3, 1)],
      flexDates: [...daysInWeek(WK2, 2), ...daysInWeek(WK3, 2)],
      calorieHitDates: [...daysInWeek(WK2, 6), ...daysInWeek(WK3, 6)],
      today: TODAY,
    })
    expect(result).toEqual({ streak: 1, freezes: 0 })
  })

  it('resets the streak on a short week with 0 freezes', () => {
    const result = computeWeeklyStreak({
      // WK1 exactly full (no freeze) -> streak 1. WK2 short, 0 freezes -> reset.
      workoutDates: [...daysInWeek(WK1, 2), ...daysInWeek(WK2, 1)],
      flexDates: [...daysInWeek(WK1, 2), ...daysInWeek(WK2, 2)],
      calorieHitDates: [...daysInWeek(WK1, 6), ...daysInWeek(WK2, 6)],
      today: TODAY,
    })
    expect(result).toEqual({ streak: 0, freezes: 0 })
  })

  it('keeps the streak through a week short by two when two freezes are banked', () => {
    const result = computeWeeklyStreak({
      // WK1 & WK2 both exceeded -> streak 2, freezes 2. WK3 is a workout and a
      // calorie day short -> spends both.
      workoutDates: [...daysInWeek(WK1, 3), ...daysInWeek(WK2, 3), ...daysInWeek(WK3, 1)],
      flexDates: [...daysInWeek(WK1, 2), ...daysInWeek(WK2, 2), ...daysInWeek(WK3, 2)],
      calorieHitDates: [...daysInWeek(WK1, 6), ...daysInWeek(WK2, 6), ...daysInWeek(WK3, 5)],
      today: TODAY,
    })
    expect(result).toEqual({ streak: 2, freezes: 0 })
  })

  it('resets the streak when the bank is short of the cost, and keeps the bank', () => {
    const result = computeWeeklyStreak({
      // WK1 exceeded -> streak 1, freeze 1. WK2 short by two with one freeze -> reset.
      workoutDates: [...daysInWeek(WK1, 3), ...daysInWeek(WK2, 1)],
      flexDates: [...daysInWeek(WK1, 2), ...daysInWeek(WK2, 2)],
      calorieHitDates: [...daysInWeek(WK1, 6), ...daysInWeek(WK2, 5)],
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
    const config = { ...G, workouts: 4 }
    // 3 workouts: a day short of the raised goal.
    const result = computeWeeklyStreak({
      workoutDates: daysInWeek(WK1, 3),
      flexDates: daysInWeek(WK1, 2),
      calorieHitDates: daysInWeek(WK1, 6),
      today: TODAY,
      config,
    })
    // Short week, 0 freezes -> streak resets to 0.
    expect(result).toEqual({ streak: 0, freezes: 0 })
  })
})

describe('weeklyStreakHistory — retroactive two-stretch goal', () => {
  const before = '2026-08-17'
  const after = '2026-08-31'
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

  it('reclassifies weeks that previously required three stretches', () => {
    const [wk] = weeklyStreakHistory(week(after, 2))
    expect(wk.week).toBe(after)
    expect(wk.tier).toBe('full')
    expect(wk.goals).toMatchObject({ flex: 2 })
    expect(wk.exceeded).toBe(false)
    expect(weeklyStreakHistory(week(after, 3))[0].tier).toBe('full')
  })

  // A caller handing in its own config is asking for that config over every week,
  // change date or not.
  it('leaves an explicit config alone on both sides of the date', () => {
    const goals = { ...G, flex: 3 }
    expect(weeklyStreakHistory({ ...week(before, 2), config: goals })[0].tier).not.toBe('full')
    expect(weeklyStreakHistory({ ...week(before, 3), config: goals })[0].tier).toBe('full')
  })
})

describe('weeklyStreakHistory', () => {
  it.each([0, 1])('spends one banked freeze for 2 workouts, %i stretches and 7 calorie days', (flex) => {
    // Short 2 - flex on stretches, over 1 on calories, floored at one freeze.
    // The week before banked two (a third workout and a third stretch).
    const rows = weeklyStreakHistory({
      workoutDates: [...daysInWeek('2026-08-31', 3), ...daysInWeek('2026-09-07', 2)],
      flexDates: [...daysInWeek('2026-08-31', 3), ...daysInWeek('2026-09-07', flex)],
      calorieHitDates: [...daysInWeek('2026-08-31', 6), ...daysInWeek('2026-09-07', 7)],
      today: parseISODate('2026-09-15'),
    })
    expect(rows.at(-1)).toMatchObject({
      week: '2026-09-07',
      tier: 'short',
      exceeded: false,
      outcome: 'froze',
      freezesSpent: 1,
      freezesAfter: 1,
      streakAfter: 1,
    })
  })

  it('resets without a banked freeze even when surplus covers every missed goal', () => {
    const rows = weeklyStreakHistory({
      workoutDates: [...daysInWeek('2026-08-31', 2), ...daysInWeek('2026-09-07', 2)],
      flexDates: [...daysInWeek('2026-08-31', 2), ...daysInWeek('2026-09-07', 1)],
      calorieHitDates: [...daysInWeek('2026-08-31', 6), ...daysInWeek('2026-09-07', 7)],
      today: parseISODate('2026-09-15'),
    })
    expect(rows.at(-1)).toMatchObject({ outcome: 'reset', freezesSpent: 0, freezesAfter: 0, streakAfter: 0 })
  })

  it('waits until the week ends to spend a freeze on offset goals', () => {
    const rows = weeklyStreakHistory({
      workoutDates: [...daysInWeek('2026-08-31', 3), ...daysInWeek('2026-09-07', 2)],
      flexDates: [...daysInWeek('2026-08-31', 2), ...daysInWeek('2026-09-07', 1)],
      calorieHitDates: [...daysInWeek('2026-08-31', 6), ...daysInWeek('2026-09-07', 7)],
      today: parseISODate('2026-09-13'),
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ week: '2026-08-31', freezesAfter: 1, streakAfter: 1 })
  })

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
    // week lands short rather than full.
    const [wk1] = weeklyStreakHistory({
      workoutDates: [WK1, WK1],
      flexDates: [WK1, WK1],
      calorieHitDates: daysInWeek(WK1, 6),
      today: TODAY,
    })
    expect(wk1.counts).toEqual({ workouts: 1, flex: 1, calDays: 6 })
    expect(wk1.tier).toBe('short')
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
    // WK2 exceeded -> streak 1, freeze 1. WK3 a calorie day short -> spends it.
    const rows = weeklyStreakHistory({
      workoutDates: [...daysInWeek(WK2, 3), ...daysInWeek(WK3, 2)],
      flexDates: [...daysInWeek(WK2, 2), ...daysInWeek(WK3, 2)],
      calorieHitDates: [...daysInWeek(WK2, 6), ...daysInWeek(WK3, 5)],
      today: TODAY,
    })
    expect(rows[0]).toMatchObject({ exceeded: true, outcome: 'advanced', freezesEarned: 1, freezesAfter: 1 })
    expect(rows[1]).toMatchObject({
      tier: 'short',
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

  it('charges a week short on two goals a freeze for each miss', () => {
    // 1/2 workouts, 2/2 stretches, 5/6 calorie days: two misses, two freezes.
    const rows = weeklyStreakHistory({
      workoutDates: [...daysInWeek('2026-10-12', 3), ...daysInWeek('2026-10-19', 3), ...daysInWeek('2026-10-26', 1)],
      flexDates: [...daysInWeek('2026-10-12', 2), ...daysInWeek('2026-10-19', 2), ...daysInWeek('2026-10-26', 2)],
      calorieHitDates: [...daysInWeek('2026-10-12', 6), ...daysInWeek('2026-10-19', 6), ...daysInWeek('2026-10-26', 5)],
      today: parseISODate('2026-11-02'),
    })
    expect(rows.at(-1)).toMatchObject({
      week: '2026-10-26',
      tier: 'short',
      outcome: 'froze',
      freezesSpent: 2,
      freezesAfter: 0,
      streakAfter: 2,
    })
  })

  it('bills a blank week every day of every goal, which no bank covers', () => {
    const rows = weeklyStreakHistory({
      workoutDates: [...daysInWeek(WK1, 3), ...daysInWeek(WK2, 3)],
      flexDates: [...daysInWeek(WK1, 2), ...daysInWeek(WK2, 2)],
      calorieHitDates: [...daysInWeek(WK1, 6), ...daysInWeek(WK2, 6)],
      today: TODAY,
    })
    // WK3 has no data at all but sits before the current week, so it's replayed.
    const wk3 = rows.find((r) => r.week === WK3)!
    expect(wk3).toMatchObject({ tier: 'short', outcome: 'reset', freezesSpent: 0, streakAfter: 0, freezesAfter: 2 })
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

describe('weeklyStreakHistory — six calorie days of seven, every week', () => {
  const week = (monday: string, calDays: number) => ({
    workoutDates: daysInWeek(monday, 2),
    flexDates: daysInWeek(monday, 2),
    calorieHitDates: daysInWeek(monday, calDays),
    today: parseISODate('2026-11-09'),
  })

  it('calls a six-day week full', () => {
    const [wk] = weeklyStreakHistory(week('2026-10-19', 6))
    expect(wk.goals.calDays).toBe(6)
    expect(wk.tier).toBe('full')
  })

  it('holds the weeks that were briefly asked for seven to six as well', () => {
    expect(weeklyStreakHistory(week('2026-10-26', 6))[0]).toMatchObject({
      tier: 'full',
      goals: { calDays: 6 },
    })
    expect(weeklyStreakHistory(week('2026-11-02', 5))[0].tier).toBe('short')
  })

  it('has one set of goals, which is the default', () => {
    expect(weeklyGoalsFor('2026-10-26')).toBe(DEFAULT_WEEKLY_GOALS)
    expect(weeklyGoalsFor('2026-10-19')).toBe(G)
    expect(DEFAULT_WEEKLY_GOALS.calDays).toBe(6)
  })
})
