import { describe, it, expect } from 'vitest'
import { foldSides, mirrorSidedEdit, roundCards, sidePairPeer, sidesAgree, type SidedMember } from './sidePair'
import { DEFAULT_PLAN } from '../config/plan'
import type { ExerciseLog } from '../types'

/** The arm circuit as the plan lays it out: a tricep station between the raises. */
const ARMS: SidedMember[] = [
  { key: 'tricep_pushdown' },
  { key: 'lateral_raise_l', side: 'left' },
  { key: 'overhead_tricep_ext' },
  { key: 'lateral_raise_r', side: 'right' },
  { key: 'flat_bench' },
]

function log(exercise: string, sets: Array<{ weightLbs?: number | null; reps?: number; done?: boolean }>): ExerciseLog {
  return {
    exercise,
    sets: sets.map((s, i) => ({ setNumber: i + 1, weightLbs: s.weightLbs ?? 10, reps: s.reps ?? 12, done: s.done })),
  }
}

const setsOf = (logs: ExerciseLog[], key: string) =>
  logs.find((l) => l.exercise === key)!.sets.map((s) => [s.weightLbs, s.reps, s.done ?? false])

describe('sidePairPeer', () => {
  it('pairs a side with the next sided exercise of the other side, across what sits between', () => {
    expect(sidePairPeer(ARMS, 'lateral_raise_l')).toBe('lateral_raise_r')
    expect(sidePairPeer(ARMS, 'lateral_raise_r')).toBe('lateral_raise_l')
  })

  it('finds the pair whichever side the session put first', () => {
    const flipped = [ARMS[0], ARMS[3], ARMS[2], ARMS[1], ARMS[4]]
    expect(sidePairPeer(flipped, 'lateral_raise_l')).toBe('lateral_raise_r')
    expect(sidePairPeer(flipped, 'lateral_raise_r')).toBe('lateral_raise_l')
  })

  it('gives an unsided exercise no peer', () => {
    expect(sidePairPeer(ARMS, 'tricep_pushdown')).toBeNull()
    expect(sidePairPeer(ARMS, 'flat_bench')).toBeNull()
  })

  it('leaves a lone sided exercise alone', () => {
    expect(sidePairPeer([{ key: 'a' }, { key: 'solo_l', side: 'left' }], 'solo_l')).toBeNull()
    expect(sidePairPeer([{ key: 'x_l', side: 'left' }, { key: 'y_l', side: 'left' }], 'x_l')).toBeNull()
  })

  it('does not reach past a pair to the next one', () => {
    const two: SidedMember[] = [
      { key: 'a_l', side: 'left' },
      { key: 'a_r', side: 'right' },
      { key: 'b_l', side: 'left' },
      { key: 'b_r', side: 'right' },
    ]
    expect(sidePairPeer(two, 'a_r')).toBe('a_l')
    expect(sidePairPeer(two, 'b_l')).toBe('b_r')
  })

  it('pairs every shipped sided exercise with its other side', () => {
    for (const day of Object.values(DEFAULT_PLAN)) {
      for (const ex of day.exercises) {
        if (!ex.side) continue
        const peer = sidePairPeer(day.exercises, ex.key)
        expect(peer, ex.key).not.toBeNull()
        expect(day.exercises.find((e) => e.key === peer)?.side).not.toBe(ex.side)
      }
    }
  })
})

