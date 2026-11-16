import { describe, expect, it } from 'vitest'
import { NECK_REST, neckExerciseKeys, restsNeck } from './neckRest'
import { restsAbs, withoutAbs } from './absRest'
import { restoreGroup } from './groupRest'
import { performedExercises, restingFlags } from './performed'
import { DEFAULT_PLAN, shortExercises, variantExercises } from '../config/plan'
import type { WorkoutRow, WorkoutSession } from '../types'

const row = (date: string, exercise: string, reps = 15): WorkoutRow => ({
  session_id: `s-${date}`, date, day_type: 'pull', exercise, set_number: 1, weight_lbs: 10, reps, notes: '', is_historical: false,
})

const shape = { variant: undefined, length: 'short' as const, startSide: 'left' as const }
const keys = (list: { key: string }[]) => list.map((e) => e.key)

describe('restsNeck', () => {
  it('rests the neck the day after neck work, or later the same day', () => {
    const rows = [row('2026-11-16', 'neck_flexion')]
    expect(restsNeck(rows, DEFAULT_PLAN, '2026-11-17')).toBe(true)
    expect(restsNeck(rows, DEFAULT_PLAN, '2026-11-16')).toBe(true)
  })

  it('trains it again two days on', () => {
    expect(restsNeck([row('2026-11-15', 'neck_flexion')], DEFAULT_PLAN, '2026-11-17')).toBe(false)
  })

  it('counts the retired extension, but not a set with no reps or another muscle', () => {
    expect(restsNeck([row('2026-11-16', 'neck_extension')], DEFAULT_PLAN, '2026-11-17')).toBe(true)
    expect(restsNeck([row('2026-11-16', 'neck_flexion', 0)], DEFAULT_PLAN, '2026-11-17')).toBe(false)
    expect(restsNeck([row('2026-11-16', 'cable_crunch')], DEFAULT_PLAN, '2026-11-17')).toBe(false)
  })

  it('counts a movement the plan groups as neck', () => {
    const plan = {
      ...DEFAULT_PLAN,
      push: { ...DEFAULT_PLAN.push, exercises: [...DEFAULT_PLAN.push.exercises, { key: 'neck_side', name: 'neck side', sets: 2, repMin: 12, repMax: 20, restSec: 45, group: 'neck' }] },
    }
    expect(neckExerciseKeys(plan).has('neck_side')).toBe(true)
  })
})

describe('a session resting the neck', () => {
  it('leaves neck flexion out of the day and spends nothing on it', () => {
    for (const type of ['pull', 'fullbody'] as const) {
      const out = performedExercises(DEFAULT_PLAN[type], { ...shape, restNeck: true })
      const plain = performedExercises(DEFAULT_PLAN[type], shape)
      expect(keys(out)).not.toContain('neck_flexion')
      expect(out).toEqual(plain.filter((e) => e.key !== 'neck_flexion'))
    }
  })

  it('starts with the neck out after neck work yesterday, and in two days on', () => {
    const yesterday = [row('2026-11-16', 'neck_flexion')]
    const flags = restingFlags(yesterday, DEFAULT_PLAN, '2026-11-17')
    expect(flags).toEqual({ restNeck: true })
    expect(keys(performedExercises(DEFAULT_PLAN.fullbody, { ...shape, ...flags }))).not.toContain('neck_flexion')

    const twoDaysAgo = restingFlags([row('2026-11-15', 'neck_flexion')], DEFAULT_PLAN, '2026-11-17')
    expect(twoDaysAgo).toEqual({})
    expect(keys(performedExercises(DEFAULT_PLAN.fullbody, { ...shape, ...twoDaysAgo }))).toContain('neck_flexion')
  })

  it('leaves the abs alone', () => {
    const rows = [row('2026-11-16', 'neck_flexion')]
    expect(restsAbs(rows, DEFAULT_PLAN, '2026-11-17')).toBe(false)
    const out = performedExercises(DEFAULT_PLAN.pull, { ...shape, restNeck: true })
    expect(keys(out).slice(0, 2)).toEqual(['cable_crunch', 'weighted_situp'])
  })

  it('takes the neck out before the ab fill runs, so the fill spends nothing on it', () => {
    const out = performedExercises(DEFAULT_PLAN.fullbody, { ...shape, restAbs: true, restNeck: true })
    const full = variantExercises(DEFAULT_PLAN.fullbody, null).filter((e) => e.group !== 'neck')
    const expected = withoutAbs(shortExercises(full, 'short'), full)
    expect(keys(out)).not.toContain('neck_flexion')
    expect(out.map((e) => [e.key, e.sets])).toEqual(expected.map((e) => [e.key, e.sets]))
  })

  it('brings the neck back at the end of the day and keeps the abs resting', () => {
    const resting = { ...shape, restAbs: true, restNeck: true }
    const planned = performedExercises(DEFAULT_PLAN.pull, resting)
    const session: WorkoutSession = {
      sessionId: 's1', date: '2026-11-17', dayType: 'pull', isHistorical: false, ...resting,
      exercises: planned.map((e) => ({
        exercise: e.key,
        sets: Array.from({ length: e.sets }, (_, i) => ({ setNumber: i + 1, weightLbs: 100, reps: 10, done: false })),
      })),
    }
    const withNeck = performedExercises(DEFAULT_PLAN.pull, { ...resting, restNeck: false })
    const out = restoreGroup(NECK_REST, session, withNeck, new Map([['neck_flexion', { weightLbs: 10, reps: 14 }]]))
    expect(out.restNeck).toBe(false)
    expect(out.restAbs).toBe(true)
    expect(out.exercises.at(-1)?.exercise).toBe('neck_flexion')
    expect(out.exercises.at(-1)?.sets).toHaveLength(3)
    expect(out.exercises.at(-1)?.sets[0]).toEqual({ setNumber: 1, weightLbs: 10, reps: 14, done: false })
    expect(out.exercises.some((l) => l.exercise === 'cable_crunch')).toBe(false)
  })
})
