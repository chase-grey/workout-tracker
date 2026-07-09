import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from './chatPrompt'
import type { BodyWeightEntry, StreakState, WorkoutRow } from '../types'

const today = new Date(2026, 6, 1) // 2026-07-01 (local)

const workouts: WorkoutRow[] = [
  {
    session_id: 's1',
    date: '2026-06-15',
    day_type: 'push',
    exercise: 'incline_bench',
    set_number: 1,
    weight_lbs: 135,
    reps: 8,
    notes: '',
    is_historical: false,
  },
  {
    session_id: 's1',
    date: '2026-06-15',
    day_type: 'push',
    exercise: 'incline_bench',
    set_number: 2,
    weight_lbs: 140,
    reps: 6,
    notes: '',
    is_historical: false,
  },
  // Older than 90 days before 2026-07-01 (cutoff ~2026-04-02) — should be excluded.
  {
    session_id: 's0',
    date: '2026-01-01',
    day_type: 'pull',
    exercise: 'barbell_squat',
    set_number: 1,
    weight_lbs: 225,
    reps: 5,
    notes: '',
    is_historical: true,
  },
]

const bodyWeights: BodyWeightEntry[] = [
  { date: '2026-06-20', weightLbs: 178 },
  { date: '2026-01-01', weightLbs: 190 }, // excluded (too old)
]

const streaks: StreakState = { activeStreak: 7, doubleStreak: 3, freezeCredits: 2 }

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt({ today, workouts, bodyWeights, streaks })

  it('includes the current date', () => {
    expect(prompt).toContain('2026-07-01')
  })

  it('includes a known exercise name from the plan', () => {
    expect(prompt).toContain('Incline Bench Press')
  })

  it('includes a logged set', () => {
    expect(prompt).toContain('135x8')
    expect(prompt).toContain('140x6')
  })

  it('includes a recent body weight', () => {
    expect(prompt).toContain('178')
  })

  it('includes the streak numbers', () => {
    expect(prompt).toContain('7')
    expect(prompt).toContain('3')
    expect(prompt).toContain('2')
  })

  it('excludes workouts older than 90 days', () => {
    expect(prompt).not.toContain('225x5')
    expect(prompt).not.toContain('2026-01-01')
  })
})
