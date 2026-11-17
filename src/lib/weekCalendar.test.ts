import { describe, expect, it } from 'vitest'
import type { DayType, WorkoutRow } from '../types'
import type { FlexEntry } from './flex'
import type { WeeklyGoalConfig } from './weeklyStreak'
import {
  defaultCalendarDate,
  pillarMarks,
  shiftWeek,
  spreadDays,
  togglePin,
  weekCalendar,
  weekDates,
  type WeekCalendarInput,
} from './weekCalendar'

// Week of Mon 2026-11-16 … Sun 2026-11-22.
const MON = '2026-11-16'
const WED = '2026-11-18'

const GOALS: WeeklyGoalConfig = { workouts: 2, flex: 2, calDays: 6, cardio: 2 }

function lift(date: string, day: DayType, id = `${date}-${day}`): WorkoutRow {
  return {
    session_id: id,
    date,
    day_type: day,
    exercise: 'bench',
    set_number: 1,
    weight_lbs: 100,
    reps: 8,
    notes: '',
    is_historical: false,
  } as WorkoutRow
}

function stretch(date: string, routines?: FlexEntry['routines'], note?: string): FlexEntry {
  return { date, splitDeg: null, tailorsLeftDeg: null, tailorsRightDeg: null, routines, note }
}

function input(over: Partial<WeekCalendarInput> = {}): WeekCalendarInput {
  return {
    weekStart: MON,
    today: MON,
    pillars: ['strength', 'flexibility', 'cardio', 'diet'],
    goalsFor: () => GOALS,
    workouts: [],
    liftDays: ['push', 'pull', 'fullbody'],
    liftLabels: { push: 'push', pull: 'pull', fullbody: 'full body' },
    flexEntries: [],
    stretchRotation: ['head_to_toe', 'side_split'],
    stretchLabels: { side_split: 'side split', head_to_toe: 'head to toe' },
    cardioEntries: [],
    calorieEntries: [],
    calorieGoalOn: () => 3000,
    ...over,
  }
}

const of = (days: ReturnType<typeof weekCalendar>, pillar: string) =>
  days.map((d) => d.items.filter((i) => i.pillar === pillar).map((i) => `${i.status}:${i.label}`))

describe('weekDates / shiftWeek', () => {
  it('lays out Monday to Sunday from any day in the week', () => {
    expect(weekDates(WED)).toEqual([
      '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22',
    ])
    expect(shiftWeek(WED, 1)).toBe('2026-11-23')
    expect(shiftWeek(WED, -1)).toBe('2026-11-09')
  })
})

describe('spreadDays', () => {
  const open = weekDates(MON)
  it('spreads a count evenly, starting with the first open day', () => {
    expect(spreadDays(open, 2)).toEqual(['2026-11-16', '2026-11-19'])
    expect(spreadDays(open, 3)).toEqual(['2026-11-16', '2026-11-18', '2026-11-20'])
  })
  it('fills every day when the count is more than there are days, and none for nothing', () => {
    expect(spreadDays(open.slice(5), 4)).toEqual(open.slice(5))
    expect(spreadDays(open, 0)).toEqual([])
  })
})

