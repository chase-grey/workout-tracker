import { describe, expect, it } from 'vitest'
import {
  availableExercises,
  combinedRepsSeries,
  exerciseSeries,
  exercisesByFrequency,
  filterRange,
  offSlotSeries,
  sessionCount,
  sustainedRepsSeries,
} from './progress'
import { ALL_EXERCISES, DEFAULT_PLAN, absExerciseKeys } from '../config/plan'
import type { WorkoutRow } from '../types'

function r(session: string, date: string, weight: number | null, reps: number): WorkoutRow {
  return {
    session_id: session,
    date,
    day_type: 'push',
    exercise: 'bench',
    set_number: 1,
    weight_lbs: weight,
    reps,
    notes: '',
    is_historical: false,
  }
}

const rows: WorkoutRow[] = [
  r('a', '2026-01-01', 100, 10), // session a
  r('a', '2026-01-01', 120, 5),
  r('b', '2026-06-01', 130, 5), // session b
]

describe('exerciseSeries', () => {
  it('computes best 1RM per session, sorted by date', () => {
    const s = exerciseSeries(rows, 'bench', '1rm')
    expect(s.map((p) => p.date)).toEqual(['2026-01-01', '2026-06-01'])
    expect(s[0].value).toBeCloseTo(140, 0) // 120×5
    expect(s[1].value).toBeCloseTo(151.7, 1) // 130×5
  })

  it('sums volume across a session', () => {
    const s = exerciseSeries(rows, 'bench', 'volume')
    expect(s[0].value).toBe(100 * 10 + 120 * 5)
  })

  it('ignores other exercises', () => {
    expect(exerciseSeries(rows, 'squat', 'weight')).toEqual([])
  })
})

describe('sustainedRepsSeries', () => {
  const pullup = (session: string, date: string, reps: number[]): WorkoutRow[] =>
    reps.map((n, i) => ({ ...r(session, date, null, n), exercise: 'weighted_pullups', set_number: i + 1 }))

  it('reports the reps every one of the sets cleared, not the best set', () => {
    const s = sustainedRepsSeries(pullup('a', '2026-01-05', [12, 9, 8, 10]), 'weighted_pullups', 4)
    expect(s).toEqual([{ date: '2026-01-05', value: 8 }])
  })

  it('reads the nth-best set when more than n were logged', () => {
    // Five sets of 10/9/8/7/6: four of them made 7, so 4×7 is what was held.
    const s = sustainedRepsSeries(pullup('a', '2026-01-05', [10, 9, 8, 7, 6]), 'weighted_pullups', 4)
    expect(s[0].value).toBe(7)
  })

  it('leaves out a session short of the set count rather than scoring it zero', () => {
    const rows = [...pullup('a', '2026-01-05', [10, 10, 10]), ...pullup('b', '2026-01-12', [9, 9, 9, 9])]
    expect(sustainedRepsSeries(rows, 'weighted_pullups', 4)).toEqual([{ date: '2026-01-12', value: 9 }])
  })

  it('sorts oldest → newest and ignores other exercises', () => {
    const rows = [
      ...pullup('b', '2026-02-01', [8, 8, 8, 8]),
      ...pullup('a', '2026-01-01', [5, 6, 7, 8]),
      r('c', '2026-03-01', 100, 20),
    ]
    expect(sustainedRepsSeries(rows, 'weighted_pullups', 4)).toEqual([
      { date: '2026-01-01', value: 5 },
      { date: '2026-02-01', value: 8 },
    ])
  })
})

/**
 * Flat bench leads variant B and follows four other exercises in variant A, so
 * the A session is necessarily lighter. Plotting both draws a sawtooth that reads
 * as backsliding every other session when nothing was lost.
 */
