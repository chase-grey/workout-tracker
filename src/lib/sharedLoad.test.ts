import { describe, it, expect } from 'vitest'
import { sharedLoadPeers, spreadSharedWeight, type LoadGroupMember } from './sharedLoad'
import { DEFAULT_PLAN } from '../config/plan'
import type { ExerciseLog } from '../types'

const ARMS: LoadGroupMember[] = [
  { key: 'tricep_pushdown', sharedLoad: 'triceps' },
  { key: 'lateral_raise_l', sharedLoad: 'lateral' },
  { key: 'overhead_tricep_ext', sharedLoad: 'triceps' },
  { key: 'lateral_raise_r', sharedLoad: 'lateral' },
  { key: 'flat_bench' },
]

/** An exercise's sets, all pending, at one weight. */
function log(exercise: string, weightLbs: number | null, sets = 3): ExerciseLog {
  return {
    exercise,
    sets: Array.from({ length: sets }, (_, i) => ({
      setNumber: i + 1,
      weightLbs,
      reps: 12,
      done: false,
    })),
  }
}

const weights = (logs: ExerciseLog[], key: string) =>
  logs.find((l) => l.exercise === key)!.sets.map((s) => s.weightLbs)

describe('sharedLoadPeers', () => {
  it('finds the other member of a pair, both ways round', () => {
    expect(sharedLoadPeers(ARMS, 'tricep_pushdown')).toEqual(['overhead_tricep_ext'])
    expect(sharedLoadPeers(ARMS, 'overhead_tricep_ext')).toEqual(['tricep_pushdown'])
    expect(sharedLoadPeers(ARMS, 'lateral_raise_l')).toEqual(['lateral_raise_r'])
  })

  it('keeps the two groups of one circuit apart', () => {
    expect(sharedLoadPeers(ARMS, 'lateral_raise_r')).not.toContain('tricep_pushdown')
  })

  it('has nothing for an exercise that shares no load, or is alone in its group', () => {
    expect(sharedLoadPeers(ARMS, 'flat_bench')).toEqual([])
    expect(sharedLoadPeers(ARMS, 'nothing_by_this_key')).toEqual([])
    expect(sharedLoadPeers([{ key: 'a', sharedLoad: 'solo' }], 'a')).toEqual([])
  })

  it('leaves a bodyweight move out, as the targets do', () => {
    const list: LoadGroupMember[] = [
      { key: 'dips', sharedLoad: 'belt', bodyweight: true },
      { key: 'pullups', sharedLoad: 'belt', bodyweight: true },
      { key: 'row', sharedLoad: 'belt' },
    ]
    expect(sharedLoadPeers(list, 'dips')).toEqual([])
    expect(sharedLoadPeers(list, 'row')).toEqual([])
  })
})

describe('spreadSharedWeight', () => {
  const logs = [log('tricep_pushdown', 30), log('lateral_raise_l', 15), log('overhead_tricep_ext', 30), log('lateral_raise_r', 15)]

  it('carries a new weight to the rest of the group', () => {
    const out = spreadSharedWeight({
      logs,
      exercises: ARMS,
      exKey: 'tricep_pushdown',
      weightLbs: 35,
    })
    expect(weights(out, 'overhead_tricep_ext')).toEqual([35, 35, 35])
  })

  it('leaves the other group and the edited exercise alone', () => {
    const out = spreadSharedWeight({ logs, exercises: ARMS, exKey: 'lateral_raise_r', weightLbs: 20 })
    expect(weights(out, 'lateral_raise_l')).toEqual([20, 20, 20])
    expect(weights(out, 'tricep_pushdown')).toEqual([30, 30, 30])
    // The edited station is the caller's own patch to make; this only spreads.
    expect(weights(out, 'lateral_raise_r')).toEqual([15, 15, 15])
  })

  it('does not rewrite a set already logged', () => {
    const done: ExerciseLog[] = [
      log('tricep_pushdown', 30),
      {
        exercise: 'overhead_tricep_ext',
        sets: [
          { setNumber: 1, weightLbs: 30, reps: 12, done: true },
          { setNumber: 2, weightLbs: 30, reps: 12, done: false },
        ],
      },
    ]
    const out = spreadSharedWeight({
      logs: done,
      exercises: ARMS,
      exKey: 'tricep_pushdown',
      weightLbs: 35,
    })
    expect(weights(out, 'overhead_tricep_ext')).toEqual([30, 35])
  })

  it('spreads nothing for a cleared field, a reps-only edit, or an already-matching weight', () => {
    // Emptying the box on the way to a new number mustn't blank out the pair.
    expect(spreadSharedWeight({ logs, exercises: ARMS, exKey: 'tricep_pushdown', weightLbs: null })).toBe(logs)
    expect(
      spreadSharedWeight({ logs, exercises: ARMS, exKey: 'tricep_pushdown', weightLbs: undefined }),
    ).toBe(logs)
    // Same weight already on the pair: no new array, so nothing re-renders.
    expect(spreadSharedWeight({ logs, exercises: ARMS, exKey: 'tricep_pushdown', weightLbs: 30 })).toBe(logs)
  })

  it('reaches a group member the session has no log for without inventing one', () => {
    const partial = [log('tricep_pushdown', 30)]
    const out = spreadSharedWeight({
      logs: partial,
      exercises: ARMS,
      exKey: 'tricep_pushdown',
      weightLbs: 40,
    })
    expect(out).toBe(partial)
    expect(out.map((l) => l.exercise)).toEqual(['tricep_pushdown'])
  })
})

describe('the push day arm circuit', () => {
  it('pairs each tricep movement and each arm of the raise on one weight', () => {
    const push = DEFAULT_PLAN.push.exercises
    expect(sharedLoadPeers(push, 'tricep_pushdown')).toEqual(['overhead_tricep_ext'])
    expect(sharedLoadPeers(push, 'lateral_raise_l')).toEqual(['lateral_raise_r'])
  })
})
