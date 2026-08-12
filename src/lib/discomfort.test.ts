import { describe, it, expect } from 'vitest'
import type { WorkoutRow } from '../types'
import {
  applyNotesEdit,
  discomfortCounts,
  discomfortEdit,
  discomfortReports,
  fmtDiscomfortCount,
  knownSpots,
  lastSessionWith,
  parseDiscomfort,
  sessionKeyOf,
  toggleDiscomfort,
  withDiscomfort,
} from './discomfort'

const today = new Date(2026, 7, 20) // 2026-08-20 (local)

const row = (over: Partial<WorkoutRow>): WorkoutRow => ({
  session_id: 's1',
  date: '2026-08-11',
  day_type: 'pull',
  exercise: 'barbell_squat',
  set_number: 1,
  weight_lbs: 225,
  reps: 8,
  notes: '',
  is_historical: false,
  ...over,
})

describe('parseDiscomfort', () => {
  it('reads the spots out of a flag', () => {
    expect(parseDiscomfort('discomfort: knee, hip')).toEqual(['knee', 'hip'])
  })

  it('finds the flag alongside other note text', () => {
    expect(parseDiscomfort('felt strong today; discomfort: knee')).toEqual(['knee'])
  })

  it('ignores a note that only mentions a body part', () => {
    expect(parseDiscomfort('knees felt fine')).toEqual([])
  })

  it('reads nothing out of a blank or missing note', () => {
    expect(parseDiscomfort('')).toEqual([])
    expect(parseDiscomfort(undefined)).toEqual([])
    expect(parseDiscomfort(null)).toEqual([])
  })

  it('normalizes case and dedupes', () => {
    expect(parseDiscomfort('Discomfort: Knee , knee, HIP')).toEqual(['knee', 'hip'])
  })
})

describe('withDiscomfort', () => {
  it('writes a flag onto an empty note', () => {
    expect(withDiscomfort('', ['knee'])).toBe('discomfort: knee')
  })

  it('keeps other note text and puts the flag last', () => {
    expect(withDiscomfort('felt strong today', ['knee'])).toBe(
      'felt strong today; discomfort: knee',
    )
  })

  it('replaces an existing flag rather than adding a second one', () => {
    expect(withDiscomfort('discomfort: knee', ['hip'])).toBe('discomfort: hip')
  })

  it('removes the flag when given no spots, leaving the rest of the note', () => {
    expect(withDiscomfort('felt strong today; discomfort: knee', [])).toBe('felt strong today')
    expect(withDiscomfort('discomfort: knee', [])).toBe('')
  })
})

describe('toggleDiscomfort', () => {
  it('flags a spot that was not flagged', () => {
    expect(toggleDiscomfort('', 'knee')).toBe('discomfort: knee')
  })

  it('unflags a spot that was, keeping the others', () => {
    expect(toggleDiscomfort('discomfort: knee, hip', 'knee')).toBe('discomfort: hip')
  })

  it('round-trips back to the original note', () => {
    const once = toggleDiscomfort('felt strong today', 'knee')
    expect(toggleDiscomfort(once, 'knee')).toBe('felt strong today')
  })
})

describe('discomfortReports', () => {
  it('reports one flagged session once, however many sets carry the flag', () => {
    const rows = [
      row({ set_number: 1, notes: 'discomfort: knee' }),
      row({ set_number: 2, notes: 'discomfort: knee' }),
      row({ set_number: 3, notes: 'discomfort: knee' }),
    ]
    expect(discomfortReports(rows, 'barbell_squat')).toEqual([
      { sessionId: 's1', date: '2026-08-11', spots: ['knee'] },
    ])
  })

  it('ignores other exercises and unflagged sessions', () => {
    const rows = [
      row({ session_id: 's1', notes: 'discomfort: knee' }),
      row({ session_id: 's2', date: '2026-08-04', notes: '' }),
      row({ session_id: 's3', date: '2026-08-05', exercise: 'flat_bench', notes: 'discomfort: shoulder' }),
    ]
    expect(discomfortReports(rows, 'barbell_squat')).toEqual([
      { sessionId: 's1', date: '2026-08-11', spots: ['knee'] },
    ])
  })

  it('returns the sessions newest first', () => {
    const rows = [
      row({ session_id: 's1', date: '2026-07-14', notes: 'discomfort: knee' }),
      row({ session_id: 's2', date: '2026-08-11', notes: 'discomfort: hip' }),
      row({ session_id: 's3', date: '2026-07-28', notes: 'discomfort: knee' }),
    ]
    expect(discomfortReports(rows, 'barbell_squat').map((r) => r.date)).toEqual([
      '2026-08-11',
      '2026-07-28',
      '2026-07-14',
    ])
  })

  it('groups rows saved without a session id by their date', () => {
    const rows = [
      row({ session_id: '', notes: 'discomfort: knee' }),
      row({ session_id: '', set_number: 2, notes: 'discomfort: hip' }),
    ]
    expect(discomfortReports(rows, 'barbell_squat')).toEqual([
      { sessionId: '2026-08-11', date: '2026-08-11', spots: ['knee', 'hip'] },
    ])
  })
})