describe('exerciseSeries across A/B slots', () => {
  const bench = (session: string, date: string, weight: number, variant?: 'A' | 'B'): WorkoutRow => ({
    ...r(session, date, weight, 8),
    exercise: 'flat_bench',
    variant,
  })

  const bothSlots = [
    bench('b1', '2026-01-05', 185, 'B'), // led the day
    bench('a1', '2026-01-07', 165, 'A'), // second press of the day
    bench('b2', '2026-01-12', 190, 'B'),
  ]

  it('charts strength off the lead slot alone', () => {
    for (const metric of ['weight', '1rm'] as const) {
      const s = exerciseSeries(bothSlots, 'flat_bench', metric)
      expect(s.map((p) => p.date)).toEqual(['2026-01-05', '2026-01-12'])
    }
  })

  it('counts every session for the workload metrics', () => {
    // A second-press session's sets are real work that really was done.
    for (const metric of ['volume', 'reps'] as const) {
      expect(exerciseSeries(bothSlots, 'flat_bench', metric)).toHaveLength(3)
    }
  })

  it('reads a named slot for comparing against the session in progress', () => {
    const s = exerciseSeries(bothSlots, 'flat_bench', 'weight', 'A')
    expect(s.map((p) => p.value)).toEqual([165])
  })

  it('charts everything when asked for all slots', () => {
    expect(exerciseSeries(bothSlots, 'flat_bench', 'weight', 'all')).toHaveLength(3)
  })

  it('keeps sessions with no slot recorded whatever the scope', () => {
    // Imported history and pre-split sessions: no second press to sit behind.
    const withLegacy = [...bothSlots, bench('old', '2025-12-01', 175)]
    expect(exerciseSeries(withLegacy, 'flat_bench', 'weight', 'A').map((p) => p.value)).toEqual([
      175, 165,
    ])
  })

  it('leaves an exercise the variants train alike untouched', () => {
    const crunches = [
      { ...bench('a1', '2026-01-05', 50, 'A'), exercise: 'cable_crunch' },
      { ...bench('b1', '2026-01-07', 55, 'B'), exercise: 'cable_crunch' },
    ]
    expect(exerciseSeries(crunches, 'cable_crunch', 'weight')).toHaveLength(2)
  })

  describe('offSlotSeries hands back what the lead-slot line dropped', () => {
    it('returns the second-press sessions, and only those', () => {
      const off = offSlotSeries(bothSlots, 'flat_bench', 'weight')
      expect(off).toEqual([{ date: '2026-01-07', value: 165 }])
    })

    it('accounts for every session between the line and the rings', () => {
      const line = exerciseSeries(bothSlots, 'flat_bench', '1rm')
      const off = offSlotSeries(bothSlots, 'flat_bench', '1rm')
      expect([...line, ...off].map((p) => p.date).sort()).toEqual([
        '2026-01-05',
        '2026-01-07',
        '2026-01-12',
      ])
    })

    it('reads the other slot for the other press — incline leads variant A', () => {
      const incline = bothSlots.map((row) => ({ ...row, exercise: 'incline_bench' }))
      expect(offSlotSeries(incline, 'incline_bench', 'weight').map((p) => p.date)).toEqual([
        '2026-01-05',
        '2026-01-12',
      ])
    })

    it('leaves out a session with no slot recorded — it is on the line already', () => {
      const withLegacy = [...bothSlots, bench('old', '2025-12-01', 175)]
      expect(offSlotSeries(withLegacy, 'flat_bench', 'weight').map((p) => p.date)).toEqual([
        '2026-01-07',
      ])
    })

    it('has nothing to say for a workload metric — those count every session', () => {
      for (const metric of ['volume', 'reps'] as const) {
        expect(offSlotSeries(bothSlots, 'flat_bench', metric)).toEqual([])
      }
    })

    it('has nothing to say for a lift the variants train alike', () => {
      const crunches = bothSlots.map((row) => ({ ...row, exercise: 'cable_crunch' }))
      expect(offSlotSeries(crunches, 'cable_crunch', 'weight')).toEqual([])
    })
  })
})

describe('availableExercises', () => {
  it('includes plan exercises and prettified unplanned imported keys', () => {
    const planKey = ALL_EXERCISES[0].key
    const w: WorkoutRow[] = [
      { ...r('s1', '2026-01-01', 100, 5), exercise: planKey },
      { ...r('s2', '2026-02-01', 90, 8), exercise: planKey },
      { ...r('s3', '2026-03-01', 40, 12), exercise: 'prayer_curls' },
      { ...r('s4', '2026-03-02', 40, 12), exercise: 'prayer_curls' }, // duplicate key
    ]
    const list = availableExercises(w)

    // all plan exercises are present
    for (const e of ALL_EXERCISES) {
      expect(list).toContainEqual({ key: e.key, name: e.name })
    }

    // the unplanned imported key is present, prettified
    expect(list).toContainEqual({ key: 'prayer_curls', name: 'Prayer Curls' })

    // no duplicate entries for the imported key
    expect(list.filter((x) => x.key === 'prayer_curls')).toHaveLength(1)

    // plan exercises come before imported extras
    const planCount = ALL_EXERCISES.length
    expect(list.slice(0, planCount).map((x) => x.key)).toEqual(ALL_EXERCISES.map((e) => e.key))
    expect(list[planCount]).toEqual({ key: 'prayer_curls', name: 'Prayer Curls' })
  })
})

