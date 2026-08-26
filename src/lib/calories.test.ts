import { describe, it, expect } from 'vitest'
import {
  CALORIE_GOAL,
  caloriePaceFraction,
  calorieSurplusSeries,
  dayTotals,
  totalForDate,
  calorieHitDates,
  caloriePR,
  coalesceHelping,
  setDayTotal,
  mergeCaloriesByDate,
  foodLogStatus,
  formatClock,
  formatElapsed,
  formatHelping,
  isEmptyDayNagTime,
  isFoodLogStale,
  lastLoggedAt,
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

  it('collapses multi-row server dates to the last row, not their sum', () => {
    // Each row is the whole running total at the moment of a tap, so summing
    // them multiplies the day by its tap count — this is how 8/3/2026 came back
    // as 35,000 calories once the client posted totals to a sheet still
    // appending a row per POST.
    const server: CalorieEntry[] = [
      { date: '2026-07-08', calories: 500 },
      { date: '2026-07-08', calories: 800 },
      { date: '2026-07-08', calories: 1300 },
    ]
    expect(mergeCaloriesByDate([], server)).toEqual([{ date: '2026-07-08', calories: 1300 }])
  })

  it('takes the last row even when it is lower, so a −100 correction survives', () => {
    const server: CalorieEntry[] = [
      { date: '2026-07-08', calories: 4000 },
      { date: '2026-07-08', calories: 3900 },
    ]
    expect(mergeCaloriesByDate([], server)).toEqual([{ date: '2026-07-08', calories: 3900 }])
  })

  it('serverWins overwrites a date local already has', () => {
    const local: CalorieEntry[] = [{ date: '2026-07-08', calories: 35000 }] // inflated cache
    const server: CalorieEntry[] = [{ date: '2026-07-08', calories: 4000 }] // repaired sheet
    expect(mergeCaloriesByDate(local, server, { serverWins: true })).toEqual([
      { date: '2026-07-08', calories: 4000 },
    ])
  })

  it('serverWins still keeps dates the server has nothing for', () => {
    const local: CalorieEntry[] = [
      { date: '2026-07-08', calories: 35000 },
      { date: '2026-07-09', calories: 2200 }, // logged offline, never sent
    ]
    const server: CalorieEntry[] = [{ date: '2026-07-08', calories: 4000 }]
    expect(mergeCaloriesByDate(local, server, { serverWins: true })).toEqual([
      { date: '2026-07-08', calories: 4000 },
      { date: '2026-07-09', calories: 2200 },
    ])
  })
})

describe('lastLoggedAt', () => {
  const AT_NOON = new Date(2026, 6, 8, 12, 0).toISOString()
  const AT_6PM = new Date(2026, 6, 8, 18, 0).toISOString()

  it('returns the newest timestamp for the date', () => {
    const entries: CalorieEntry[] = [
      { date: '2026-07-08', calories: 500, loggedAt: AT_NOON },
      { date: '2026-07-08', calories: 900, loggedAt: AT_6PM },
      { date: '2026-07-09', calories: 100, loggedAt: new Date(2026, 6, 9, 8, 0).toISOString() },
    ]
    expect(lastLoggedAt(entries, '2026-07-08')).toEqual(new Date(AT_6PM))
  })

  it('is null for a date with entries but no timestamp', () => {
    expect(lastLoggedAt([{ date: '2026-07-08', calories: 900 }], '2026-07-08')).toBeNull()
  })

  it('ignores an unparseable timestamp', () => {
    const entries: CalorieEntry[] = [{ date: '2026-07-08', calories: 900, loggedAt: 'nonsense' }]
    expect(lastLoggedAt(entries, '2026-07-08')).toBeNull()
  })
})

