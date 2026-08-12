import { describe, expect, it } from 'vitest'
import type { WorkoutRow } from '../types'
import { hasLoggedSets, sessionToRows, trainingDates, trainingSessions } from './session'
import { discomfortReports } from './discomfort'

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

  it('excludes a session made up only of supplemental (dead-bug) rows', () => {
    const rows = [
      row({ session_id: 'core', exercise: 'deadbug', set_number: 1 }),
      row({ session_id: 'core', exercise: 'deadbug', set_number: 2 }),
    ]
    expect(trainingSessions(rows)).toEqual([])
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
