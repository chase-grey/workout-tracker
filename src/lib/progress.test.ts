import { describe, expect, it } from 'vitest'
import { availableExercises, exerciseSeries, filterRange } from './progress'
import { ALL_EXERCISES } from '../config/plan'
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

describe('availableExercises', () => {
  it('includes plan exercises and prettified unplanned imported keys', () => {
    const planKey = ALL_EXERCISES[0].key
    const w: WorkoutRow[] = [
      { ...r('s1', '2026-01-01', 100, 5), exercise: planKey },
      { ...r('s2', '2026-02-01', 90, 8), exercise: planKey },
      { ...r('s3', '2026-03-01', 40, 12), exercise: 'prayer_curls' },
      { ...r('s4', '2026-03-02', 40, 12), exercise: 'prayer_curls' }, // duplicate key
    ]
    const list = availableExercises(w)

    // all plan exercises are present
    for (const e of ALL_EXERCISES) {
      expect(list).toContainEqual({ key: e.key, name: e.name })
    }

    // the unplanned imported key is present, prettified
    expect(list).toContainEqual({ key: 'prayer_curls', name: 'Prayer Curls' })

    // no duplicate entries for the imported key
    expect(list.filter((x) => x.key === 'prayer_curls')).toHaveLength(1)

    // plan exercises come before imported extras
    const planCount = ALL_EXERCISES.length
    expect(list.slice(0, planCount).map((x) => x.key)).toEqual(ALL_EXERCISES.map((e) => e.key))
    expect(list[planCount]).toEqual({ key: 'prayer_curls', name: 'Prayer Curls' })
  })
})

describe('filterRange', () => {
  it('keeps only points within the window', () => {
    const s = exerciseSeries(rows, 'bench', 'weight')
    const recent = filterRange(s, 3, new Date(2026, 6, 1)) // last 3 months from Jul 2026
    expect(recent.map((p) => p.date)).toEqual(['2026-06-01'])
  })
})
