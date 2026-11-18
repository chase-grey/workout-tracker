import { describe, expect, it } from 'vitest'
import type { DayType, WorkoutRow } from '../types'
import type { FlexEntry } from './flex'
import {
  defaultCalendarDate,
  hasSchedule,
  pillarMarks,
  scheduledWeekdays,
  shiftWeek,
  togglePin,
  weekCalendar,
  weekDates,
  withWeekPins,
  withoutWeekPins,
  type WeekCalendarInput,
} from './weekCalendar'

// Week of Mon 2026-11-16 … Sun 2026-11-22.
const MON = '2026-11-16'
const WED = '2026-11-18'

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
    workouts: [],
    liftDays: ['push', 'pull', 'fullbody'],
    liftLabels: { push: 'push', pull: 'pull', fullbody: 'full body' },
    flexEntries: [],
    stretchRotation: ['head_to_toe', 'side_split'],
    stretchLabels: {
      side_split: 'side split',
      head_to_toe: 'head to toe',
      front_split: 'front split',
      pancake: 'pancake',
      bridge: 'bridge',
      shoulders: 'shoulders',
    },
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

  it('plans nothing ahead until days are chosen', () => {
    const days = weekCalendar(input({
      pillars: ['strength', 'flexibility', 'cardio'],
      workouts: [lift('2026-11-13', 'push')],
    }))
    expect(days.every((d) => d.items.length === 0)).toBe(true)
  })

  it('plans the days chosen, rotating after the last day trained', () => {
    const days = weekCalendar(input({
      pillars: ['strength'],
      pins: { strength: [0, 3] },
      workouts: [lift('2026-11-13', 'push')],
    }))
    expect(of(days, 'strength')).toEqual([['planned:pull'], [], [], ['planned:full body'], [], [], []])
    expect(days[0].items[0].action).toEqual({ type: 'lift', day: 'pull' })
    expect(days[3].items[0].action).toBeUndefined()
  })

  it('shows what is done on its day beside what is still planned', () => {
    const days = weekCalendar(input({
      pillars: ['strength'],
      today: WED,
      pins: { strength: [0, 2] },
      workouts: [lift(MON, 'push')],
    }))
    expect(of(days, 'strength')).toEqual([['done:push'], [], ['planned:pull'], [], [], [], []])
  })

  it('leaves today unplanned once the pillar is done today', () => {
    const days = weekCalendar(input({ pillars: ['strength'], pins: { strength: [0, 2, 4] }, workouts: [lift(MON, 'push')] }))
    expect(days[0].items.map((i) => i.status)).toEqual(['done'])
    expect(of(days, 'strength').flat()).toEqual(['done:push', 'planned:pull', 'planned:full body'])
  })

  it('never marks a passed lift day as missed, and plans no make-up for it', () => {
    const days = weekCalendar(input({ pillars: ['strength'], today: '2026-11-22', pins: { strength: [0, 6] } }))
    expect(days.slice(0, 6).every((d) => d.items.length === 0)).toBe(true)
    expect(of(days, 'strength')[6]).toEqual(['planned:push'])
  })

  it('plans exactly the pinned weekdays', () => {
    const days = weekCalendar(input({ pillars: ['strength'], pins: { strength: [2] } }))
    expect(of(days, 'strength').map((x) => x.length)).toEqual([0, 0, 1, 0, 0, 0, 0])
    const pinned = weekCalendar(input({ pillars: ['strength'], pins: { strength: [0, 2, 4] } }))
    expect(of(pinned, 'strength').map((x) => x.length)).toEqual([1, 0, 1, 0, 1, 0, 0])
  })

  it('carries the rotation into next week past this week’s planned sessions', () => {
    const next = weekCalendar(input({
      pillars: ['strength'],
      weekStart: shiftWeek(MON, 1),
      pins: { strength: [0, 3] },
      workouts: [lift('2026-11-13', 'push')],
    }))
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
      pins: { flexibility: [2, 4] },
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
    expect(days[0].items).toEqual([
      {
        pillar: 'cardio',
        status: 'done',
        label: 'run',
        amount: '30m',
        what: { type: 'cardio', kind: 'run', minutes: 30, distanceMi: 3 },
      },
    ])
    expect(days[2].items).toEqual([
      {
        pillar: 'cardio',
        status: 'planned',
        label: 'easy run',
        amount: '25m',
        what: { type: 'cardio', kind: 'run', minutes: 25, distanceMi: undefined },
        action: { type: 'cardio' },
      },
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

  it('plans no cardio for a week with no plan and no days chosen', () => {
    const days = weekCalendar(input({ pillars: ['cardio'] }))
    expect(of(days, 'cardio').flat()).toEqual([])
  })

  it('judges calorie days hit or missed behind, and leaves the days ahead bare', () => {
    const days = weekCalendar(input({
      pillars: ['diet'],
      today: WED,
      calorieEntries: [
        { date: MON, calories: 3200 },
        { date: '2026-11-17', calories: 1200 },
        { date: WED, calories: 800 },
      ],
    }))
    expect(days.slice(3).map((d) => d.items)).toEqual([[], [], [], []])
    expect(days.slice(0, 3).map((d) => [d.items[0].status, d.items[0].amount])).toEqual([
      ['done', '3200/3000'],
      ['missed', '1200/3000'],
      ['planned', '800/3000'],
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
    const days = weekCalendar(input({
      pins: { strength: [0], flexibility: [0], cardio: [0] },
      calorieEntries: [{ date: MON, calories: 3500 }],
    }))
    expect(days[0].items.map((i) => i.pillar)).toEqual(['strength', 'flexibility', 'cardio', 'diet'])
  })
})

describe('pillarMarks', () => {
  it('reads done over planned, and nothing for an empty pillar', () => {
    const days = weekCalendar(input({
      today: WED,
      pillars: ['strength', 'diet'],
      pins: { strength: [2] },
      workouts: [lift(MON, 'push')],
    }))
    expect(pillarMarks(days[0], ['strength', 'diet'])).toMatchObject({ strength: 'done', diet: 'missed' })
    expect(pillarMarks(days[1], ['strength', 'diet'])).toMatchObject({ strength: null, diet: 'missed' })
    expect(pillarMarks(days[2], ['strength', 'diet'])).toMatchObject({ strength: 'planned', diet: 'planned' })
    expect(pillarMarks(days[3], ['strength', 'diet'])).toMatchObject({ strength: null, diet: null })
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

describe('a week with days of its own', () => {
  it('plans a pillar on exactly those days, whatever the pins say', () => {
    const days = weekCalendar(input({
      pillars: ['strength', 'flexibility'],
      pins: { strength: [0, 2, 4], flexibility: [1, 4] },
      weekPins: { [MON]: { strength: [1] } },
    }))
    expect(scheduledWeekdays(days, 'strength')).toEqual([1])
    // A pillar the week doesn't name keeps its standing days.
    expect(scheduledWeekdays(days, 'flexibility')).toEqual([1, 4])
  })

  it('leaves the other weeks to the standing schedule', () => {
    const days = weekCalendar(input({
      weekStart: shiftWeek(MON, 1),
      pillars: ['strength'],
      pins: { strength: [0, 2] },
      weekPins: { [MON]: { strength: [1] } },
    }))
    expect(scheduledWeekdays(days, 'strength')).toEqual([0, 2])
  })

  it('shows what is behind you as it happened, and only the days still open', () => {
    const days = weekCalendar(input({
      pillars: ['strength'],
      today: WED,
      workouts: [lift(MON, 'push')],
      weekPins: { [MON]: { strength: [1, 4] } },
    }))
    expect(of(days, 'strength').map((d) => d[0] ?? null)).toEqual([
      'done:push', null, null, null, 'planned:pull', null, null,
    ])
  })

  it('can be left empty: nothing more planned that week', () => {
    const days = weekCalendar(input({ pillars: ['strength'], weekPins: { [MON]: { strength: [] } } }))
    expect(scheduledWeekdays(days, 'strength')).toEqual([])
  })
})

describe('cardio pins', () => {
  it('plan the pinned days when the week has no cardio plan', () => {
    const days = weekCalendar(input({ pillars: ['cardio'], pins: { cardio: [1, 5] } }))
    expect(scheduledWeekdays(days, 'cardio')).toEqual([1, 5])
  })

  it('step aside for a week the cardio plan lays out', () => {
    const days = weekCalendar(input({
      pillars: ['cardio'],
      pins: { cardio: [1, 5] },
      plannedCardio: [{ date: WED, kind: 'run', minutes: 25, label: 'easy run' }],
    }))
    expect(scheduledWeekdays(days, 'cardio')).toEqual([2])
  })
})

describe('what an item is', () => {
  it('names the lift day and the routine on done and planned sessions alike', () => {
    const days = weekCalendar(input({
      pillars: ['strength', 'flexibility'],
      today: WED,
      pins: { strength: [2, 4], flexibility: [2, 5] },
      workouts: [lift(MON, 'push')],
    }))
    expect(days[0].items[0].what).toEqual({ type: 'lift', day: 'push' })
    const planned = days.flatMap((d) => d.items).filter((i) => i.status === 'planned')
    expect(planned.every((i) => i.what)).toBe(true)
    // Only today's can be started; a later day's can still be looked at.
    expect(planned.filter((i) => i.action).length).toBeLessThan(planned.length)
  })
})

describe('withWeekPins', () => {
  it('sets one pillar of one week and keeps the rest', () => {
    const a = withWeekPins(undefined, WED, 'strength', [4, 1, 1], MON)
    expect(a).toEqual({ [MON]: { strength: [1, 4] } })
    const b = withWeekPins(a, MON, 'flexibility', [2], MON)
    expect(b).toEqual({ [MON]: { strength: [1, 4], flexibility: [2] } })
  })

  it('drops the weeks already behind you', () => {
    const old = { '2026-11-09': { strength: [0] }, [MON]: { strength: [1] } }
    expect(withWeekPins(old, shiftWeek(MON, 1), 'strength', [3], WED)).toEqual({
      [MON]: { strength: [1] },
      '2026-11-23': { strength: [3] },
    })
  })

  it('is undone by withoutWeekPins', () => {
    const a = withWeekPins(undefined, MON, 'strength', [1], MON)
    expect(withoutWeekPins(a, WED)).toEqual({})
  })
})

describe('hasSchedule', () => {
  it('is false until a day is chosen, for every week or for this one', () => {
    expect(hasSchedule(undefined, undefined, MON)).toBe(false)
    expect(hasSchedule({ strength: [] }, { [MON]: { cardio: [] } }, MON)).toBe(false)
    expect(hasSchedule({ flexibility: [3] }, undefined, MON)).toBe(true)
    expect(hasSchedule(undefined, { [MON]: { strength: [1] } }, WED)).toBe(true)
    // Another week's days are not this week's.
    expect(hasSchedule(undefined, { [MON]: { strength: [1] } }, shiftWeek(MON, 1))).toBe(false)
  })
})
