import { describe, it, expect } from 'vitest'
import type { WorkoutRow } from '../types'
import {
  lastVariant,
  leadVariant,
  leadVariantForKey,
  nextVariant,
  otherVariant,
  progressionVariant,
} from './pushVariant'
import { CORE_SESSION_NOTE } from './session'
import { DEFAULT_PLAN, STRETCH_CORE } from '../config/plan'

function row(overrides: Partial<WorkoutRow>): WorkoutRow {
  return {
    session_id: 's1',
    date: '2026-01-05', // a Monday
    day_type: 'push',
    exercise: 'flat_bench',
    set_number: 1,
    weight_lbs: 135,
    reps: 8,
    notes: '',
    is_historical: false,
    ...overrides,
  }
}

describe('nextVariant', () => {
  it('starts the very first push session on A', () => {
    expect(nextVariant([], 'push')).toBe('A')
  })

  it('flips to flat-first after an incline-first session', () => {
    const rows = [row({ session_id: 's1', date: '2026-01-05', variant: 'A' })]
    expect(nextVariant(rows, 'push')).toBe('B')
  })

  it('flips back to incline-first after a flat-first session', () => {
    const rows = [row({ session_id: 's1', date: '2026-01-05', variant: 'B' })]
    expect(nextVariant(rows, 'push')).toBe('A')
  })

  it('keeps alternating across a week boundary', () => {
    // The old rule reset each Monday, so a once-a-week schedule started with
    // incline every single time. It now turns over regardless of the week.
    const rows = [row({ session_id: 's1', date: '2026-01-05', variant: 'A' })]
    expect(nextVariant(rows, 'push')).toBe('B')
    const next = [...rows, row({ session_id: 's2', date: '2026-01-12', variant: 'B' })]
    expect(nextVariant(next, 'push')).toBe('A')
  })

  it('turns over from the variant actually trained, not the one due', () => {
    // Two sessions in a week both pressed flat first (the second an override);
    // incline is what's owed next, rather than the count's turn.
    const rows = [
      row({ session_id: 's1', date: '2026-01-05', variant: 'B' }),
      row({ session_id: 's2', date: '2026-01-07', variant: 'B' }),
    ]
    expect(nextVariant(rows, 'push')).toBe('A')
  })

  it('ignores other day types', () => {
    const rows = [
      row({ session_id: 's1', day_type: 'pull', exercise: 'barbell_squat', variant: 'A' }),
    ]
    expect(nextVariant(rows, 'push')).toBe('A')
  })

  it('ignores a supplemental core-only session', () => {
    // A stretch's core block isn't training, so it can't shift the rotation — even
    // though the sit-up it logs is a movement push day trains for real.
    const rows = [
      row({
        session_id: 's1',
        exercise: STRETCH_CORE.key,
        notes: CORE_SESSION_NOTE,
        variant: 'A',
      }),
    ]
    expect(nextVariant(rows, 'push')).toBe('A')
  })

  it('has no variant for days that do not run A/B', () => {
    expect(nextVariant([], 'pull')).toBeNull()
    expect(nextVariant([], 'fullbody')).toBeNull()
  })
})

describe('lastVariant', () => {
  it('reads the most recent session that recorded one', () => {
    const rows = [
      row({ session_id: 's1', date: '2026-01-05', variant: 'B' }),
      row({ session_id: 's2', date: '2026-01-12', variant: 'A' }),
    ]
    expect(lastVariant(rows, 'push')).toBe('A')
  })

  it('skips past sessions that recorded none', () => {
    // Imported history and anything logged before the A/B split carry no variant;
    // the last session that names a press is still what to alternate from.
    const rows = [
      row({ session_id: 's1', date: '2026-01-05', variant: 'B' }),
      row({ session_id: 's2', date: '2026-01-12' }),
    ]
    expect(lastVariant(rows, 'push')).toBe('B')
  })

  it('has nothing to report with no history at all', () => {
    expect(lastVariant([], 'push')).toBeNull()
  })
})

describe('otherVariant', () => {
  it('flips between the two', () => {
    expect(otherVariant('A')).toBe('B')
    expect(otherVariant('B')).toBe('A')
  })
})

describe('leadVariant', () => {
  it('gives each press the variant it leads', () => {
    // Incline leads A at four sets; flat leads B, swapping ahead of it.
    expect(leadVariant(DEFAULT_PLAN.push, 'incline_bench')).toBe('A')
    expect(leadVariant(DEFAULT_PLAN.push, 'flat_bench')).toBe('B')
  })

  it('has no lead for an exercise the variants train alike', () => {
    for (const key of ['cable_crunch', 'machine_overhead_press', 'lateral_raise_l']) {
      expect(leadVariant(DEFAULT_PLAN.push, key)).toBeNull()
    }
  })

  it('has no lead on a day that does not run variants', () => {
    // Flat bench is on Full Body too, where there is no second press to trail.
    expect(leadVariant(DEFAULT_PLAN.fullbody, 'flat_bench')).toBeNull()
    expect(leadVariant(DEFAULT_PLAN.pull, 'barbell_squat')).toBeNull()
  })

  it('has no lead for an exercise the day does not contain', () => {
    expect(leadVariant(DEFAULT_PLAN.push, 'barbell_squat')).toBeNull()
  })
})

describe('leadVariantForKey', () => {
  it('finds the lead across the variant days', () => {
    expect(leadVariantForKey('flat_bench')).toBe('B')
    expect(leadVariantForKey('incline_bench')).toBe('A')
    expect(leadVariantForKey('barbell_squat')).toBeNull()
  })
})

describe('progressionVariant', () => {
  it('scopes only the lifts whose fatigue differs by variant', () => {
    expect(progressionVariant('flat_bench', 'A')).toBe('A')
    expect(progressionVariant('incline_bench', 'B')).toBe('B')
  })

  it('leaves the alike lifts on one ladder off every session', () => {
    // Splitting these would halve the rate each one climbs: Tuesday's cable
    // crunch target would ignore the reps earned on Friday.
    expect(progressionVariant('cable_crunch', 'A')).toBeNull()
    expect(progressionVariant('lateral_raise_r', 'B')).toBeNull()
  })

  it('is unscoped for a session with no variant at all', () => {
    expect(progressionVariant('flat_bench', undefined)).toBeNull()
    expect(progressionVariant('flat_bench', null)).toBeNull()
  })
})
