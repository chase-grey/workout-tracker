import { describe, expect, it } from 'vitest'
import type { WorkoutRow } from '../types'
import {
  CORE_SESSION_NOTE,
  hasLoggedSets,
  isSupplementalSet,
  sessionToRows,
  trainingDates,
  trainingSessions,
} from './session'
import { discomfortReports, withDiscomfort } from './discomfort'

function row(p: Partial<WorkoutRow> = {}): WorkoutRow {
  return {
    session_id: 's1',
    date: '2026-07-21',
    day_type: 'push',
    exercise: 'flat_bench',
    set_number: 1,
    weight_lbs: 100,
    reps: 5,
    notes: '',
    is_historical: false,
    ...p,
  }
}

describe('trainingSessions', () => {
  it('collapses rows to one entry per session, keeping first date + day type', () => {
    const rows = [
      row({ session_id: 'a', date: '2026-07-20', day_type: 'push' }),
      row({ session_id: 'a', date: '2026-07-20', exercise: 'lateral_raise' }),
      row({ session_id: 'b', date: '2026-07-22', day_type: 'pull' }),
    ]
    const out = trainingSessions(rows)
    expect(out).toEqual([
      { sessionId: 'a', date: '2026-07-20', dayType: 'push' },
      { sessionId: 'b', date: '2026-07-22', dayType: 'pull' },
    ])
  })

  it('excludes a session made up only of supplemental (retired dead-bug) rows', () => {
    const rows = [
      row({ session_id: 'core', exercise: 'deadbug', set_number: 1 }),
      row({ session_id: 'core', exercise: 'deadbug', set_number: 2 }),
    ]
    expect(trainingSessions(rows)).toEqual([])
  })

  it("excludes a stretch's core block, marked by its note rather than its key", () => {
    const rows = [
      row({ session_id: 'core', exercise: 'weighted_situp', notes: CORE_SESSION_NOTE }),
      row({
        session_id: 'core',
        exercise: 'weighted_situp',
        set_number: 2,
        notes: CORE_SESSION_NOTE,
      }),
    ]
    expect(trainingSessions(rows)).toEqual([])
  })

  it('counts a training day that trains the same core movement for real', () => {
    const rows = [
      row({ session_id: 'push', exercise: 'flat_bench' }),
      row({ session_id: 'push', exercise: 'weighted_situp', set_number: 2 }),
    ]
    expect(trainingSessions(rows)).toHaveLength(1)
  })

  it('still counts a workout that mixes real and supplemental work', () => {
    const rows = [
      row({ session_id: 'mix', exercise: 'deadbug' }),
      row({ session_id: 'mix', exercise: 'flat_bench' }),
    ]
    expect(trainingSessions(rows)).toHaveLength(1)
  })

  it('ignores rows without a session_id', () => {
    expect(trainingSessions([row({ session_id: '' })])).toEqual([])
  })
})

describe('isSupplementalSet', () => {
  it('reads the core note as one segment of the note, not the whole of it', () => {
    // A twinge flagged after the fact appends a segment; the row is still a
    // stretch's core set.
    const notes = withDiscomfort(CORE_SESSION_NOTE, ['lower back'])
    expect(isSupplementalSet({ exercise: 'weighted_situp', notes })).toBe(true)
  })

  it('leaves an ordinary set of the same movement alone', () => {
    expect(isSupplementalSet({ exercise: 'weighted_situp', notes: '' })).toBe(false)
  })

  it('still recognizes the retired dead bug, whose rows carry no note', () => {
    expect(isSupplementalSet({ exercise: 'deadbug', notes: '' })).toBe(true)
  })
})

describe('trainingDates', () => {
  it('counts two workouts in a day once', () => {
    const rows = [
      row({ session_id: 'am', date: '2026-07-20', day_type: 'push' }),
      row({ session_id: 'pm', date: '2026-07-20', day_type: 'pull' }),
      row({ session_id: 'b', date: '2026-07-22' }),
    ]
    expect(trainingDates(rows)).toEqual(['2026-07-20', '2026-07-22'])
  })

  it('leaves out a day that was only supplemental core work', () => {
    const rows = [
      row({ session_id: 'core', date: '2026-07-20', exercise: 'deadbug' }),
      row({ session_id: 'b', date: '2026-07-22' }),
    ]
    expect(trainingDates(rows)).toEqual(['2026-07-22'])
  })

  it('sorts oldest first', () => {
    const rows = [row({ session_id: 'b', date: '2026-07-22' }), row({ session_id: 'a', date: '2026-07-20' })]
    expect(trainingDates(rows)).toEqual(['2026-07-20', '2026-07-22'])
  })
})

