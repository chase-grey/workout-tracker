import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_WEEK_START,
  addDaysISO,
  enumerateWeeks,
  mondayISO,
  mondayIndexOrder,
  mondayOf,
  normalizeWeekStart,
  sameWeek,
  setWeekStartDay,
  toISODate,
  weekDatesISO,
  weekStartDay,
  weekStartISO,
  weekStartOf,
  weekdayOrder,
  type WeekStartDay,
} from './dates'
import { calorieHitsByWeek, type CalorieEntry } from './calories'
import { buildCardioPlan, cardioSessionsForWeek, plannedOn, plannedSessionCount, suggestTargetDate, MI_5K } from './cardioPlan'
import { profileWeeklyGoals, withWeeklyGoals, type Profile } from './profile'
import {
  dateOfWeekday,
  hasSchedule,
  pinsForWeek,
  scheduledWeekdays,
  shiftWeek,
  weekCalendar,
  weekDates,
  withWeekPins,
  withoutWeekPins,
  type WeekCalendarInput,
} from './weekCalendar'
import { calDaysRequiredByNow, weekDaysCompleted, weekPace } from './weekPace'
import { weeklyStreakHistory } from './weeklyStreak'

afterEach(() => setWeekStartDay(undefined))

const SUN: WeekStartDay = 0
const MON: WeekStartDay = 1
const SAT: WeekStartDay = 6
const ALL: WeekStartDay[] = [0, 1, 2, 3, 4, 5, 6]

// Thursday 2026-11-19. Its Monday week is 11-16…11-22, its Sunday week
// 11-15…11-21, its Saturday week 11-14…11-20.
const THU = '2026-11-19'

