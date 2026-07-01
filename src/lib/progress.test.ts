import { describe, expect, it } from 'vitest'
import { exerciseSeries, filterRange } from './progress'
import type { WorkoutRow } from '../types'

function r(session: string, date: string, weight: number | null, reps: number): WorkoutRow {
  return {
    session_id: session,
    date,
    day_type: 'push',
    exercise: 'bench',
    set_number: 1,
    weight_lbs: weight,
    reps,
    notes: '',
    is_historical: false,
  }
}

const rows: WorkoutRow[] = [
  r('a', '2026-01-01', 100, 10), // session a
  r('a', '2026-01-01', 120, 5),
  r('b', '2026-06-01', 130, 5), // session b
]

describe('exerciseSeries', () => {
  it('computes best 1RM per session, sorted by date', () => {
    const s = exerciseSeries(rows, 'bench', '1rm')
    expect(s.map((p) => p.date)).toEqual(['2026-01-01', '2026-06-01'])
    expect(s[0].value).toBeCloseTo(140, 0) // 120×5
    expect(s[1].value).toBeCloseTo(151.7, 1) // 130×5
  })

  it('sums volume across a session', () => {
    const s = exerciseSeries(rows, 'bench', 'volume')
    expect(s[0].value).toBe(100 * 10 + 120 * 5)
  })

  it('ignores other exercises', () => {
    expect(exerciseSeries(rows, 'squat', 'weight')).toEqual([])
  })
})

describe('filterRange', () => {
  it('keeps only points within the window', () => {
    const s = exerciseSeries(rows, 'bench', 'weight')
    const recent = filterRange(s, 3, new Date(2026, 6, 1)) // last 3 months from Jul 2026
    expect(recent.map((p) => p.date)).toEqual(['2026-06-01'])
  })
})
