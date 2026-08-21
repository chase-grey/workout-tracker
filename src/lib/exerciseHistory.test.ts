import { describe, expect, it } from 'vitest'
import {
  exerciseHistory,
  fmtBestSet,
  fmtSessionDate,
  fmtSet,
  fmtTarget,
  sessionsAtTargetLabel,
  targetDeltaLabel,
} from './exerciseHistory'
import type { WorkoutRow } from '../types'

/** One logged set. `set` is the sheet's set_number, which fixes the order. */
function r(
  session: string,
  date: string,
  set: number,
  weight: number | null,
  reps: number,
  extra: Partial<WorkoutRow> = {},
): WorkoutRow {
  return {
    session_id: session,
    date,
    day_type: 'push',
    exercise: 'flat_bench',
    set_number: set,
    weight_lbs: weight,
    reps,
    notes: '',
    is_historical: false,
    ...extra,
  }
}

const rows: WorkoutRow[] = [
  r('s1', '2026-07-15', 1, 125, 8),
  r('s1', '2026-07-15', 2, 125, 8),
  r('s2', '2026-07-22', 1, 130, 8),
  r('s2', '2026-07-22', 2, 130, 6),
  r('s3', '2026-07-29', 1, 130, 8),
  r('s3', '2026-07-29', 2, 130, 8),
  r('s3', '2026-07-29', 3, 130, 7),
]

describe('exerciseHistory', () => {
  it('lists sessions newest first with every set of each', () => {
    const h = exerciseHistory(rows, 'flat_bench')
    expect(h.sessions).toBe(3)
    expect(h.recent.map((s) => s.date)).toEqual(['2026-07-29', '2026-07-22', '2026-07-15'])
    expect(h.recent[0].sets).toEqual([
      { weightLbs: 130, reps: 8 },
      { weightLbs: 130, reps: 8 },
      { weightLbs: 130, reps: 7 },
    ])
  })

  it('orders sets within a session by set number, not row order', () => {
    const shuffled = [
      r('s1', '2026-07-15', 3, 125, 6),
      r('s1', '2026-07-15', 1, 125, 8),
      r('s1', '2026-07-15', 2, 125, 7),
    ]
    expect(exerciseHistory(shuffled, 'flat_bench').recent[0].sets.map((s) => s.reps)).toEqual([8, 7, 6])
  })

  it('ignores other exercises', () => {
    const h = exerciseHistory(rows, 'barbell_squat')
    expect(h).toEqual({
      recent: [],
      sessions: 0,
      best: null,
      sessionsByWeight: {},
      sessionsByReps: {},
    })
  })

  it('caps the list at the limit but counts every session', () => {
    const h = exerciseHistory(rows, 'flat_bench', undefined, 2)
    expect(h.recent.map((s) => s.date)).toEqual(['2026-07-29', '2026-07-22'])
    expect(h.sessions).toBe(3)
  })

  it('returns everything there is when history is shorter than the limit', () => {
    const h = exerciseHistory(rows, 'flat_bench', undefined, 10)
    expect(h.recent).toHaveLength(3)
  })

  it('reads the top set as the best reps at the session working weight', () => {
    // A heavy single after the working sets is the top WEIGHT but not the working
    // set — reps are read at the heaviest weight, whichever set reached them.
    const withSingle = [...rows, r('s3', '2026-07-29', 4, 150, 1)]
    const [latest] = exerciseHistory(withSingle, 'flat_bench').recent
    expect(latest.topWeight).toBe(150)
    expect(latest.topReps).toBe(1)
  })

  it('finds the all-time best set with the session that first hit it', () => {
    const withPR = [
      ...rows,
      r('s0', '2026-06-01', 1, 135, 5), // heaviest ever, earlier than the rest
      r('s4', '2026-08-01', 1, 135, 5), // matched later, so it doesn't take credit
    ]
    expect(exerciseHistory(withPR, 'flat_bench').best).toEqual({
      date: '2026-06-01',
      weightLbs: 135,
      reps: 5,
    })
  })

  it('breaks a tie on weight by reps', () => {
    const sets = [r('s1', '2026-07-15', 1, 130, 6), r('s1', '2026-07-15', 2, 130, 9)]
    expect(exerciseHistory(sets, 'flat_bench').best).toEqual({
      date: '2026-07-15',
      weightLbs: 130,
      reps: 9,
    })
  })

  it('counts the sessions spent at each working weight', () => {
    const h = exerciseHistory(rows, 'flat_bench')
    expect(h.sessionsByWeight).toEqual({ 125: 1, 130: 2 })
    expect(h.sessionsByReps).toEqual({ 8: 3 })
  })

  it('groups rows saved without a session id by their date', () => {
    const legacy = [r('', '2026-07-15', 1, 125, 8), r('', '2026-07-15', 2, 125, 8)]
    const h = exerciseHistory(legacy, 'flat_bench')
    expect(h.sessions).toBe(1)
    expect(h.recent[0].sets).toHaveLength(2)
  })
})