describe('mirrorSidedEdit', () => {
  const logs = () => [
    log('tricep_pushdown', [{}, {}, {}]),
    log('lateral_raise_l', [{}, {}, {}]),
    log('overhead_tricep_ext', [{}, {}, {}]),
    log('lateral_raise_r', [{}, {}, {}]),
  ]

  it('writes reps typed at one arm into the same set of the other arm', () => {
    const out = mirrorSidedEdit({ logs: logs(), exercises: ARMS, exKey: 'lateral_raise_l', index: 1, patch: { reps: 15 } })
    expect(setsOf(out, 'lateral_raise_r')).toEqual([[10, 12, false], [10, 15, false], [10, 12, false]])
  })

  it('writes a typed weight across the same way', () => {
    const out = mirrorSidedEdit({ logs: logs(), exercises: ARMS, exKey: 'lateral_raise_r', index: 0, patch: { weightLbs: 15 } })
    expect(setsOf(out, 'lateral_raise_l')).toEqual([[15, 12, false], [10, 12, false], [10, 12, false]])
  })

  it('touches only the pair — not the tricep stations, not the arm edited', () => {
    const before = logs()
    const out = mirrorSidedEdit({ logs: before, exercises: ARMS, exKey: 'lateral_raise_l', index: 0, patch: { reps: 15 } })
    expect(out[0]).toBe(before[0])
    expect(out[1]).toBe(before[1])
    expect(out[2]).toBe(before[2])
  })

  it('does not mirror a set being logged, even with measured reps', () => {
    const before = logs()
    expect(mirrorSidedEdit({ logs: before, exercises: ARMS, exKey: 'lateral_raise_l', index: 0, patch: { done: true, reps: 34 } })).toBe(before)
  })

  it('does not mirror a cleared weight or a note', () => {
    const before = logs()
    expect(mirrorSidedEdit({ logs: before, exercises: ARMS, exKey: 'lateral_raise_l', index: 0, patch: { weightLbs: null } })).toBe(before)
    expect(mirrorSidedEdit({ logs: before, exercises: ARMS, exKey: 'lateral_raise_l', index: 0, patch: { notes: 'felt heavy' } })).toBe(before)
  })

  it("leaves the other arm's set alone once it's done", () => {
    const before = [log('lateral_raise_l', [{}, {}]), log('lateral_raise_r', [{ reps: 11, done: true }, {}])]
    const out = mirrorSidedEdit({ logs: before, exercises: ARMS, exKey: 'lateral_raise_l', index: 0, patch: { reps: 15 } })
    expect(out).toBe(before)
  })

  it('skips a set the other arm does not have', () => {
    const before = [log('lateral_raise_l', [{}, {}, {}, {}]), log('lateral_raise_r', [{}, {}, {}])]
    expect(mirrorSidedEdit({ logs: before, exercises: ARMS, exKey: 'lateral_raise_l', index: 3, patch: { reps: 15 } })).toBe(before)
  })

  it('returns the same array when the other arm already reads the number', () => {
    const before = logs()
    expect(mirrorSidedEdit({ logs: before, exercises: ARMS, exKey: 'lateral_raise_l', index: 0, patch: { reps: 12 } })).toBe(before)
  })

  it('does nothing for an exercise with no pair', () => {
    const before = logs()
    expect(mirrorSidedEdit({ logs: before, exercises: ARMS, exKey: 'tricep_pushdown', index: 0, patch: { reps: 15 } })).toBe(before)
  })
})

describe('sidesAgree', () => {
  const set = (weightLbs: number | null, reps: number) => ({ setNumber: 1, weightLbs, reps })
  it('is the same weight and reps on both, and nothing against a missing set', () => {
    expect(sidesAgree(set(8, 15), set(8, 15))).toBe(true)
    expect(sidesAgree(set(8, 15), set(8, 14))).toBe(false)
    expect(sidesAgree(set(8, 15), set(9, 15))).toBe(false)
    expect(sidesAgree(set(null, 15), set(null, 15))).toBe(true)
    expect(sidesAgree(set(8, 15), undefined)).toBe(false)
  })
})

describe('roundCards', () => {
  const round = ARMS.slice(0, 4).map((ex) => ({ ex }))

  it('gives both arms one card at the leading arm, and an echo where the other arm goes', () => {
    const cards = roundCards(round, () => true)
    expect(cards.map((c) => c.kind)).toEqual(['one', 'pair', 'one', 'echo'])
    const pair = cards[1]
    expect(pair.kind === 'pair' && [pair.lead.ex.key, pair.follow.ex.key]).toEqual(['lateral_raise_l', 'lateral_raise_r'])
    const echo = cards[3]
    expect(echo.kind === 'echo' && echo.lead.ex.key).toBe('lateral_raise_l')
  })

  it('leads with whichever arm the round puts first', () => {
    const rightFirst = [round[0], round[3], round[2], round[1]]
    const cards = roundCards(rightFirst, () => true)
    expect(cards[1].kind === 'pair' && cards[1].lead.ex.key).toBe('lateral_raise_r')
  })

  it('keeps two cards when the sides are kept apart', () => {
    expect(roundCards(round, () => false).map((c) => c.kind)).toEqual(['one', 'one', 'one', 'one'])
  })

  it('merges nothing when only one side is on the screen', () => {
    expect(roundCards(round.slice(0, 3), () => true).map((c) => c.kind)).toEqual(['one', 'one', 'one'])
  })
})

describe('foldSides', () => {
  const name = (s: string) => s
  it('folds a pair that says the same thing into its side-less name', () => {
    expect(foldSides(['tricep pushdown', 'lateral raise (left)', 'lateral raise (right)'], name, (_, n) => n)).toEqual([
      'tricep pushdown',
      'lateral raise',
    ])
  })

  it('keeps sides that differ, and a lone side', () => {
    const prs = [
      { exercise: 'lateral raise (left)', est1RM: 10 },
      { exercise: 'lateral raise (right)', est1RM: 12 },
      { exercise: 'copenhagen plank (right)', est1RM: 0 },
    ]
    const out = foldSides(prs, (p) => p.exercise, (p, exercise) => ({ ...p, exercise }), (a, b) => a.est1RM === b.est1RM)
    expect(out).toEqual(prs)
  })
})
