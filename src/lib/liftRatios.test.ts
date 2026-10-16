import { describe, expect, it } from 'vitest'
import { INCLINE_TO_FLAT, INCLINE_TO_FLAT_MAX, INCLINE_TO_FLAT_MIN, inclineToFlat } from './liftRatios'
import type { WorkoutRow } from '../types'

const set = (
  session: string,
  date: string,
  exercise: string,
  weight: number,
  reps: number,
  variant?: 'A' | 'B',
): WorkoutRow => ({
  session_id: session,
  date,
  day_type: 'push',
  exercise,
  set_number: 1,
  weight_lbs: weight,
  reps,
  notes: '',
  is_historical: false,
  variant,
})

// Incline leads variant A, flat leads variant B.
const flatDay = (s: string, date: string, weight: number, reps: number) => [
  set(s, date, 'flat_bench', weight, reps, 'B'),
  set(s, date, 'incline_bench', 60, 5, 'B'), // tired, second press
]
const inclineDay = (s: string, date: string, weight: number, reps: number) => [
  set(s, date, 'incline_bench', weight, reps, 'A'),
  set(s, date, 'flat_bench', 60, 5, 'A'), // tired, second press
]

describe('inclineToFlat measures the gap between the presses', () => {
  it('falls back to the textbook ratio without two fresh sessions of each', () => {
    expect(inclineToFlat([])).toBe(INCLINE_TO_FLAT)
    expect(inclineToFlat([...flatDay('a', '2026-10-01', 100, 12), ...inclineDay('b', '2026-10-04', 100, 10)])).toBe(
      INCLINE_TO_FLAT,
    )
  })

  it('compares fresh flat against fresh incline, ignoring the tired second press', () => {
    const rows = [
      ...flatDay('a', '2026-10-01', 100, 12), // 140
      ...inclineDay('b', '2026-10-04', 100, 10), // 133.3
      ...flatDay('c', '2026-10-08', 100, 12), // 140
      ...inclineDay('d', '2026-10-11', 100, 10), // 133.3
    ]
    expect(inclineToFlat(rows)).toBe(1.05)
  })

  it('counts a session with no variant recorded only when it trained the press alone', () => {
    const rows = [
      set('a', '2026-10-01', 'flat_bench', 100, 12),
      set('b', '2026-10-04', 'incline_bench', 100, 10),
      set('c', '2026-10-08', 'flat_bench', 100, 12),
      set('d', '2026-10-11', 'incline_bench', 100, 10),
      // Both presses, no variant: which one was fresh is unknown, so neither counts.
      set('e', '2026-10-12', 'flat_bench', 60, 5),
      set('e', '2026-10-12', 'incline_bench', 60, 5),
    ]
    expect(inclineToFlat(rows)).toBe(1.05)
  })

  it('reads only the most recent fresh sessions', () => {
    const rows = [
      ...inclineDay('old1', '2026-06-01', 50, 10),
      ...inclineDay('old2', '2026-06-05', 50, 10),
      ...[1, 2, 3, 4].flatMap((n) => [
        ...flatDay(`f${n}`, `2026-10-0${n}`, 100, 12),
        ...inclineDay(`i${n}`, `2026-10-1${n}`, 100, 10),
      ]),
    ]
    expect(inclineToFlat(rows)).toBe(1.05)
  })

  it('holds the ratio inside the published range', () => {
    const stronger = [
      ...flatDay('a', '2026-10-01', 80, 10),
      ...inclineDay('b', '2026-10-04', 100, 10),
      ...flatDay('c', '2026-10-08', 80, 10),
      ...inclineDay('d', '2026-10-11', 100, 10),
    ]
    expect(inclineToFlat(stronger)).toBe(INCLINE_TO_FLAT_MIN)
    const weaker = [
      ...flatDay('a', '2026-10-01', 200, 10),
      ...inclineDay('b', '2026-10-04', 100, 10),
      ...flatDay('c', '2026-10-08', 200, 10),
      ...inclineDay('d', '2026-10-11', 100, 10),
    ]
    expect(inclineToFlat(weaker)).toBe(INCLINE_TO_FLAT_MAX)
  })
})