describe('setDayTotal timestamps', () => {
  const AT_NOON = new Date(2026, 6, 8, 12, 0).toISOString()
  const AT_6PM = new Date(2026, 6, 8, 18, 0).toISOString()

  it('stamps the date when a log time is given', () => {
    expect(setDayTotal([], '2026-07-08', 500, AT_NOON)).toEqual([
      { date: '2026-07-08', calories: 500, loggedAt: AT_NOON },
    ])
  })

  it('replaces an older stamp with the newer tap', () => {
    const prev: CalorieEntry[] = [{ date: '2026-07-08', calories: 500, loggedAt: AT_NOON }]
    expect(setDayTotal(prev, '2026-07-08', 900, AT_6PM)).toEqual([
      { date: '2026-07-08', calories: 900, loggedAt: AT_6PM },
    ])
  })

  it('keeps the existing stamp when a backfill supplies none', () => {
    const prev: CalorieEntry[] = [{ date: '2026-07-08', calories: 500, loggedAt: AT_NOON }]
    expect(setDayTotal(prev, '2026-07-08', 900)).toEqual([
      { date: '2026-07-08', calories: 900, loggedAt: AT_NOON },
    ])
  })

  it('records the helping alongside the stamp', () => {
    expect(setDayTotal([], '2026-07-08', 500, AT_NOON, 500)).toEqual([
      { date: '2026-07-08', calories: 500, loggedAt: AT_NOON, lastAmount: 500 },
    ])
  })

  it('records a correction as the negative helping it was', () => {
    const prev: CalorieEntry[] = [{ date: '2026-07-08', calories: 500, loggedAt: AT_NOON, lastAmount: 500 }]
    expect(setDayTotal(prev, '2026-07-08', 400, AT_6PM, -100)).toEqual([
      { date: '2026-07-08', calories: 400, loggedAt: AT_6PM, lastAmount: -100 },
    ])
  })

  it('keeps the stamped helping when a backfill supplies neither', () => {
    const prev: CalorieEntry[] = [{ date: '2026-07-08', calories: 500, loggedAt: AT_NOON, lastAmount: 500 }]
    expect(setDayTotal(prev, '2026-07-08', 900)).toEqual([
      { date: '2026-07-08', calories: 900, loggedAt: AT_NOON, lastAmount: 500 },
    ])
  })
})

describe('coalesceHelping', () => {
  const DATE = '2026-07-08'
  const at = (h: number, m: number) => new Date(2026, 6, 8, h, m)
  const stamped = (total: number, when: Date, amount: number): CalorieEntry[] => [
    { date: DATE, calories: total, loggedAt: when.toISOString(), lastAmount: amount },
  ]

  it('reports a lone tap as itself', () => {
    expect(coalesceHelping([], DATE, 500, at(18, 0))).toBe(500)
  })

  it('adds up a burst of quick-adds into the plate they logged', () => {
    let entries: CalorieEntry[] = []
    let helping: number | undefined
    for (const [i, cal] of [500, 100, 100, 100, 100].entries()) {
      const now = new Date(at(18, 0).getTime() + i * 4000)
      helping = coalesceHelping(entries, DATE, cal, now)
      entries = setDayTotal(entries, DATE, 0, now.toISOString(), helping)
    }
    expect(helping).toBe(900)
  })

  it('starts over once the taps are far enough apart', () => {
    expect(coalesceHelping(stamped(500, at(18, 0), 500), DATE, 100, at(18, 4))).toBe(100)
  })

  it('nets a correction against the tap it undoes', () => {
    expect(coalesceHelping(stamped(600, at(18, 0), 600), DATE, -100, at(18, 1))).toBe(500)
  })

  it('reports no helping when the burst nets to nothing', () => {
    expect(coalesceHelping(stamped(100, at(18, 0), 100), DATE, -100, at(18, 1))).toBeUndefined()
  })

  it('leaves a stamp with no recorded helping alone', () => {
    const prev: CalorieEntry[] = [{ date: DATE, calories: 500, loggedAt: at(18, 0).toISOString() }]
    expect(coalesceHelping(prev, DATE, 100, at(18, 1))).toBe(100)
  })

  it('ignores a burst on another date', () => {
    expect(coalesceHelping(stamped(500, at(18, 0), 500), '2026-07-09', 100, at(18, 1))).toBe(100)
  })
})