describe('weekCalendar', () => {
  it('shows only the pillars tracked', () => {
    const days = weekCalendar(input({ pillars: ['flexibility'] }))
    expect(days.flatMap((d) => d.items).every((i) => i.pillar === 'flexibility')).toBe(true)
  })

  it('marks past, today and future', () => {
    expect(weekCalendar(input({ today: WED })).map((d) => d.when)).toEqual([
      'past', 'past', 'today', 'future', 'future', 'future', 'future',
    ])
  })

  it('projects the lift goal from today on, rotating after the last day trained', () => {
    const days = weekCalendar(input({ pillars: ['strength'], workouts: [lift('2026-11-13', 'push')] }))
    expect(of(days, 'strength')).toEqual([['planned:pull'], [], [], ['planned:full body'], [], [], []])
    expect(days[0].items[0].action).toEqual({ type: 'lift', day: 'pull' })
    expect(days[3].items[0].action).toBeUndefined()
  })

  it('counts what is done this week against the goal and shows it on its day', () => {
    const days = weekCalendar(input({ pillars: ['strength'], today: WED, workouts: [lift(MON, 'push')] }))
    // One of two done; the other spreads from today, and follows push.
    expect(of(days, 'strength')).toEqual([['done:push'], [], ['planned:pull'], [], [], [], []])
  })

  it('leaves today unplanned once the pillar is done today', () => {
    const days = weekCalendar(input({ pillars: ['strength'], goalsFor: () => ({ ...GOALS, workouts: 3 }), workouts: [lift(MON, 'push')] }))
    expect(days[0].items.map((i) => i.status)).toEqual(['done'])
    expect(of(days, 'strength').flat()).toEqual(['done:push', 'planned:pull', 'planned:full body'])
  })

  it('never marks a passed lift day as missed', () => {
    const days = weekCalendar(input({ pillars: ['strength'], today: '2026-11-22' }))
    expect(days.slice(0, 6).every((d) => d.items.length === 0)).toBe(true)
    expect(of(days, 'strength')[6]).toEqual(['planned:push'])
  })

  it('plans pinned weekdays first and spreads the rest of the goal round them', () => {
    const days = weekCalendar(input({ pillars: ['strength'], pins: { strength: [2] } }))
    // Wednesday pinned; the second session spreads over the six unpinned days.
    expect(of(days, 'strength').map((x) => x.length)).toEqual([1, 0, 1, 0, 0, 0, 0])
    // A pin past the goal is still planned.
    const pinned = weekCalendar(input({ pillars: ['strength'], pins: { strength: [0, 2, 4] } }))
    expect(of(pinned, 'strength').map((x) => x.length)).toEqual([1, 0, 1, 0, 1, 0, 0])
  })

  it('carries the rotation into next week past this week’s planned sessions', () => {
    const next = weekCalendar(input({ pillars: ['strength'], weekStart: shiftWeek(MON, 1), workouts: [lift('2026-11-13', 'push')] }))
    // This week plans pull and full body, so next week opens on push.
    expect(of(next, 'strength').flat()).toEqual(['planned:push', 'planned:pull'])
    expect(next.every((d) => d.when === 'future')).toBe(true)
  })

  it('shows a past week as only what was done', () => {
    const days = weekCalendar(input({ pillars: ['strength'], weekStart: shiftWeek(MON, -1), workouts: [lift('2026-11-10', 'pull')] }))
    expect(of(days, 'strength').flat()).toEqual(['done:pull'])
  })

  it('names stretch routines done, a bare measurement as a stretch, and alternates the plan', () => {
    const days = weekCalendar(input({
      pillars: ['flexibility'],
      today: WED,
      goalsFor: () => ({ ...GOALS, flex: 4 }),
      flexEntries: [stretch(MON, ['side_split']), stretch('2026-11-17', undefined, 'measurement')],
    }))
    expect(of(days, 'flexibility').flat()).toEqual([
      'done:side split', 'done:stretch', 'planned:head to toe', 'planned:side split',
    ])
    expect(days[2].items[0].action).toEqual({ type: 'stretch', routine: 'head_to_toe' })
  })

  it('takes planned cardio from the plan when the week has one', () => {
    const days = weekCalendar(input({
      pillars: ['cardio'],
      today: WED,
      cardioEntries: [{ id: 'a', date: MON, kind: 'run', minutes: 30, distanceMi: 3 }],
      plannedCardio: [
        { date: MON, kind: 'run', minutes: 30, label: 'easy run' },
        { date: WED, kind: 'run', minutes: 25, label: 'easy run' },
        { date: '2026-11-21', kind: 'bike', distanceMi: 10, label: 'long ride' },
      ],
    }))
    expect(days[0].items).toEqual([{ pillar: 'cardio', status: 'done', label: 'run', amount: '30m' }])
    expect(days[2].items).toEqual([
      { pillar: 'cardio', status: 'planned', label: 'easy run', amount: '25m', action: { type: 'cardio' } },
    ])
    expect(days[5].items[0].amount).toBe('10mi')
  })

  it('drops today’s planned cardio once one of its kind is logged', () => {
    const days = weekCalendar(input({
      pillars: ['cardio'],
      cardioEntries: [{ id: 'a', date: MON, kind: 'run', minutes: 20 }],
      plannedCardio: [{ date: MON, kind: 'run', minutes: 25, label: 'easy run' }],
    }))
    expect(of(days, 'cardio')[0]).toEqual(['done:run'])
  })

  it('spreads the cardio goal when the week has no plan', () => {
    const days = weekCalendar(input({ pillars: ['cardio'] }))
    expect(of(days, 'cardio').flat()).toEqual(['planned:cardio', 'planned:cardio'])
  })

  it('judges calorie days hit or missed behind, and shows the target ahead', () => {
    const days = weekCalendar(input({
      pillars: ['diet'],
      today: WED,
      calorieEntries: [
        { date: MON, calories: 3200 },
        { date: '2026-11-17', calories: 1200 },
        { date: WED, calories: 800 },
      ],
    }))
    expect(days.slice(0, 4).map((d) => [d.items[0].status, d.items[0].amount])).toEqual([
      ['done', '3200/3000'],
      ['missed', '1200/3000'],
      ['planned', '800/3000'],
      ['planned', '3000'],
    ])
  })

  it('judges a calorie day by the direction of the target', () => {
    const days = weekCalendar(input({
      pillars: ['diet'],
      today: WED,
      dietDirection: 'lose',
      calorieEntries: [{ date: MON, calories: 2500 }],
    }))
    expect(days[0].items[0].status).toBe('done')
    // An unlogged day is not a day under budget.
    expect(days[1].items[0].status).toBe('missed')
  })

  it('orders a day’s items by pillar', () => {
    const days = weekCalendar(input({ calorieEntries: [{ date: MON, calories: 3500 }] }))
    expect(days[0].items.map((i) => i.pillar)).toEqual(['strength', 'flexibility', 'cardio', 'diet'])
  })
})

