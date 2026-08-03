import { describe, it, expect } from 'vitest'
import type { WorkoutRow } from '../types'
import { GRADUATION_REPS, GRADUATION_SETS, HANGING_RAISE_KEY } from '../config/plan'
import { graduationNote, shouldGraduateHangingRaise, GRADUATION_SESSIONS } from './graduation'

function raise(sessionId: string, date: string, reps: number, setNumber: number): WorkoutRow {
  return {
    session_id: sessionId,
    date,
    day_type: 'push',
    exercise: HANGING_RAISE_KEY,
    set_number: setNumber,
    weight_lbs: null,
    reps,
    notes: '',
    is_historical: false,
  }
}

/** One session at the full graduation standard. */
function qualifyingSession(sessionId: string, date: string): WorkoutRow[] {
  return Array.from({ length: GRADUATION_SETS }, (_, i) =>
    raise(sessionId, date, GRADUATION_REPS, i + 1),
  )
}

describe('shouldGraduateHangingRaise', () => {
  it('is false with no history', () => {
    expect(shouldGraduateHangingRaise([])).toBe(false)
  })

  it('is false after a single session at the standard', () => {
    // One good session could be a fluke or a generous rep count.
    expect(shouldGraduateHangingRaise(qualifyingSession('s1', '2026-01-05'))).toBe(false)
  })

  it('is true once the standard is repeated', () => {
    const rows = [...qualifyingSession('s1', '2026-01-05'), ...qualifyingSession('s2', '2026-01-12')]
    expect(shouldGraduateHangingRaise(rows)).toBe(true)
    expect(GRADUATION_SESSIONS).toBe(2)
  })

  it('is false when a session is short of the set count', () => {
    const rows = [
      ...Array.from({ length: GRADUATION_SETS - 1 }, (_, i) =>
        raise('s1', '2026-01-05', GRADUATION_REPS, i + 1),
      ),
      ...Array.from({ length: GRADUATION_SETS - 1 }, (_, i) =>
        raise('s2', '2026-01-12', GRADUATION_REPS, i + 1),
      ),
    ]
    expect(shouldGraduateHangingRaise(rows)).toBe(false)
  })

  it('is false when the reps fall short of the standard', () => {
    const short = (id: string, date: string) =>
      Array.from({ length: GRADUATION_SETS }, (_, i) => raise(id, date, GRADUATION_REPS - 1, i + 1))
    expect(shouldGraduateHangingRaise([...short('s1', '2026-01-05'), ...short('s2', '2026-01-12')])).toBe(
      false,
    )
  })

  it('ignores other exercises', () => {
    const rows = qualifyingSession('s1', '2026-01-05').map((r) => ({ ...r, exercise: 'cable_crunch' }))
    expect(shouldGraduateHangingRaise(rows)).toBe(false)
  })
})

describe('graduationNote', () => {
  it('announces the graduation on the session that earns it', () => {
    const prev = qualifyingSession('s1', '2026-01-05')
    const added = qualifyingSession('s2', '2026-01-12')
    expect(graduationNote(prev, added)).toContain('leg raises')
  })

  it('says nothing on the first qualifying session', () => {
    expect(graduationNote([], qualifyingSession('s1', '2026-01-05'))).toBeNull()
  })

  it('does not repeat itself on later sessions', () => {
    const prev = [...qualifyingSession('s1', '2026-01-05'), ...qualifyingSession('s2', '2026-01-12')]
    expect(graduationNote(prev, qualifyingSession('s3', '2026-01-19'))).toBeNull()
  })

  it('says nothing for a session with no hanging raises', () => {
    const prev = qualifyingSession('s1', '2026-01-05')
    const added = qualifyingSession('s2', '2026-01-12').map((r) => ({ ...r, exercise: 'cable_crunch' }))
    expect(graduationNote(prev, added)).toBeNull()
  })
})
