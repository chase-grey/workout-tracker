import { describe, it, expect } from 'vitest'
import type { WorkoutRow } from '../types'
import {
  discomfortCounts,
  discomfortReports,
  fmtDiscomfortCount,
  parseDiscomfort,
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
