import { describe, expect, it } from 'vitest'
import { coreDoneToday } from './stretchCore'
import { CORE_SESSION_NOTE } from './session'
import { STRETCH_CORE } from '../config/plan'
import { withDiscomfort } from './discomfort'
import type { WorkoutRow } from '../types'

const row = (over: Partial<WorkoutRow> = {}): WorkoutRow => ({
  session_id: 's1',
  date: '2026-08-24',
  day_type: 'push',
  exercise: STRETCH_CORE.key,
  set_number: 1,
  weight_lbs: 25,
  reps: 12,
  notes: '',
  is_historical: false,
  ...over,
})

describe('coreDoneToday', () => {
  it('is false with nothing logged', () => {
    expect(coreDoneToday([], '2026-08-24')).toBe(false)
  })

  it("finds an earlier stretch session's core", () => {
    expect(coreDoneToday([row({ notes: CORE_SESSION_NOTE })], '2026-08-24')).toBe(true)
  })

  it('ignores the same core on another day', () => {
    expect(coreDoneToday([row({ notes: CORE_SESSION_NOTE })], '2026-08-25')).toBe(false)
  })

  // The point of reading the note rather than the exercise: the sit-up is real
  // programmed work on push and pull, and those sets must not suppress the core.
  it("ignores a training day's programmed sit-ups", () => {
    expect(coreDoneToday([row({ notes: 'felt strong' }), row()], '2026-08-24')).toBe(false)
  })

  it('ignores another exercise logged under the stretch note', () => {
    expect(
      coreDoneToday([row({ exercise: 'cable_crunch', notes: CORE_SESSION_NOTE })], '2026-08-24'),
    ).toBe(false)
  })

  // A flag tapped mid-session appends to the note, so a literal string compare
  // would miss the very sets it was meant to find.
  it('still finds core whose note carries a discomfort flag', () => {
    const notes = withDiscomfort(CORE_SESSION_NOTE, ['lower back'])
    expect(coreDoneToday([row({ notes })], '2026-08-24')).toBe(true)
  })
})
