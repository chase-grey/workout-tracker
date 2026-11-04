import { describe, expect, it } from 'vitest'
import { expandToFull } from './sessionLength'
import { DEFAULT_PLAN, shortExercises, variantExercises, type PlannedExercise } from '../config/plan'
import type { WorkoutSession } from '../types'

const ex = (key: string, sets: number, extra: Partial<PlannedExercise> = {}): PlannedExercise => ({
  key, name: key, sets, repMin: 8, repMax: 12, restSec: 60, group: 'g', ...extra,
})

const full = [ex('a', 4, { shortSets: 3 }), ex('b', 3, { shortSets: 0 }), ex('c', 3)]

function started(planned: PlannedExercise[], length: 'short' | 'full' = 'short'): WorkoutSession {
  return {
    sessionId: 's1',
    date: '2026-11-04',
    dayType: 'push',
    isHistorical: false,
    length,
    exercises: planned.map((e) => ({
      exercise: e.key,
      sets: Array.from({ length: e.sets }, (_, i) => ({ setNumber: i + 1, weightLbs: 100, reps: 10, done: false })),
    })),
  }
}

describe('expandToFull', () => {
  it('adds the sets a movement was cut to, prefilled from its last set', () => {
    const short = started(shortExercises(full, 'short'))
    short.exercises[0].sets[2] = { setNumber: 3, weightLbs: 105, reps: 9, done: true }
    const out = expandToFull(short, full, new Map())
    const a = out.exercises.find((l) => l.exercise === 'a')!
    expect(a.sets.map((s) => s.setNumber)).toEqual([1, 2, 3, 4])
    expect(a.sets[2]).toEqual({ setNumber: 3, weightLbs: 105, reps: 9, done: true })
    expect(a.sets[3]).toEqual({ setNumber: 4, weightLbs: 105, reps: 9, done: false })
    expect(out.length).toBe('full')
  })

  it('splices a movement the short day left out into its place, prefilled from the target', () => {
    const short = started(shortExercises(full, 'short'))
    expect(short.exercises.map((l) => l.exercise)).toEqual(['a', 'c'])
    const out = expandToFull(short, full, new Map([['b', { weightLbs: 40, reps: 11 }]]))
    expect(out.exercises.map((l) => l.exercise)).toEqual(['a', 'b', 'c'])
    const b = out.exercises[1]
    expect(b.sets).toHaveLength(3)
    expect(b.sets[0]).toEqual({ setNumber: 1, weightLbs: 40, reps: 11, done: false })
  })

  it('falls back to the opening reps and no weight for a target it was not given', () => {
    const out = expandToFull(started(shortExercises(full, 'short')), full, new Map())
    expect(out.exercises[1].sets[0]).toEqual({ setNumber: 1, weightLbs: null, reps: 8, done: false })
  })

  it('never removes a set or a log, and is a no-op the second time', () => {
    const short = started(shortExercises(full, 'short'))
    short.exercises.push({ exercise: 'adhoc:1', sets: [{ setNumber: 1, weightLbs: null, reps: 12, done: true }] })
    const once = expandToFull(short, full, new Map())
    expect(once.exercises.map((l) => l.exercise)).toEqual(['a', 'b', 'c', 'adhoc:1'])
    const twice = expandToFull(once, full, new Map())
    expect(twice.exercises).toEqual(once.exercises)
  })

  it('leaves a log that already has more sets than the day asks for alone', () => {
    const s = started(full)
    s.exercises[2].sets.push({ setNumber: 4, weightLbs: 100, reps: 10, done: false })
    const out = expandToFull(s, full, new Map())
    expect(out.exercises[2].sets).toHaveLength(4)
  })

  it('opens the shipped short push day up to the whole variant', () => {
    const planned = variantExercises(DEFAULT_PLAN.push, 'A')
    const short = started(shortExercises(planned, 'short'))
    const out = expandToFull(short, planned, new Map())
    expect(out.exercises.map((l) => l.exercise)).toEqual(planned.map((e) => e.key))
    out.exercises.forEach((l, i) => expect(l.sets).toHaveLength(planned[i].sets))
  })
})
