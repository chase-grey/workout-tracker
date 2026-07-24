import { describe, expect, it } from 'vitest'
import type { DayType, WorkoutRow } from '../types'
import type { CalorieEntry } from './calories'
import { currentCalorieStreak, longestCalorieStreak, newRecords, type RecordSnapshot } from './records'

const TODAY = new Date('2026-07-21T12:00:00') // Tuesday; week starts Mon 2026-07-20

let sid = 0
function session(date: string, dayType: DayType = 'push'): WorkoutRow {
  sid += 1
  return {
    session_id: `s${sid}`,
    date,
    day_type: dayType,
    exercise: 'flat_bench',
    set_number: 1,
    weight_lbs: 100,
    reps: 5,
    notes: '',
    is_historical: false,
  }
}

function cal(date: string, calories: number): CalorieEntry {
  return { date, calories }
}

function snap(p: Partial<RecordSnapshot> = {}): RecordSnapshot {
  return { workouts: [], flexDates: [], calorieEntries: [], ...p }
}

describe('newRecords — weekly session counts', () => {
  it('cheers a new most-workouts-in-a-week record', () => {
    // Prior best week (2026-07-06 wk): 2 workouts. This week already had 2; a 3rd breaks it.
    const prior = [session('2026-07-06'), session('2026-07-07')]
    const thisWeek = [session('2026-07-20'), session('2026-07-21')]
    const before = snap({ workouts: [...prior, ...thisWeek] })
    const after = snap({ workouts: [...prior, ...thisWeek, session('2026-07-22')] })
    const recs = newRecords(before, after, TODAY)
    expect(recs.some((r) => r.title === 'Most workouts in a week')).toBe(true)
  })

  it('does not cheer when there is no prior week to beat', () => {
    const before = snap({ workouts: [session('2026-07-20')] })
    const after = snap({ workouts: [session('2026-07-20'), session('2026-07-21')] })
    expect(newRecords(before, after, TODAY)).toHaveLength(0)
  })

  it('fires only on the crossing tap, not again after', () => {
    const prior = [session('2026-07-06'), session('2026-07-07')]
    const cross = snap({ workouts: [...prior, session('2026-07-20'), session('2026-07-21'), session('2026-07-22')] })
    // before already leads (3 > 2), so adding a 4th is not a fresh crossing
    const after4 = snap({ workouts: [...cross.workouts, session('2026-07-23')] })
    expect(newRecords(cross, after4, TODAY).some((r) => r.title === 'Most workouts in a week')).toBe(false)
  })

  it('distinguishes Push from Pull records', () => {
    const prior = [session('2026-07-06', 'pull')]
    const before = snap({ workouts: [...prior, session('2026-07-20', 'pull')] })
    const after = snap({ workouts: [...prior, session('2026-07-20', 'pull'), session('2026-07-21', 'pull')] })
    const recs = newRecords(before, after, TODAY)
    expect(recs.some((r) => r.title === 'Most Pull sessions in a week')).toBe(true)
    expect(recs.some((r) => r.title === 'Most Push sessions in a week')).toBe(false)
  })

  it('cheers a most-stretches-in-a-week record', () => {
    const before = snap({ flexDates: ['2026-07-06', '2026-07-20'] })
    const after = snap({ flexDates: ['2026-07-06', '2026-07-20', '2026-07-21'] })
    const recs = newRecords(before, after, TODAY)
    expect(recs.some((r) => r.title === 'Most stretch sessions in a week')).toBe(true)
  })
})

describe('newRecords — calories', () => {
  it('cheers a biggest single day of eating', () => {
    const before = snap({ calorieEntries: [cal('2026-07-10', 4200), cal('2026-07-21', 3000)] })
    const after = snap({ calorieEntries: [cal('2026-07-10', 4200), cal('2026-07-21', 4500)] })
    const recs = newRecords(before, after, TODAY)
    expect(recs.some((r) => r.title === 'Biggest eating day yet')).toBe(true)
  })

  it('does not re-fire the daily record once already ahead', () => {
    const before = snap({ calorieEntries: [cal('2026-07-10', 4200), cal('2026-07-21', 4500)] })
    const after = snap({ calorieEntries: [cal('2026-07-10', 4200), cal('2026-07-21', 5000)] })
    expect(newRecords(before, after, TODAY).some((r) => r.title === 'Biggest eating day yet')).toBe(false)
  })

  it('cheers a biggest week of fueling', () => {
    // Prior week 2026-07-13 total 8000; this week climbs past it.
    const prior = [cal('2026-07-13', 4000), cal('2026-07-14', 4000)]
    const before = snap({ calorieEntries: [...prior, cal('2026-07-20', 4000), cal('2026-07-21', 3500)] })
    const after = snap({ calorieEntries: [...prior, cal('2026-07-20', 4000), cal('2026-07-21', 4500)] })
    const recs = newRecords(before, after, TODAY)
    expect(recs.some((r) => r.title === 'Biggest week of fueling')).toBe(true)
  })

  it('cheers a new longest calorie streak on the crossing day', () => {
    // 2026-07-19, 20 already hit; today (21) crossing makes a 3-day run, a new record.
    const base = [cal('2026-07-19', 4100), cal('2026-07-20', 4100)]
    const before = snap({ calorieEntries: [...base, cal('2026-07-21', 3000)] })
    const after = snap({ calorieEntries: [...base, cal('2026-07-21', 4100)] })
    const recs = newRecords(before, after, TODAY)
    expect(recs.some((r) => r.title === 'Longest calorie streak yet')).toBe(true)
  })
})

describe('calorie streak helpers', () => {
  it('longestCalorieStreak counts the longest consecutive run', () => {
    const entries = [
      cal('2026-07-01', 4100),
      cal('2026-07-02', 4100),
      cal('2026-07-03', 4100),
      cal('2026-07-05', 4100), // gap on the 4th breaks the run
    ]
    expect(longestCalorieStreak(entries)).toBe(3)
  })

  it('currentCalorieStreak counts back from today', () => {
    const entries = [cal('2026-07-19', 4100), cal('2026-07-20', 4100), cal('2026-07-21', 4100)]
    expect(currentCalorieStreak(entries, TODAY)).toBe(3)
  })

  it('currentCalorieStreak is 0 when today misses the goal', () => {
    const entries = [cal('2026-07-20', 4100), cal('2026-07-21', 2000)]
    expect(currentCalorieStreak(entries, TODAY)).toBe(0)
  })
})
