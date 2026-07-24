import { describe, it, expect } from 'vitest'
import {
  CALORIE_GOAL,
  caloriePaceFraction,
  calorieSurplusSeries,
  dayTotals,
  totalForDate,
  calorieHitDates,
  caloriePR,
  setDayTotal,
  mergeCaloriesByDate,
  type CalorieEntry,
} from './calories'

describe('caloriePaceFraction', () => {
  it('is 0 before the window and 1 after', () => {
    expect(caloriePaceFraction(new Date(2026, 6, 13, 8, 0))).toBe(0)
    expect(caloriePaceFraction(new Date(2026, 6, 13, 22, 0))).toBe(1)
  })
  it('is ~half at 3pm (midpoint of 9am–9pm)', () => {
    expect(caloriePaceFraction(new Date(2026, 6, 13, 15, 0))).toBeCloseTo(0.5, 5)
  })
})

// Fixed reference day: Friday 2026-07-10.
// Its week (Mon–Sun) starts 2026-07-06; the prior week starts 2026-06-29.
const TODAY = new Date(2026, 6, 10)
const THIS_WEEK = '2026-07-08'
const THIS_WEEK_2 = '2026-07-09'
const PRIOR_WEEK = '2026-06-30'

describe('dayTotals', () => {
  it('sums multiple entries on the same date', () => {
    const entries: CalorieEntry[] = [
      { date: '2026-07-08', calories: 1500 },
      { date: '2026-07-08', calories: 2000 },
      { date: '2026-07-09', calories: 1000 },
    ]
    const totals = dayTotals(entries)
    expect(totals.get('2026-07-08')).toBe(3500)
    expect(totals.get('2026-07-09')).toBe(1000)
  })

  it('ignores non-finite and negative calorie values', () => {
    const entries: CalorieEntry[] = [
      { date: '2026-07-08', calories: 2000 },
      { date: '2026-07-08', calories: -500 },
      { date: '2026-07-08', calories: Number.NaN },
      { date: '2026-07-08', calories: Number.POSITIVE_INFINITY },
    ]
    expect(dayTotals(entries).get('2026-07-08')).toBe(2000)
  })
})

describe('totalForDate', () => {
  it('returns the summed total for a date', () => {
    const entries: CalorieEntry[] = [
      { date: '2026-07-08', calories: 1200 },
      { date: '2026-07-08', calories: 900 },
    ]
    expect(totalForDate(entries, '2026-07-08')).toBe(2100)
  })

  it('returns 0 for a date with no entries', () => {
    expect(totalForDate([], '2026-07-08')).toBe(0)
  })
})

describe('setDayTotal', () => {
  it('replaces every entry for the date with a single running total', () => {
    const entries: CalorieEntry[] = [
      { date: '2026-07-08', calories: 500 },
      { date: '2026-07-08', calories: 300 },
      { date: '2026-07-09', calories: 1000 },
    ]
    const next = setDayTotal(entries, '2026-07-08', 900)
    expect(next.filter((e) => e.date === '2026-07-08')).toEqual([{ date: '2026-07-08', calories: 900 }])
    expect(totalForDate(next, '2026-07-09')).toBe(1000)
  })

  it('adds a new date that had no prior entry', () => {
    const next = setDayTotal([], '2026-07-08', 500)
    expect(next).toEqual([{ date: '2026-07-08', calories: 500 }])
  })
})

describe('mergeCaloriesByDate', () => {
  it('local wins for shared dates; server only adds dates local is missing', () => {
    const local: CalorieEntry[] = [
      { date: '2026-07-08', calories: 800 }, // optimistic, ahead of server
      { date: '2026-07-09', calories: 1000 },
    ]
    const server: CalorieEntry[] = [
      { date: '2026-07-08', calories: 500 }, // stale — must not win
      { date: '2026-07-10', calories: 4000 }, // local hasn't seen this date
    ]
    expect(mergeCaloriesByDate(local, server)).toEqual([
      { date: '2026-07-08', calories: 800 },
      { date: '2026-07-09', calories: 1000 },
      { date: '2026-07-10', calories: 4000 },
    ])
  })

  it('keeps a local decrease that the server has not caught up to yet', () => {
    const local: CalorieEntry[] = [{ date: '2026-07-08', calories: 3900 }] // after −100
    const server: CalorieEntry[] = [{ date: '2026-07-08', calories: 4000 }] // pre-correction
    expect(mergeCaloriesByDate(local, server)).toEqual([{ date: '2026-07-08', calories: 3900 }])
  })

  it('collapses legacy multi-row server dates into one summed total', () => {
    const server: CalorieEntry[] = [
      { date: '2026-07-08', calories: 500 },
      { date: '2026-07-08', calories: 300 },
    ]
    expect(mergeCaloriesByDate([], server)).toEqual([{ date: '2026-07-08', calories: 800 }])
  })
})