describe('mergeCaloriesByDate timestamps', () => {
  const AT_NOON = new Date(2026, 6, 8, 12, 0).toISOString()
  const AT_6PM = new Date(2026, 6, 8, 18, 0).toISOString()

  it('takes the newer stamp even when the local total wins', () => {
    const local: CalorieEntry[] = [{ date: '2026-07-08', calories: 800, loggedAt: AT_NOON }]
    const server: CalorieEntry[] = [{ date: '2026-07-08', calories: 500, loggedAt: AT_6PM }]
    expect(mergeCaloriesByDate(local, server)).toEqual([
      { date: '2026-07-08', calories: 800, loggedAt: AT_6PM },
    ])
  })

  it('adopts the server stamp for a local entry that has none', () => {
    const local: CalorieEntry[] = [{ date: '2026-07-08', calories: 800 }]
    const server: CalorieEntry[] = [{ date: '2026-07-08', calories: 800, loggedAt: AT_NOON }]
    expect(mergeCaloriesByDate(local, server)).toEqual([
      { date: '2026-07-08', calories: 800, loggedAt: AT_NOON },
    ])
  })

  it('keeps the local stamp when the server has none', () => {
    const local: CalorieEntry[] = [{ date: '2026-07-08', calories: 800, loggedAt: AT_6PM }]
    const server: CalorieEntry[] = [{ date: '2026-07-08', calories: 500 }]
    expect(mergeCaloriesByDate(local, server)).toEqual([
      { date: '2026-07-08', calories: 800, loggedAt: AT_6PM },
    ])
  })

  it('brings the helping with the stamp it won on', () => {
    const local: CalorieEntry[] = [{ date: '2026-07-08', calories: 800, loggedAt: AT_NOON, lastAmount: 300 }]
    const server: CalorieEntry[] = [{ date: '2026-07-08', calories: 500, loggedAt: AT_6PM, lastAmount: 500 }]
    expect(mergeCaloriesByDate(local, server)).toEqual([
      { date: '2026-07-08', calories: 800, loggedAt: AT_6PM, lastAmount: 500 },
    ])
  })
})

describe('formatClock', () => {
  it('formats 12-hour time with am/pm', () => {
    expect(formatClock(new Date(2026, 6, 8, 15, 40))).toBe('3:40 pm')
    expect(formatClock(new Date(2026, 6, 8, 9, 5))).toBe('9:05 am')
  })

  it('renders both noon and midnight as 12', () => {
    expect(formatClock(new Date(2026, 6, 8, 12, 0))).toBe('12:00 pm')
    expect(formatClock(new Date(2026, 6, 8, 0, 30))).toBe('12:30 am')
  })
})

describe('formatElapsed', () => {
  const NOW = new Date(2026, 6, 8, 18, 0)
  const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)

  it('reads "just now" under a minute', () => {
    expect(formatElapsed(minsAgo(0), NOW)).toBe('just now')
  })

  it('counts minutes, then hours, then days', () => {
    expect(formatElapsed(minsAgo(45), NOW)).toBe('45m ago')
    expect(formatElapsed(minsAgo(120), NOW)).toBe('2h ago')
    expect(formatElapsed(minsAgo(125), NOW)).toBe('2h 5m ago')
    expect(formatElapsed(minsAgo(60 * 24 * 3), NOW)).toBe('3d ago')
  })
})

