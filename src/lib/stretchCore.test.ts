import { describe, expect, it } from 'vitest'
import { coreDoneToday, withMatSitups } from './stretchCore'
import { CORE_SESSION_NOTE, isSupplementalSet } from './session'
import { MAT_SITUP_KEY, STRETCH_CORE } from '../config/plan'
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

  // What the split bought: the mat sit-up is the stretch block's own movement, so
  // a training day's sit-ups can't suppress the core no matter what they say.
  it("ignores a training day's programmed incline sit-ups", () => {
    const pushDay = [
      row({ exercise: 'weighted_situp', notes: 'felt strong' }),
      row({ exercise: 'weighted_situp', set_number: 2 }),
    ]
    expect(coreDoneToday(pushDay, '2026-08-24')).toBe(false)
  })

  it('ignores another exercise logged under the stretch note', () => {
    expect(
      coreDoneToday([row({ exercise: 'cable_crunch', notes: CORE_SESSION_NOTE })], '2026-08-24'),
    ).toBe(false)
  })

  // A flag tapped mid-session appends to the note, so a core set carrying one is
  // still core — nothing here reads the note, which is the point.
  it('still finds core whose note carries a discomfort flag', () => {
    const notes = withDiscomfort(CORE_SESSION_NOTE, ['lower back'])
    expect(coreDoneToday([row({ notes })], '2026-08-24')).toBe(true)
  })

  // The rows the stretch logged before the mat sit-up had its own key are re-keyed
  // on the way in, so a stretch done earlier today is found either way.
  it("finds a pre-split stretch's core once it's been re-keyed", () => {
    const legacy = withMatSitups([row({ exercise: 'weighted_situp', notes: CORE_SESSION_NOTE })])
    expect(coreDoneToday(legacy, '2026-08-24')).toBe(true)
  })
})

describe('withMatSitups', () => {
  it("moves a pre-split stretch's sit-ups onto the mat key", () => {
    const out = withMatSitups([
      row({ exercise: 'weighted_situp', notes: CORE_SESSION_NOTE }),
      row({ exercise: 'weighted_situp', set_number: 2, notes: CORE_SESSION_NOTE }),
    ])
    expect(out.map((r) => r.exercise)).toEqual([MAT_SITUP_KEY, MAT_SITUP_KEY])
  })

  it("leaves a training day's sit-ups on the incline key", () => {
    const out = withMatSitups([
      row({ exercise: 'weighted_situp' }),
      row({ exercise: 'weighted_situp', notes: 'felt strong' }),
    ])
    expect(out.map((r) => r.exercise)).toEqual(['weighted_situp', 'weighted_situp'])
  })

  it('re-keys a pre-split row whose note also carries a discomfort flag', () => {
    const notes = withDiscomfort(CORE_SESSION_NOTE, ['lower back'])
    const [out] = withMatSitups([row({ exercise: 'weighted_situp', notes })])
    expect(out.exercise).toBe(MAT_SITUP_KEY)
    // The note is kept as it was: the flag is still the flag.
    expect(out.notes).toBe(notes)
  })

  it('leaves every other row exactly as it was', () => {
    const rows = [row({ exercise: 'flat_bench' }), row({ exercise: 'deadbug' })]
    expect(withMatSitups(rows)).toEqual(rows)
  })

  it('is idempotent, since it runs on every read', () => {
    const once = withMatSitups([row({ exercise: 'weighted_situp', notes: CORE_SESSION_NOTE })])
    expect(withMatSitups(once)).toEqual(once)
  })

  it('re-keys onto a key that is supplemental on its own', () => {
    const [out] = withMatSitups([row({ exercise: 'weighted_situp', notes: CORE_SESSION_NOTE })])
    expect(isSupplementalSet({ exercise: out.exercise, notes: '' })).toBe(true)
  })
})