/**
 * Flat bench leads variant B and follows four other exercises in variant A, so the
 * A session is necessarily lighter. Listing both mid-workout would compare today's
 * set against a session trained under different fatigue.
 */
describe('exerciseHistory across A/B slots', () => {
  const bothSlots = [
    r('b1', '2026-07-06', 1, 185, 8, { variant: 'B' }), // led the day
    r('a1', '2026-07-08', 1, 165, 8, { variant: 'A' }), // second press of the day
    r('b2', '2026-07-13', 1, 190, 8, { variant: 'B' }),
  ]

  it('lists every session when no slot is asked for', () => {
    expect(exerciseHistory(bothSlots, 'flat_bench').sessions).toBe(3)
  })

  it('drops the sessions trained in the other slot', () => {
    const h = exerciseHistory(bothSlots, 'flat_bench', 'A')
    expect(h.sessions).toBe(1)
    expect(h.recent[0].topWeight).toBe(165)
  })

  it('keeps sessions with no slot recorded whatever the scope', () => {
    // Imported history and pre-split sessions: no second press to sit behind.
    const withLegacy = [...bothSlots, r('old', '2026-06-01', 1, 175, 8)]
    const h = exerciseHistory(withLegacy, 'flat_bench', 'A')
    expect(h.recent.map((s) => s.topWeight)).toEqual([165, 175])
  })
})

describe('exerciseHistory for reps-only work', () => {
  const legRaises: WorkoutRow[] = [
    r('s1', '2026-07-15', 1, null, 12, { exercise: 'hanging_leg_raise' }),
    r('s1', '2026-07-15', 2, null, 10, { exercise: 'hanging_leg_raise' }),
    r('s2', '2026-07-22', 1, null, 18, { exercise: 'hanging_leg_raise' }),
    r('s2', '2026-07-22', 2, null, 16, { exercise: 'hanging_leg_raise' }),
    r('s2', '2026-07-22', 3, null, 15, { exercise: 'hanging_leg_raise' }),
  ]

  it('keeps null weights and reads the top set as the most reps', () => {
    const h = exerciseHistory(legRaises, 'hanging_leg_raise')
    expect(h.recent[0].sets).toEqual([
      { weightLbs: null, reps: 18 },
      { weightLbs: null, reps: 16 },
      { weightLbs: null, reps: 15 },
    ])
    expect(h.recent[0].topWeight).toBeNull()
    expect(h.recent[0].topReps).toBe(18)
  })

  it('records the best set as the most reps in one set', () => {
    expect(exerciseHistory(legRaises, 'hanging_leg_raise').best).toEqual({
      date: '2026-07-22',
      weightLbs: null,
      reps: 18,
    })
  })

  it('counts sessions by rep count and none by weight', () => {
    const h = exerciseHistory(legRaises, 'hanging_leg_raise')
    expect(h.sessionsByReps).toEqual({ 12: 1, 18: 1 })
    expect(h.sessionsByWeight).toEqual({})
  })

  it('prefers any loaded set over an unloaded one for the record', () => {
    // A lift that started bodyweight and later took weight.
    const loadedLater = [...legRaises, r('s3', '2026-07-29', 1, 25, 8, { exercise: 'hanging_leg_raise' })]
    expect(exerciseHistory(loadedLater, 'hanging_leg_raise').best).toEqual({
      date: '2026-07-29',
      weightLbs: 25,
      reps: 8,
    })
  })
})