describe('knownSpots', () => {
  it('keeps the spots the app counts, normalizing case and space', () => {
    expect(knownSpots([' Knee ', 'HIP'])).toEqual(['knee', 'hip'])
  })

  it('drops a spot the app does not count, so the tally stays addable', () => {
    expect(knownSpots(['left knee', 'quad'])).toEqual([])
    expect(knownSpots(['left knee', 'hip'])).toEqual(['hip'])
  })

  it('dedupes', () => {
    expect(knownSpots(['knee', 'knee'])).toEqual(['knee'])
  })
})

describe('sessionKeyOf', () => {
  it('keys a row by its session id, falling back to its date', () => {
    expect(sessionKeyOf(row({ session_id: 's1' }))).toBe('s1')
    expect(sessionKeyOf(row({ session_id: '' }))).toBe('2026-08-11')
  })
})

describe('discomfortEdit', () => {
  it('produces the note that flags a session already saved', () => {
    const rows = [row({ set_number: 1 }), row({ set_number: 2 })]
    expect(discomfortEdit(rows, 's1', 'barbell_squat', ['knee'])).toEqual({
      session: 's1',
      exercise: 'barbell_squat',
      notes: 'discomfort: knee',
    })
  })

  it('keeps note text the session already carried', () => {
    const rows = [row({ notes: 'belt on' })]
    expect(discomfortEdit(rows, 's1', 'barbell_squat', ['knee'])?.notes).toBe(
      'belt on; discomfort: knee',
    )
  })

  it('clears the flag when given no spots', () => {
    const rows = [row({ notes: 'discomfort: knee' })]
    expect(discomfortEdit(rows, 's1', 'barbell_squat', [])?.notes).toBe('')
  })

  it('replaces the existing flag rather than adding to it', () => {
    const rows = [row({ notes: 'discomfort: knee' })]
    expect(discomfortEdit(rows, 's1', 'barbell_squat', ['hip'])?.notes).toBe('discomfort: hip')
  })

  it('is null when that session logged no such exercise', () => {
    const rows = [row({ session_id: 's1', exercise: 'flat_bench' })]
    expect(discomfortEdit(rows, 's1', 'barbell_squat', ['knee'])).toBeNull()
    expect(discomfortEdit(rows, 's2', 'flat_bench', ['knee'])).toBeNull()
  })

  it('addresses a row saved without a session id by its date', () => {
    const rows = [row({ session_id: '' })]
    expect(discomfortEdit(rows, '2026-08-11', 'barbell_squat', ['knee'])?.session).toBe(
      '2026-08-11',
    )
  })
})