describe('exercisesByFrequency', () => {
  const [first, second, third] = ALL_EXERCISES

  // third: 3 sessions, second: 2, first: 1 — deliberately the reverse of plan order.
  const w: WorkoutRow[] = [
    { ...r('s1', '2026-01-01', 100, 5), exercise: first.key },
    { ...r('s2', '2026-01-02', 100, 5), exercise: second.key },
    { ...r('s2', '2026-01-02', 110, 5), exercise: second.key }, // second set, same session
    { ...r('s3', '2026-01-03', 100, 5), exercise: second.key },
    { ...r('s4', '2026-01-04', 40, 12), exercise: third.key },
    { ...r('s5', '2026-01-05', 40, 12), exercise: third.key },
    { ...r('s6', '2026-01-06', 40, 12), exercise: third.key },
    { ...r('s7', '2026-01-07', 40, 12), exercise: 'prayer_curls' },
  ]

  it('orders by session count, counting each session once', () => {
    const list = exercisesByFrequency(w)
    expect(list.slice(0, 3)).toEqual([
      { key: third.key, name: third.name, sessions: 3 },
      { key: second.key, name: second.name, sessions: 2 },
      { key: first.key, name: first.name, sessions: 1 },
    ])
  })

  it('sinks never-logged plan exercises to the bottom in plan order', () => {
    const list = exercisesByFrequency(w)
    const untrained = list.filter((e) => e.sessions === 0)

    // every option with a session outranks every option without one
    expect(list.slice(0, list.length - untrained.length).every((e) => e.sessions > 0)).toBe(true)

    const trainedKeys = new Set([first.key, second.key, third.key])
    expect(untrained.map((e) => e.key)).toEqual(
      ALL_EXERCISES.map((e) => e.key).filter((k) => !trainedKeys.has(k)),
    )
  })

  it('ranks an imported one-off by its own frequency, not below the plan', () => {
    const list = exercisesByFrequency(w)
    const curls = list.findIndex((e) => e.key === 'prayer_curls')
    expect(list[curls].sessions).toBe(1)
    // ahead of every plan exercise that was never trained
    expect(list.slice(curls + 1).every((e) => e.sessions === 0)).toBe(true)
  })
})

describe('sessionCount', () => {
  it('counts the union of sessions across keys', () => {
    const w: WorkoutRow[] = [
      { ...r('s1', '2026-01-01', 100, 5), exercise: 'flat_bench' },
      { ...r('s2', '2026-01-02', 100, 5), exercise: 'incline_bench' },
      // both presses in one session counts that session once
      { ...r('s3', '2026-01-03', 100, 5), exercise: 'flat_bench' },
      { ...r('s3', '2026-01-03', 80, 5), exercise: 'incline_bench' },
    ]
    expect(sessionCount(w, ['flat_bench', 'incline_bench'])).toBe(3)
    expect(sessionCount(w, ['flat_bench'])).toBe(2)
    expect(sessionCount(w, ['squat'])).toBe(0)
  })
})

describe('absExerciseKeys', () => {
  it('collects every Abs/Core exercise across all days, not just the Core day', () => {
    const keys = absExerciseKeys(DEFAULT_PLAN)
    // Push-day ab work + the dedicated Core-day move all count.
    expect(keys.has('cable_crunch')).toBe(true)
    expect(keys.has('hanging_leg_raise')).toBe(true)
    expect(keys.has('deadbug')).toBe(true)
    // Non-core work is excluded.
    expect(keys.has('flat_bench')).toBe(false)
    expect(keys.has('barbell_squat')).toBe(false)
  })
})

describe('combinedRepsSeries', () => {
  it('sums reps across all matching keys per session, ignoring others', () => {
    const w: WorkoutRow[] = [
      { ...r('s1', '2026-01-01', 50, 12), exercise: 'cable_crunch' },
      { ...r('s1', '2026-01-01', null, 10), exercise: 'hanging_leg_raise' },
      { ...r('s1', '2026-01-01', 100, 8), exercise: 'flat_bench' }, // not core
      { ...r('s2', '2026-02-01', null, 20), exercise: 'deadbug' },
    ]
    const keys = new Set(['cable_crunch', 'hanging_leg_raise', 'deadbug'])
    const s = combinedRepsSeries(w, keys)
    expect(s).toEqual([
      { date: '2026-01-01', value: 22 }, // 12 + 10, bench ignored
      { date: '2026-02-01', value: 20 },
    ])
  })

  it('returns empty when no core work is logged', () => {
    expect(combinedRepsSeries(rows, new Set(['deadbug']))).toEqual([])
  })
})

describe('filterRange', () => {
  it('keeps only points within the window', () => {
    const s = exerciseSeries(rows, 'bench', 'weight')
    const recent = filterRange(s, 3, new Date(2026, 6, 1)) // last 3 months from Jul 2026
    expect(recent.map((p) => p.date)).toEqual(['2026-06-01'])
  })
})
