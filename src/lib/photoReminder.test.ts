import { describe, expect, it } from 'vitest'
import { photoReminder } from './photoReminder'
import type { WorkoutRow } from '../types'

const TODAY = new Date(2026, 6, 13) // 2026-07-13

const row = (date: string, exercise: string, weight: number, reps: number): WorkoutRow => ({
  session_id: date + exercise,
  date,
  day_type: 'push',
  exercise,
  set_number: 1,
  weight_lbs: weight,
  reps,
  notes: '',
  is_historical: false,
})

describe('photoReminder', () => {
  it('is due when there is no prior photo', () => {
    expect(photoReminder({ lastPhoto: null, bodyWeights: [], workouts: [], today: TODAY }).due).toBe(true)
  })

  it('is due monthly (>=30 days)', () => {
    const r = photoReminder({ lastPhoto: '2026-06-01', bodyWeights: [], workouts: [], today: TODAY })
    expect(r.due).toBe(true)
    expect(r.reason).toMatch(/days since/)
  })

  it('is due on a big body-weight change within the month', () => {
    const r = photoReminder({
      lastPhoto: '2026-07-01',
      bodyWeights: [
        { date: '2026-06-30', weightLbs: 170 },
        { date: '2026-07-12', weightLbs: 175 },
      ],
      workouts: [],
      today: TODAY,
    })
    expect(r.due).toBe(true)
    expect(r.reason).toMatch(/body weight \+5/)
  })

  it('is due on a big strength gain within the month', () => {
    const r = photoReminder({
      lastPhoto: '2026-07-01',
      bodyWeights: [],
      workouts: [row('2026-06-20', 'flat_bench', 135, 5), row('2026-07-10', 'flat_bench', 160, 5)],
      today: TODAY,
    })
    expect(r.due).toBe(true)
    expect(r.reason).toMatch(/est\. 1rm up/)
  })

  it('is not due when recent and no big change', () => {
    const r = photoReminder({
      lastPhoto: '2026-07-05',
      bodyWeights: [
        { date: '2026-07-04', weightLbs: 170 },
        { date: '2026-07-12', weightLbs: 171 },
      ],
      workouts: [row('2026-07-03', 'flat_bench', 135, 5), row('2026-07-10', 'flat_bench', 137, 5)],
      today: TODAY,
    })
    expect(r.due).toBe(false)
  })
})