describe('pillarMarks', () => {
  it('reads done over planned, and nothing for an empty pillar', () => {
    const days = weekCalendar(input({ today: WED, pillars: ['strength', 'diet'], workouts: [lift(MON, 'push')] }))
    expect(pillarMarks(days[0], ['strength', 'diet'])).toMatchObject({ strength: 'done', diet: 'missed' })
    expect(pillarMarks(days[1], ['strength', 'diet'])).toMatchObject({ strength: null, diet: 'missed' })
    expect(pillarMarks(days[2], ['strength', 'diet'])).toMatchObject({ strength: 'planned', diet: 'planned' })
  })
})

describe('togglePin', () => {
  it('adds and removes a weekday, keeping the other pillar', () => {
    const a = togglePin(undefined, 'strength', 3)
    expect(a).toEqual({ strength: [3] })
    const b = togglePin({ ...a, flexibility: [1] }, 'strength', 0)
    expect(b).toEqual({ strength: [0, 3], flexibility: [1] })
    expect(togglePin(b, 'strength', 3)).toEqual({ strength: [0], flexibility: [1] })
  })
})

describe('defaultCalendarDate', () => {
  it('opens on today, a past week’s Sunday, or a coming week’s Monday', () => {
    expect(defaultCalendarDate(MON, WED)).toBe(WED)
    expect(defaultCalendarDate(shiftWeek(MON, -1), WED)).toBe('2026-11-15')
    expect(defaultCalendarDate(shiftWeek(MON, 1), WED)).toBe('2026-11-23')
  })
})