describe('the one week helper', () => {
  it('starts weeks on Monday unless told otherwise', () => {
    expect(DEFAULT_WEEK_START).toBe(1)
    expect(weekStartDay()).toBe(1)
    expect(weekStartISO(THU)).toBe('2026-11-16')
    expect(toISODate(mondayOf(new Date(2026, 10, 19, 20)))).toBe('2026-11-16')
  })

  it('snaps a date to its week under Monday, Sunday and Saturday starts', () => {
    expect(weekStartISO(THU, MON)).toBe('2026-11-16')
    expect(weekStartISO(THU, SUN)).toBe('2026-11-15')
    expect(weekStartISO(THU, SAT)).toBe('2026-11-14')
    // The start day itself is the first day of its own week, and the day before it the last of the one before.
    expect(weekStartISO('2026-11-15', SUN)).toBe('2026-11-15')
    expect(weekStartISO('2026-11-14', SUN)).toBe('2026-11-08')
    expect(weekStartISO('2026-11-14', SAT)).toBe('2026-11-14')
    expect(weekStartISO('2026-11-13', SAT)).toBe('2026-11-07')
    expect(weekStartISO('2026-11-22', MON)).toBe('2026-11-16')
  })

  it('always lands on the start day, at most six days back, for every start day', () => {
    for (const start of ALL) {
      for (let i = 0; i < 28; i++) {
        const day = new Date(2026, 5, 1 + i, 15)
        const first = weekStartOf(day, start)
        expect(first.getDay()).toBe(start)
        const back = Math.round((new Date(2026, 5, 1 + i).getTime() - first.getTime()) / 86400000)
        expect(back).toBeGreaterThanOrEqual(0)
        expect(back).toBeLessThanOrEqual(6)
      }
    }
  })

  it('follows the chosen day everywhere a start day is not named, old names included', () => {
    setWeekStartDay(SUN)
    expect(weekStartISO(THU)).toBe('2026-11-15')
    expect(toISODate(mondayOf(new Date(2026, 10, 19)))).toBe('2026-11-15')
    expect(weekDatesISO(THU)).toEqual([
      '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21',
    ])
    setWeekStartDay(SAT)
    expect(weekStartISO(THU)).toBe('2026-11-14')
    expect(weekDatesISO(THU)[6]).toBe('2026-11-20')
  })

  it('keeps a true Monday for what is saved in Monday weeks', () => {
    setWeekStartDay(SAT)
    expect(mondayISO(THU)).toBe('2026-11-16')
    expect(mondayISO('2026-11-22')).toBe('2026-11-16')
  })

  it('reads anything that is not a day of the week as Monday', () => {
    for (const bad of [undefined, null, 7, -1, 1.5, '0', NaN]) expect(normalizeWeekStart(bad)).toBe(1)
    expect(normalizeWeekStart(0)).toBe(0)
    expect(normalizeWeekStart(6)).toBe(6)
    setWeekStartDay(SUN)
    setWeekStartDay('nonsense')
    expect(weekStartDay()).toBe(1)
  })

  it('orders the days of the week from the start day', () => {
    expect(weekdayOrder(MON)).toEqual([1, 2, 3, 4, 5, 6, 0])
    expect(weekdayOrder(SUN)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(weekdayOrder(SAT)).toEqual([6, 0, 1, 2, 3, 4, 5])
    // Monday-first numbering, the way schedules store a weekday.
    expect(mondayIndexOrder(MON)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(mondayIndexOrder(SUN)).toEqual([6, 0, 1, 2, 3, 4, 5])
    expect(mondayIndexOrder(SAT)).toEqual([5, 6, 0, 1, 2, 3, 4])
  })

  it('matches a saved week key by the week it falls in', () => {
    // Monday 11-16 was a week key; under a Sunday start it names the week of 11-15.
    expect(sameWeek('2026-11-16', '2026-11-15', SUN)).toBe(true)
    expect(sameWeek('2026-11-16', '2026-11-15', MON)).toBe(false)
    expect(sameWeek('2026-11-16', '2026-11-14', SAT)).toBe(true)
  })

  it('enumerates weeks a week apart from whatever start it is given', () => {
    expect(enumerateWeeks('2026-11-01', '2026-11-15')).toEqual(['2026-11-01', '2026-11-08', '2026-11-15'])
  })
})

describe('history under a different start day', () => {
  // Six weeks of dates, some days on and some off.
  const dates: string[] = []
  for (let i = 0; i < 42; i++) if (i % 3 !== 1) dates.push(addDaysISO('2026-10-05', i))

  it('puts every logged day in exactly one week, whichever day weeks start on', () => {
    const entries: CalorieEntry[] = dates.map((date) => ({ date, calories: 5000 }) as CalorieEntry)
    for (const start of ALL) {
      setWeekStartDay(start)
      const byWeek = calorieHitsByWeek(entries, 4500)
      expect([...byWeek.values()].reduce((a, b) => a + b, 0)).toBe(dates.length)
      for (const [week, hits] of byWeek) {
        expect(weekStartISO(week)).toBe(week)
        expect(hits).toBe(dates.filter((d) => weekStartISO(d) === week).length)
      }
    }
  })

  it('replays the streak over the same days with none lost and none counted twice', () => {
    const config = { workouts: 2, flex: 0, calDays: 0 }
    for (const start of [SUN, MON, SAT]) {
      setWeekStartDay(start)
      const history = weeklyStreakHistory({
        workoutDates: dates,
        flexDates: [],
        calorieHitDates: [],
        today: new Date(2026, 10, 30),
        config,
      })
      expect(history.reduce((n, w) => n + w.counts.workouts, 0)).toBe(dates.length)
      expect(new Set(history.map((w) => w.week)).size).toBe(history.length)
      for (const w of history) expect(new Date(`${w.week}T12:00`).getDay()).toBe(start)
    }
  })

  it('holds a goal set under Monday weeks from the same week after the start day moves', () => {
    // Raised on Monday 11-16, when weeks began on Monday.
    const profile: Profile = {
      name: 'Test',
      pillars: ['strength'],
      weeklyGoals: [
        { from: '0000-01-01', goals: { workouts: 2, flex: 0, calDays: 0, cardio: 0 } },
        { from: '2026-11-16', goals: { workouts: 4, flex: 0, calDays: 0, cardio: 0 } },
      ],
      calorieGoals: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    expect(profileWeeklyGoals(profile, '2026-11-09').workouts).toBe(2)
    expect(profileWeeklyGoals(profile, '2026-11-16').workouts).toBe(4)

    setWeekStartDay(SUN)
    // The Sunday week of 11-15 contains that Monday, so it is the first held to four.
    expect(profileWeeklyGoals(profile, '2026-11-08').workouts).toBe(2)
    expect(profileWeeklyGoals(profile, '2026-11-15').workouts).toBe(4)
    expect(profileWeeklyGoals(profile, '2026-11-22').workouts).toBe(4)

    // Changing it again inside that week replaces the entry rather than stacking a second.
    const again = withWeeklyGoals(profile, { workouts: 3, flex: 0, calDays: 0, cardio: 0 }, weekStartISO('2026-11-19'))
    expect(again.weeklyGoals.map((g) => g.from)).toEqual(['0000-01-01', '2026-11-15'])
    expect(profileWeeklyGoals(again, '2026-11-15').workouts).toBe(3)
  })
})

describe('the week calendar under a different start day', () => {
  function input(over: Partial<WeekCalendarInput> = {}): WeekCalendarInput {
    return {
      weekStart: THU,
      today: '2026-11-15',
      pillars: ['strength'],
      workouts: [],
      liftDays: ['push', 'pull'],
      liftLabels: { push: 'push', pull: 'pull', fullbody: 'full body' } as WeekCalendarInput['liftLabels'],
      flexEntries: [],
      stretchRotation: [],
      stretchLabels: {} as WeekCalendarInput['stretchLabels'],
      cardioEntries: [],
      calorieEntries: [],
      calorieGoalOn: () => 3000,
      ...over,
    }
  }

  it('lays the week out from the chosen day and names each day by what it is', () => {
    setWeekStartDay(SUN)
    expect(weekDates(THU)[0]).toBe('2026-11-15')
    expect(shiftWeek(THU, 1)).toBe('2026-11-22')
    const days = weekCalendar(input())
    expect(days.map((d) => d.date)).toEqual(weekDatesISO(THU, SUN))
    // 0 = Monday … 6 = Sunday, so a Sunday-first week reads 6, 0, 1, …
    expect(days.map((d) => d.weekday)).toEqual([6, 0, 1, 2, 3, 4, 5])
  })

  it('keeps a pinned Tuesday on Tuesday', () => {
    for (const start of [MON, SUN, SAT]) {
      setWeekStartDay(start)
      const days = weekCalendar(input({ today: '2026-11-01', pins: { strength: [1, 6] } }))
      const planned = days.filter((d) => d.items.length > 0).map((d) => new Date(`${d.date}T12:00`).getDay())
      expect(planned.sort()).toEqual([0, 2]) // Sunday and Tuesday, in getDay numbers
      expect(scheduledWeekdays(days, 'strength').sort()).toEqual([1, 6])
      expect(new Date(`${dateOfWeekday(THU, 1)}T12:00`).getDay()).toBe(2)
    }
  })

  it('finds a week saved under its Monday once weeks start on Sunday, and does not double it', () => {
    const saved = { '2026-11-16': { strength: [3] } }
    setWeekStartDay(SUN)
    expect(pinsForWeek(saved, '2026-11-15')).toEqual({ strength: [3] })
    expect(hasSchedule(undefined, saved, THU)).toBe(true)
    expect(pinsForWeek(saved, '2026-11-22')).toBeUndefined()

    const days = weekCalendar(input({ weekPins: saved, pins: { strength: [0] } }))
    expect(scheduledWeekdays(days, 'strength')).toEqual([3])

    const edited = withWeekPins(saved, '2026-11-15', 'strength', [4], '2026-11-15')
    expect(edited).toEqual({ '2026-11-15': { strength: [4] } })
    expect(withoutWeekPins(saved, '2026-11-15')).toEqual({})
  })
})

describe('the cardio plan under a different start day', () => {
  const level = { longestMin: 10, longestMi: 0.8, weeklyMin: 20 }
  const goal = { type: 'distance', distanceMi: MI_5K } as const
  const days = [1, 3, 5] // tue, thu, sat
  const make = () =>
    buildCardioPlan(
      { kind: 'run', goal, level, days, targetDate: suggestTargetDate('run', goal, level, days, '2026-11-16') },
      '2026-11-16',
      undefined,
      'p1',
    )

  it('keeps its sessions on the dates they were planned for', () => {
    const plan = make()
    const monday = cardioSessionsForWeek(plan, '2026-11-16').map((s) => s.date)
    expect(monday).toEqual(['2026-11-17', '2026-11-19', '2026-11-21'])

    setWeekStartDay(SUN)
    expect(make()).toEqual(plan)
    expect(cardioSessionsForWeek(plan, THU).map((s) => s.date)).toEqual(monday)
    expect(plannedSessionCount(plan, THU)).toBe(3)
    expect(plannedOn(plan, '2026-11-21')?.date).toBe('2026-11-21')

    // A Saturday week takes last Saturday's session with this Tuesday's and Thursday's.
    setWeekStartDay(SAT)
    expect(cardioSessionsForWeek(plan, THU).map((s) => s.date)).toEqual(['2026-11-17', '2026-11-19'])
    expect(cardioSessionsForWeek(plan, '2026-11-21').map((s) => s.date)).toEqual(['2026-11-21', '2026-11-24', '2026-11-26'])
  })

  it('hands every planned session to exactly one week', () => {
    const plan = make()
    const all = plan.weeks.flatMap((w) => w.sessions.map((s) => addDaysISO(w.start, s.day))).sort()
    for (const start of [SUN, MON, SAT]) {
      setWeekStartDay(start)
      const seen: string[] = []
      let counted = 0
      for (const wk of enumerateWeeks(weekStartISO(all[0]), all[all.length - 1])) {
        seen.push(...cardioSessionsForWeek(plan, wk).map((s) => s.date))
        counted += plannedSessionCount(plan, wk) ?? 0
      }
      expect(seen).toEqual(all)
      expect(counted).toBe(all.length)
    }
  })

  it('has nothing to say about a week the plan does not reach', () => {
    setWeekStartDay(SUN)
    expect(plannedSessionCount(make(), '2026-10-04')).toBeNull()
    expect(cardioSessionsForWeek(make(), '2026-10-04')).toEqual([])
  })
})

describe('pace under a different start day', () => {
  it('counts finished days from the chosen first day', () => {
    setWeekStartDay(SUN)
    expect(weekDaysCompleted(new Date(2026, 10, 15, 23))).toBe(0) // Sunday
    expect(weekDaysCompleted(new Date(2026, 10, 18, 20))).toBe(3) // Wednesday
    expect(weekDaysCompleted(new Date(2026, 10, 21, 23))).toBe(6) // Saturday
    expect(calDaysRequiredByNow(7, new Date(2026, 10, 18, 20))).toBe(3)

    setWeekStartDay(SAT)
    expect(weekDaysCompleted(new Date(2026, 10, 14, 9))).toBe(0)
    expect(weekDaysCompleted(new Date(2026, 10, 20, 9))).toBe(6)
  })

  it('starts the marker on the first evening and finishes it on the last', () => {
    setWeekStartDay(SUN)
    const goals = { workouts: 2, flex: 0, calDays: 0 }
    expect(weekPace({ workouts: 0, flex: 0, calDays: 0 }, goals, new Date(2026, 10, 15, 12)).requiredFraction).toBe(0)
    expect(weekPace({ workouts: 0, flex: 0, calDays: 0 }, goals, new Date(2026, 10, 21, 21)).requiredFraction).toBe(1)
  })
})