describe('isFoodLogStale', () => {
  const at = (h: number, m = 0) => new Date(2026, 6, 8, h, m)

  it('flags a four-hour gap inside the eating window', () => {
    expect(isFoodLogStale(at(10), at(14))).toBe(true)
  })

  it('does not flag a recent log', () => {
    expect(isFoodLogStale(at(12), at(14))).toBe(false)
  })

  it('stays quiet outside the eating window, however long the gap', () => {
    expect(isFoodLogStale(at(20), at(23))).toBe(false)
    expect(isFoodLogStale(at(20, 0), at(7, 0))).toBe(false) // overnight fast
  })

  it('treats a day with nothing logged as stale only from the nag hour', () => {
    expect(isFoodLogStale(null, at(13))).toBe(true)
    expect(isFoodLogStale(null, at(7))).toBe(false)
    expect(isFoodLogStale(null, at(10, 59))).toBe(false) // morning is not a missed meal
    expect(isFoodLogStale(null, at(11))).toBe(true)
  })
})

describe('isEmptyDayNagTime', () => {
  const at = (h: number, m = 0) => new Date(2026, 6, 8, h, m)

  it('stays quiet through the morning', () => {
    expect(isEmptyDayNagTime(at(6))).toBe(false)
    expect(isEmptyDayNagTime(at(9))).toBe(false)
    expect(isEmptyDayNagTime(at(10, 59))).toBe(false)
  })

  it('starts at 11am and runs to the end of the eating window', () => {
    expect(isEmptyDayNagTime(at(11))).toBe(true)
    expect(isEmptyDayNagTime(at(17))).toBe(true)
    expect(isEmptyDayNagTime(at(21))).toBe(true)
    expect(isEmptyDayNagTime(at(22))).toBe(false)
  })
})

describe('formatHelping', () => {
  it('signs an addition', () => {
    expect(formatHelping(500)).toBe('+500')
  })

  it('signs a correction with a typographic minus, matching the button', () => {
    expect(formatHelping(-100)).toBe('−100')
  })
})

describe('foodLogStatus', () => {
  // Wednesday 2026-07-08, the same reference day the clock helpers above use.
  const TODAY_ISO = '2026-07-08'
  const at = (h: number, m = 0) => new Date(2026, 6, 8, h, m)
  const logged = (h: number, calories = 800): CalorieEntry[] => [
    { date: TODAY_ISO, calories, loggedAt: at(h).toISOString() },
  ]

  it('says nothing about an empty day, whatever the hour', () => {
    expect(foodLogStatus([], TODAY_ISO, at(7))).toEqual({ label: '', stale: false })
    expect(foodLogStatus([], TODAY_ISO, at(11))).toEqual({ label: '', stale: false })
    expect(foodLogStatus([], TODAY_ISO, at(15))).toEqual({ label: '', stale: false })
    expect(foodLogStatus([], TODAY_ISO, at(22))).toEqual({ label: '', stale: false })
  })

  it('counts a morning log, so the nag hour passes quietly', () => {
    expect(foodLogStatus(logged(8), TODAY_ISO, at(11))).toEqual({ label: '3h ago', stale: false })
  })

  it('flags a real four-hour gap even before the nag hour', () => {
    expect(foodLogStatus(logged(6), TODAY_ISO, at(10))).toEqual({ label: '4h ago', stale: true })
  })

  it('says nothing for a day with a total but no timestamp', () => {
    const untimed: CalorieEntry[] = [{ date: TODAY_ISO, calories: 1200 }]
    expect(foodLogStatus(untimed, TODAY_ISO, at(15))).toEqual({ label: '', stale: false })
  })

  it('leads with the last helping when the entry records one', () => {
    const withAmount: CalorieEntry[] = [
      { date: TODAY_ISO, calories: 1300, loggedAt: at(8).toISOString(), lastAmount: 500 },
    ]
    expect(foodLogStatus(withAmount, TODAY_ISO, at(11))).toEqual({ label: '+500 · 3h ago', stale: false })
  })

  it('still says how long ago for an entry that predates the helping field', () => {
    expect(foodLogStatus(logged(8), TODAY_ISO, at(11))).toEqual({ label: '3h ago', stale: false })
  })

  it('shows a past day as its date, never flagged', () => {
    expect(foodLogStatus([], '2026-07-06', at(15))).toEqual({ label: '07-06', stale: false })
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