describe('targetDeltaLabel', () => {
  const last = { date: '2026-07-29', topWeight: 130, topReps: 8, heldEverySet: true, sameSlot: true }

  it('calls out a first session', () => {
    expect(targetDeltaLabel({ weightLbs: 135, reps: 8 }, null)).toBe('first time logging this')
  })

  it('reports a weight step up and down', () => {
    expect(targetDeltaLabel({ weightLbs: 135, reps: 8 }, last)).toBe('+5 lbs from last session')
    expect(targetDeltaLabel({ weightLbs: 122.5, reps: 8 }, last)).toBe('-7.5 lbs from last session')
  })

  it('reports a rep step at the same weight', () => {
    expect(targetDeltaLabel({ weightLbs: 130, reps: 9 }, last)).toBe('same weight, +1 rep')
    expect(targetDeltaLabel({ weightLbs: 130, reps: 6 }, last)).toBe('same weight, -2 reps')
  })

  it('reports a repeat', () => {
    expect(targetDeltaLabel({ weightLbs: 130, reps: 8 }, last)).toBe('same as last session')
  })

  it('compares reps alone for reps-only work', () => {
    const bodyweight = { date: '2026-07-29', topWeight: null, topReps: 16, heldEverySet: true, sameSlot: true }
    expect(targetDeltaLabel({ weightLbs: null, reps: 17 }, bodyweight)).toBe(
      '+1 rep from last session',
    )
    expect(targetDeltaLabel({ weightLbs: 130, reps: 14 }, bodyweight, true)).toBe(
      '-2 reps from last session',
    )
    expect(targetDeltaLabel({ weightLbs: null, reps: 16 }, bodyweight)).toBe('same as last session')
  })

  it('says nothing when there is no target to compare', () => {
    expect(targetDeltaLabel(undefined, last)).toBe('')
  })

  it('compares a timed hold in seconds', () => {
    const held = { date: '2026-07-29', topWeight: null, topReps: 30, heldEverySet: true, sameSlot: true }
    expect(targetDeltaLabel({ weightLbs: null, reps: 35 }, held, true, 'sec')).toBe(
      '+5s from last session',
    )
    expect(targetDeltaLabel({ weightLbs: null, reps: 22 }, held, true, 'sec')).toBe(
      '-8s from last session',
    )
  })
})

describe('sessionsAtTargetLabel', () => {
  it('counts the sessions at the target weight', () => {
    const h = exerciseHistory(rows, 'flat_bench')
    expect(sessionsAtTargetLabel(h, { weightLbs: 130, reps: 8 })).toBe('2 sessions at 130 lbs')
    expect(sessionsAtTargetLabel(h, { weightLbs: 125, reps: 8 })).toBe('1 session at 125 lbs')
  })

  it('says nothing about a weight never worked', () => {
    const h = exerciseHistory(rows, 'flat_bench')
    expect(sessionsAtTargetLabel(h, { weightLbs: 135, reps: 8 })).toBe('')
    expect(sessionsAtTargetLabel(h, undefined)).toBe('')
  })

  it('counts by rep target for reps-only work', () => {
    const h = exerciseHistory(
      [
        r('s1', '2026-07-15', 1, null, 18, { exercise: 'deadbug' }),
        r('s2', '2026-07-22', 1, null, 18, { exercise: 'deadbug' }),
      ],
      'deadbug',
    )
    expect(sessionsAtTargetLabel(h, { weightLbs: null, reps: 18 })).toBe('2 sessions at 18 reps')
  })

  it('counts a timed hold by the seconds it was held', () => {
    const h = exerciseHistory(
      [
        r('s1', '2026-07-15', 1, null, 30, { exercise: 'copenhagen_plank_l' }),
        r('s2', '2026-07-22', 1, null, 30, { exercise: 'copenhagen_plank_l' }),
      ],
      'copenhagen_plank_l',
    )
    expect(sessionsAtTargetLabel(h, { weightLbs: null, reps: 30 }, true, 'sec')).toBe(
      '2 sessions at 30s',
    )
  })
})

describe('formatters', () => {
  it('formats a compact lowercase session date', () => {
    const today = new Date(2026, 7, 5)
    expect(fmtSessionDate('2026-07-29', today)).toBe('jul 29')
    expect(fmtSessionDate('2026-01-03', today)).toBe('jan 3')
    // An older year says so rather than reading as this year.
    expect(fmtSessionDate('2025-12-18', today)).toBe("dec 18 '25")
  })

  it('formats sets, targets and records', () => {
    expect(fmtSet({ weightLbs: 130, reps: 8 })).toBe('130×8')
    expect(fmtSet({ weightLbs: 137.5, reps: 8 })).toBe('137.5×8')
    expect(fmtSet({ weightLbs: null, reps: 18 })).toBe('18')
    expect(fmtTarget({ weightLbs: 135, reps: 8 })).toBe('135 × 8')
    expect(fmtTarget({ weightLbs: 135, reps: 8 }, true)).toBe('8 reps')
    expect(fmtTarget({ weightLbs: null, reps: 1 })).toBe('1 rep')
    expect(fmtBestSet({ weightLbs: 155, reps: 5 })).toBe('155×5')
    expect(fmtBestSet({ weightLbs: null, reps: 22 })).toBe('22 reps')
  })
})