describe('applyNotesEdit', () => {
  it('rewrites every set row of the exercise, and nothing else', () => {
    const rows = [
      row({ set_number: 1 }),
      row({ set_number: 2 }),
      row({ set_number: 1, exercise: 'flat_bench' }),
      row({ session_id: 's2', date: '2026-08-04' }),
    ]
    const edit = { session: 's1', exercise: 'barbell_squat', notes: 'discomfort: knee' }
    expect(applyNotesEdit(rows, edit).map((r) => r.notes)).toEqual([
      'discomfort: knee',
      'discomfort: knee',
      '',
      '',
    ])
  })

  it('leaves the rows it edits otherwise untouched', () => {
    const rows = [row({ weight_lbs: 225, reps: 8 })]
    const [edited] = applyNotesEdit(rows, {
      session: 's1',
      exercise: 'barbell_squat',
      notes: 'discomfort: knee',
    })
    expect(edited).toEqual({ ...rows[0], notes: 'discomfort: knee' })
  })

  it('reads back as a report once applied', () => {
    const logged = [row({ set_number: 1 }), row({ set_number: 2 })]
    const edit = discomfortEdit(logged, 's1', 'barbell_squat', ['knee'])
    if (!edit) throw new Error('expected an edit')
    expect(discomfortReports(applyNotesEdit(logged, edit), 'barbell_squat')).toEqual([
      { sessionId: 's1', date: '2026-08-11', spots: ['knee'] },
    ])
  })
})

describe('lastSessionWith', () => {
  const rows = [
    row({ session_id: 's1', date: '2026-07-14' }),
    row({ session_id: 's2', date: '2026-08-11' }),
    row({ session_id: 's3', date: '2026-08-04' }),
    row({ session_id: 's4', date: '2026-08-18', exercise: 'flat_bench' }),
  ]

  it('finds the most recent session that logged the exercise', () => {
    expect(lastSessionWith(rows, 'barbell_squat')).toEqual({ session: 's2', date: '2026-08-11' })
  })

  it('finds the session on a named date', () => {
    expect(lastSessionWith(rows, 'barbell_squat', '2026-07-14')).toEqual({
      session: 's1',
      date: '2026-07-14',
    })
  })

  it('is null when the exercise was never logged, or not on that date', () => {
    expect(lastSessionWith(rows, 'leg_press')).toBeNull()
    expect(lastSessionWith(rows, 'barbell_squat', '2026-08-18')).toBeNull()
  })

  it('takes the later-logged of two sessions sharing a date', () => {
    const sameDay = [
      row({ session_id: 'morning', date: '2026-08-11' }),
      row({ session_id: 'evening', date: '2026-08-11' }),
    ]
    expect(lastSessionWith(sameDay, 'barbell_squat')?.session).toBe('evening')
  })

  it('keys a session saved without an id by its date', () => {
    expect(lastSessionWith([row({ session_id: '' })], 'barbell_squat')).toEqual({
      session: '2026-08-11',
      date: '2026-08-11',
    })
  })
})

describe('discomfortCounts', () => {
  it('counts the sessions each spot was flagged in and keeps the latest date', () => {
    const rows = [
      row({ session_id: 's1', date: '2026-07-14', notes: 'discomfort: knee' }),
      row({ session_id: 's2', date: '2026-07-28', notes: 'discomfort: knee, hip' }),
      row({ session_id: 's3', date: '2026-08-11', notes: 'discomfort: knee' }),
    ]
    expect(discomfortCounts(discomfortReports(rows, 'barbell_squat'))).toEqual([
      { spot: 'knee', sessions: 3, lastDate: '2026-08-11' },
      { spot: 'hip', sessions: 1, lastDate: '2026-07-28' },
    ])
  })

  it('breaks a tie on how recent the spot is', () => {
    const rows = [
      row({ session_id: 's1', date: '2026-07-14', notes: 'discomfort: hip' }),
      row({ session_id: 's2', date: '2026-08-11', notes: 'discomfort: knee' }),
    ]
    expect(discomfortCounts(discomfortReports(rows, 'barbell_squat')).map((c) => c.spot)).toEqual([
      'knee',
      'hip',
    ])
  })
})

describe('fmtDiscomfortCount', () => {
  it('reads as a plain date on a one-off', () => {
    expect(fmtDiscomfortCount({ spot: 'knee', sessions: 1, lastDate: '2026-08-11' }, today)).toBe(
      'knee · aug 11',
    )
  })

  it('reads as a tally once it has happened more than once', () => {
    expect(fmtDiscomfortCount({ spot: 'knee', sessions: 3, lastDate: '2026-08-11' }, today)).toBe(
      'knee ×3 · last aug 11',
    )
  })
})