describe('calorieHitDates', () => {
  it('returns only dates whose total meets or exceeds the goal, sorted ascending', () => {
    const entries: CalorieEntry[] = [
      { date: '2026-07-09', calories: 4200 },
      { date: '2026-07-07', calories: 3000 }, // under goal
      { date: '2026-07-08', calories: 2000 },
      { date: '2026-07-08', calories: 2000 }, // sums to 4000 -> exactly goal
    ]
    expect(calorieHitDates(entries)).toEqual(['2026-07-08', '2026-07-09'])
  })

  it('respects a custom goal', () => {
    const entries: CalorieEntry[] = [
      { date: '2026-07-08', calories: 3000 },
      { date: '2026-07-09', calories: 3500 },
    ]
    expect(calorieHitDates(entries, 3200)).toEqual(['2026-07-09'])
  })
})

describe('calorieSurplusSeries', () => {
  it('reports each day as surplus above/below goal, averaged over the trailing 7 days', () => {
    const entries: CalorieEntry[] = [
      { date: '2026-07-06', calories: 4500 }, // +500
      { date: '2026-07-07', calories: 3500 }, // −500
      { date: '2026-07-08', calories: 4000 }, // 0
    ]
    // 07-06: avg(+500) = +500
    // 07-07: avg(+500, −500) = 0
    // 07-08: avg(+500, −500, 0) = 0
    expect(calorieSurplusSeries(entries)).toEqual([
      { date: '2026-07-06', value: 500 },
      { date: '2026-07-07', value: 0 },
      { date: '2026-07-08', value: 0 },
    ])
  })

  it('sums same-date entries before comparing to goal', () => {
    const entries: CalorieEntry[] = [
      { date: '2026-07-08', calories: 2500 },
      { date: '2026-07-08', calories: 2000 }, // total 4500 -> +500
    ]
    expect(calorieSurplusSeries(entries)).toEqual([{ date: '2026-07-08', value: 500 }])
  })

  it('skips unlogged days rather than counting them as a deficit', () => {
    // A gap of >7 days: the later day averages only itself, not a phantom zero.
    const entries: CalorieEntry[] = [
      { date: '2026-07-01', calories: 4200 }, // +200
      { date: '2026-07-20', calories: 3800 }, // −200, window has only this day
    ]
    expect(calorieSurplusSeries(entries)).toEqual([
      { date: '2026-07-01', value: 200 },
      { date: '2026-07-20', value: -200 },
    ])
  })

  it('respects a custom goal', () => {
    const entries: CalorieEntry[] = [{ date: '2026-07-08', calories: 3500 }]
    expect(calorieSurplusSeries(entries, 3000)).toEqual([{ date: '2026-07-08', value: 500 }])
  })

  it('returns an empty series when there are no entries', () => {
    expect(calorieSurplusSeries([])).toEqual([])
  })
})

describe('caloriePR', () => {
  it('returns the day when this week beats all prior days and is >= goal', () => {
    const entries: CalorieEntry[] = [
      { date: PRIOR_WEEK, calories: 4100 },
      { date: THIS_WEEK, calories: 4500 },
    ]
    expect(caloriePR(entries, TODAY)).toEqual({ date: THIS_WEEK, calories: 4500 })
  })

  it('sums same-date entries for the PR day', () => {
    const entries: CalorieEntry[] = [
      { date: PRIOR_WEEK, calories: 3000 },
      { date: THIS_WEEK, calories: 2500 },
      { date: THIS_WEEK, calories: 2000 }, // total 4500
    ]
    expect(caloriePR(entries, TODAY)).toEqual({ date: THIS_WEEK, calories: 4500 })
  })

  it('prefers the latest date when this week has tied maxima', () => {
    const entries: CalorieEntry[] = [
      { date: THIS_WEEK, calories: 4200 },
      { date: THIS_WEEK_2, calories: 4200 },
    ]
    expect(caloriePR(entries, TODAY)).toEqual({ date: THIS_WEEK_2, calories: 4200 })
  })

  it('returns null when this week does not beat a prior day', () => {
    const entries: CalorieEntry[] = [
      { date: PRIOR_WEEK, calories: 4800 },
      { date: THIS_WEEK, calories: 4500 },
    ]
    expect(caloriePR(entries, TODAY)).toBeNull()
  })

  it('returns null when this week is under the goal', () => {
    const entries: CalorieEntry[] = [
      { date: PRIOR_WEEK, calories: 2000 },
      { date: THIS_WEEK, calories: 3500 },
    ]
    expect(caloriePR(entries, TODAY)).toBeNull()
  })

  it('returns null when there is no prior data and this week is under goal', () => {
    const entries: CalorieEntry[] = [{ date: THIS_WEEK, calories: 3500 }]
    expect(caloriePR(entries, TODAY)).toBeNull()
  })

  it('returns the day when there is no prior data and this week is >= goal', () => {
    const entries: CalorieEntry[] = [{ date: THIS_WEEK, calories: 4000 }]
    expect(caloriePR(entries, TODAY)).toEqual({ date: THIS_WEEK, calories: 4000 })
  })

  it('uses CALORIE_GOAL as the default threshold', () => {
    const entries: CalorieEntry[] = [{ date: THIS_WEEK, calories: CALORIE_GOAL }]
    expect(caloriePR(entries, TODAY)).toEqual({ date: THIS_WEEK, calories: CALORIE_GOAL })
  })
})
