import { describe, expect, it } from 'vitest'
import type { DayType, WorkoutRow } from '../types'
import type { CalorieEntry } from './calories'
import {
  buildReview,
  monthKeyOf,
  pendingReview,
  periodStats,
  prevMonthKey,
  superlatives,
  type ReviewData,
} from './review'

let sid = 0
function session(date: string, dayType: DayType = 'push', weight = 100, reps = 5): WorkoutRow {
  sid += 1
  return {
    session_id: `s${sid}`,
    date,
    day_type: dayType,
    exercise: 'flat_bench',
    set_number: 1,
    weight_lbs: weight,
    reps,
    notes: '',
    is_historical: false,
  }
}

function cal(date: string, calories: number): CalorieEntry {
  return { date, calories }
}

function data(p: Partial<ReviewData> = {}): ReviewData {
  return { workouts: [], flexDates: [], calorieEntries: [], bodyWeights: [], ...p }
}

const inMonth = (key: string) => (d: string) => d.slice(0, 7) === key

describe('periodStats', () => {
  it('tallies a month of activity', () => {
    const d = data({
      workouts: [
        session('2026-06-02', 'push'),
        session('2026-06-05', 'pull'),
        { ...session('2026-06-09', 'push'), exercise: 'deadbug' }, // supplemental core-only session
      ],
      flexDates: ['2026-06-03', '2026-06-10', '2026-06-10'], // dup collapses
      calorieEntries: [cal('2026-06-02', 4200), cal('2026-06-03', 4500), cal('2026-06-04', 3000)],
      bodyWeights: [
        { date: '2026-06-01', weightLbs: 170 },
        { date: '2026-06-28', weightLbs: 173 },
      ],
    })
    const s = periodStats(d, inMonth('2026-06'))
    expect(s.workouts).toBe(2) // the core-only session is excluded from the training count
    expect(s.stretches).toBe(2)
    expect(s.calorieDays).toBe(2)
    expect(s.bestCalorieDay).toBe(4500)
    expect(s.weightChangeLbs).toBe(3)
  })

  it('counts a PR whose all-time best falls in the period', () => {
    const d = data({
      workouts: [
        session('2026-05-10', 'push', 100, 5),
        session('2026-06-10', 'push', 140, 5), // heaviest est-1RM, in June
      ],
    })
    expect(periodStats(d, inMonth('2026-06')).prs).toBe(1)
    expect(periodStats(d, inMonth('2026-05')).prs).toBe(0)
  })
})

describe('superlatives', () => {
  it('crowns the best month for workouts', () => {
    const d = data({
      workouts: [
        session('2026-05-01'),
        session('2026-06-01'),
        session('2026-06-08'),
        session('2026-06-15'),
      ],
    })
    expect(superlatives(d, 'month', '2026-06')).toContain('workouts')
    expect(superlatives(d, 'month', '2026-05')).not.toContain('workouts')
  })

  it('returns nothing when there is only one period', () => {
    const d = data({ workouts: [session('2026-06-01')] })
    expect(superlatives(d, 'month', '2026-06')).toHaveLength(0)
  })
})

describe('buildReview', () => {
  it('produces a titled recap with a story', () => {
    const d = data({
      workouts: [session('2026-06-02'), session('2026-06-05')],
      calorieEntries: [cal('2026-06-02', 4200)],
    })
    const r = buildReview(d, 'month', '2026-06')
    expect(r.title).toBe('June 2026 in review')
    expect(r.story.length).toBeGreaterThan(0)
    expect(r.stats.find((s) => s.label === 'Workouts')?.value).toBe('2')
  })

  it('flags a record period', () => {
    const d = data({
      workouts: [session('2026-05-01'), session('2026-06-01'), session('2026-06-08')],
    })
    const r = buildReview(d, 'month', '2026-06')
    expect(r.isBest).toBe(true)
    expect(r.highlights.length).toBeGreaterThan(0)
  })
})

describe('pendingReview', () => {
  const today = new Date('2026-07-03T09:00:00')
  const d = data({ workouts: [session('2026-06-15')] })

  it('shows the month review on the first open of a new month', () => {
    const p = pendingReview({ lastReviewedMonth: '2026-06', lastReviewedYear: '2026' }, d, today)
    expect(p).toEqual({ kind: 'month', periodKey: '2026-06' })
  })

  it('does not fire before markers are seeded', () => {
    expect(pendingReview({}, d, today)).toBeNull()
  })

  it('does not fire twice in the same month', () => {
    expect(pendingReview({ lastReviewedMonth: '2026-07', lastReviewedYear: '2026' }, d, today)).toBeNull()
  })

  it('prefers the year review at a year boundary', () => {
    const jan = new Date('2026-01-02T09:00:00')
    const withYearData = data({ workouts: [session('2025-12-15')] })
    const p = pendingReview({ lastReviewedMonth: '2025-12', lastReviewedYear: '2025' }, withYearData, jan)
    expect(p).toEqual({ kind: 'year', periodKey: '2025' })
  })

  it('skips a review when the closed period has no data', () => {
    const empty = data({ workouts: [session('2026-07-01')] })
    expect(pendingReview({ lastReviewedMonth: '2026-06', lastReviewedYear: '2026' }, empty, today)).toBeNull()
  })
})

describe('period key helpers', () => {
  it('computes the previous month key across a year boundary', () => {
    expect(prevMonthKey(new Date('2026-01-15'))).toBe('2025-12')
    expect(monthKeyOf(new Date('2026-07-15'))).toBe('2026-07')
  })
})
