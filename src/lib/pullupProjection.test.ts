import { describe, expect, it } from 'vitest'
import { buildGoals, projectGoal, PULLUP_KEY } from './goals'
import { lockProjection, relaxToCap } from './goalLock'
import { project } from './predictions'
import type { WorkoutRow } from '../types'

function goal(readings: [string, number][]) {
  const workouts: WorkoutRow[] = readings.flatMap(([date, reps]) =>
    Array.from({ length: 4 }, (_, i) => ({
      session_id: date, date, day_type: 'pull', exercise: PULLUP_KEY,
      set_number: i + 1, weight_lbs: null, reps, notes: '', is_historical: false,
    })),
  )
  return buildGoals({ workouts, bodyWeights: [], measurements: [], heightIn: 70 })
    .find((g) => g.id === 'pullups_4x20')!
}

describe('conservative pull-up projections', () => {
  const today = new Date(2026, 1, 15)
  const hot = goal([['2026-02-01', 6], ['2026-02-08', 9], ['2026-02-15', 12]])

  it('does not extrapolate a quick jump into four sets of twenty within months', () => {
    const p = projectGoal(hot, today)
    expect(p.observedSlopePerWeek).toBe(3)
    expect(p.slopePerWeek).toBe(0.5)
    expect(p.etaWeeks).toBeGreaterThan(40)
    expect(p.etaWeeks).toBeLessThan(52)
  })

  it('keeps a recent rebound in the context of the preceding plateau', () => {
    const g = goal([
      ['2026-01-04', 10], ['2026-01-11', 10], ['2026-01-18', 10],
      ['2026-01-25', 10], ['2026-02-01', 8], ['2026-02-08', 9], ['2026-02-15', 10],
    ])
    const p = projectGoal(g, today)
    expect(p.basis.spanDays).toBe(42)
    expect(p.slopePerWeek).toBeLessThanOrEqual(0)
    expect(p.etaDate).toBeNull()
  })

  it('relaxes existing commitments that exceed the new ceiling', () => {
    const previous = project(hot.points, hot.target, today, {
      decayPerWeek: hot.decayPerWeek, capPerWeek: 1,
    })
    const lock = lockProjection(hot.id, previous, today)!
    const revised = relaxToCap(lock, hot.capPerWeek)
    expect(revised.etaDate > lock.etaDate).toBe(true)
    expect(revised.slopePerWeek).toBe(0.5)
    expect(relaxToCap(revised, hot.capPerWeek)).toBe(revised)
  })
})
