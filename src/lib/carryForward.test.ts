import { describe, it, expect } from 'vitest'
import { carryLoggedSet } from './carryForward'
import type { ExerciseLog, SetLog } from '../types'

/** An exercise's sets, all pending, at one weight × reps. */
function log(exercise: string, weightLbs: number | null, reps: number, sets = 3): ExerciseLog {
  return {
    exercise,
    sets: Array.from({ length: sets }, (_, i) => ({
      setNumber: i + 1,
      weightLbs,
      reps,
      done: false,
    })),
  }
}

const setsOf = (logs: ExerciseLog[], key: string): SetLog[] =>
  logs.find((l) => l.exercise === key)!.sets

const shape = (logs: ExerciseLog[], key: string) =>
  setsOf(logs, key).map((s) => `${s.weightLbs ?? 'bw'}x${s.reps}${s.done ? '!' : ''}`)

describe('carryLoggedSet', () => {
  it('prefills the rest of the exercise with what was just logged', () => {
    const logs = [log('tricep_pushdown', 55, 12)]
    logs[0].sets[0] = { setNumber: 1, weightLbs: 50, reps: 10, done: true }
    const out = carryLoggedSet({ logs, exKey: 'tricep_pushdown', carried: { weightLbs: 50, reps: 10 } })
    expect(shape(out, 'tricep_pushdown')).toEqual(['50x10!', '50x10', '50x10'])
  })

  it('never rewrites a set already done', () => {
    const logs = [log('flat_bench', 135, 8)]
    logs[0].sets[0] = { setNumber: 1, weightLbs: 155, reps: 5, done: true }
    logs[0].sets[1] = { setNumber: 2, weightLbs: 145, reps: 6, done: true }
    const out = carryLoggedSet({ logs, exKey: 'flat_bench', carried: { weightLbs: 145, reps: 6 } })
    expect(shape(out, 'flat_bench')).toEqual(['155x5!', '145x6!', '145x6'])
  })

  it('reaches past the sets of other exercises a circuit interleaves', () => {
    // Round 1 of the pushdown is done at 50; its rounds 2 and 3 are two stations
    // away in the flow, and both still read the 55 they were built with.
    const logs = [log('tricep_pushdown', 55, 12), log('lateral_raise_l', 15, 15)]
    logs[0].sets[0] = { setNumber: 1, weightLbs: 50, reps: 12, done: true }
    const out = carryLoggedSet({ logs, exKey: 'tricep_pushdown', carried: { weightLbs: 50, reps: 12 } })
    expect(shape(out, 'tricep_pushdown')).toEqual(['50x12!', '50x12', '50x12'])
    expect(shape(out, 'lateral_raise_l')).toEqual(['15x15', '15x15', '15x15'])
  })

  it('carries a later set over an earlier carry', () => {
    const logs = [log('lateral_raise_r', 15, 15)]
    const first = carryLoggedSet({ logs, exKey: 'lateral_raise_r', carried: { weightLbs: 20, reps: 12 } })
    const second = carryLoggedSet({ logs: first, exKey: 'lateral_raise_r', carried: { weightLbs: 20, reps: 10 } })
    expect(shape(second, 'lateral_raise_r')).toEqual(['20x10', '20x10', '20x10'])
  })

  it('carries a bodyweight move on its reps alone', () => {
    const logs = [log('hanging_knee_raise', null, 12)]
    const out = carryLoggedSet({ logs, exKey: 'hanging_knee_raise', carried: { weightLbs: null, reps: 9 } })
    expect(shape(out, 'hanging_knee_raise')).toEqual(['bwx9', 'bwx9', 'bwx9'])
  })

  it('carries nothing from a set that logged no reps', () => {
    const logs = [log('neck_flexion', 25, 15)]
    const out = carryLoggedSet({ logs, exKey: 'neck_flexion', carried: { weightLbs: 30, reps: 0 } })
    expect(out).toBe(logs)
  })

  it('returns the same array when the set matched its prefill', () => {
    const logs = [log('squat', 185, 8)]
    logs[0].sets[0] = { setNumber: 1, weightLbs: 185, reps: 8, done: true }
    const out = carryLoggedSet({ logs, exKey: 'squat', carried: { weightLbs: 185, reps: 8 } })
    expect(out).toBe(logs)
  })

  it('leaves an exercise not in the session alone', () => {
    const logs = [log('squat', 185, 8)]
    expect(carryLoggedSet({ logs, exKey: 'deadlift', carried: { weightLbs: 225, reps: 5 } })).toBe(logs)
  })
})