describe('sessionToRows', () => {
  it('flattens each set into a row', () => {
    const rows = sessionToRows({
      sessionId: 's',
      date: '2026-07-21',
      dayType: 'push',
      isHistorical: false,
      exercises: [{ exercise: 'flat_bench', sets: [{ setNumber: 1, weightLbs: 135, reps: 8 }] }],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].exercise).toBe('flat_bench')
    expect(rows[0].reps).toBe(8)
  })

  it("stamps the session's A/B slot onto every row", () => {
    // Without it there is no way to tell afterwards whether a bench set led the
    // day or followed four other exercises (see lastPerformance).
    const rows = sessionToRows({
      sessionId: 's',
      date: '2026-07-21',
      dayType: 'push',
      isHistorical: false,
      variant: 'B',
      exercises: [
        {
          exercise: 'flat_bench',
          sets: [
            { setNumber: 1, weightLbs: 185, reps: 8 },
            { setNumber: 2, weightLbs: 185, reps: 7 },
          ],
        },
      ],
    })
    expect(rows.map((r) => r.variant)).toEqual(['B', 'B'])
  })

  it('leaves the slot off a day that does not run variants', () => {
    const rows = sessionToRows({
      sessionId: 's',
      date: '2026-07-21',
      dayType: 'pull',
      isHistorical: false,
      exercises: [{ exercise: 'barbell_squat', sets: [{ setNumber: 1, weightLbs: 225, reps: 5 }] }],
    })
    expect(rows[0].variant).toBeUndefined()
  })

  it("carries an exercise's discomfort flag onto its rows, readable again", () => {
    // The flag has no column of its own; it rides the free-text notes the sheet
    // already stores per set, so this is the whole of how it reaches history.
    const rows = sessionToRows({
      sessionId: 's',
      date: '2026-07-21',
      dayType: 'pull',
      isHistorical: false,
      exercises: [
        {
          exercise: 'barbell_squat',
          notes: 'discomfort: knee',
          sets: [
            { setNumber: 1, weightLbs: 225, reps: 8 },
            { setNumber: 2, weightLbs: 225, reps: 7 },
          ],
        },
      ],
    })
    expect(rows.map((r) => r.notes)).toEqual(['discomfort: knee', 'discomfort: knee'])
    expect(discomfortReports(rows, 'barbell_squat')).toEqual([
      { sessionId: 's', date: '2026-07-21', spots: ['knee'] },
    ])
  })
})

describe('hasLoggedSets', () => {
  it('is true only when a set has reps', () => {
    const base = { sessionId: 's', date: '2026-07-21', dayType: 'push' as const, isHistorical: false }
    expect(hasLoggedSets({ ...base, exercises: [{ exercise: 'x', sets: [{ setNumber: 1, weightLbs: null, reps: 0 }] }] })).toBe(false)
    expect(hasLoggedSets({ ...base, exercises: [{ exercise: 'x', sets: [{ setNumber: 1, weightLbs: null, reps: 10 }] }] })).toBe(true)
  })
})

describe('a max attempt is not a workout on its own', () => {
  it('excludes a session that was nothing but a single', () => {
    const rows = [row({ session_id: 'attempt', exercise: 'leg_press', weight_lbs: 380, reps: 1 })]
    expect(trainingSessions(rows)).toEqual([])
  })

  it('keeps a real session that ended with one', () => {
    const rows = [
      row({ session_id: 'legs', exercise: 'leg_press', weight_lbs: 300, reps: 8 }),
      row({ session_id: 'legs', exercise: 'leg_press', weight_lbs: 380, reps: 1, set_number: 2 }),
    ]
    expect(trainingSessions(rows)).toEqual([
      { sessionId: 'legs', date: '2026-07-21', dayType: 'push' },
    ])
  })

  it('still counts a bodyweight set logged as one rep — there is no weight to max', () => {
    const rows = [row({ session_id: 'pull', exercise: 'weighted_pullups', weight_lbs: null, reps: 1 })]
    expect(trainingSessions(rows)).toHaveLength(1)
  })
})
