import { describe, expect, it } from 'vitest'
import { photoReminder } from './photoReminder'
import { DEFAULT_PLAN, type Plan } from '../config/plan'
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

  it('ignores a big leg-strength gain', () => {
    const r = photoReminder({
      lastPhoto: '2026-07-01',
      bodyWeights: [],
      workouts: [
        row('2026-06-20', 'leg_press', 185, 5),
        row('2026-07-10', 'leg_press', 265, 5),
        row('2026-06-20', 'calf_raise', 90, 12),
        row('2026-07-10', 'calf_raise', 140, 12),
      ],
      today: TODAY,
    })
    expect(r.due).toBe(false)
  })

  it('still triggers on abs work', () => {
    const r = photoReminder({
      lastPhoto: '2026-07-01',
      bodyWeights: [],
      workouts: [
        row('2026-06-20', 'cable_crunch', 80, 12),
        row('2026-07-10', 'cable_crunch', 110, 12),
      ],
      today: TODAY,
    })
    expect(r.due).toBe(true)
    expect(r.reason).toMatch(/cable crunch est\. 1rm up/)
  })

  it('excludes a leg exercise the user added to the plan', () => {
    const plan: Plan = {
      ...DEFAULT_PLAN,
      pull: {
        ...DEFAULT_PLAN.pull,
        exercises: [
          ...DEFAULT_PLAN.pull.exercises,
          { key: 'bulgarian_split_squat', name: 'bulgarian split squat', sets: 3, repMin: 8, repMax: 12, restSec: 90, group: 'legs' },
        ],
      },
    }
    const r = photoReminder({
      lastPhoto: '2026-07-01',
      bodyWeights: [],
      workouts: [
        row('2026-06-20', 'bulgarian_split_squat', 60, 8),
        row('2026-07-10', 'bulgarian_split_squat', 110, 8),
      ],
      plan,
      today: TODAY,
    })
    expect(r.due).toBe(false)
  })

  it('excludes a default leg movement the user regrouped', () => {
    const plan: Plan = {
      ...DEFAULT_PLAN,
      pull: {
        ...DEFAULT_PLAN.pull,
        exercises: DEFAULT_PLAN.pull.exercises.map((e) =>
          e.key === 'leg_press' ? { ...e, group: 'compound' } : e,
        ),
      },
    }
    const r = photoReminder({
      lastPhoto: '2026-07-01',
      bodyWeights: [],
      workouts: [
        row('2026-06-20', 'leg_press', 185, 5),
        row('2026-07-10', 'leg_press', 265, 5),
      ],
      plan,
      today: TODAY,
    })
    expect(r.due).toBe(false)
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
