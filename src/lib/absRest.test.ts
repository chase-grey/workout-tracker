import { describe, expect, it } from 'vitest'
import { absTrainedOn, restoreAbs, restsAbs, withoutAbs } from './absRest'
import { performedExercises } from './performed'
import { DEFAULT_PLAN, shortExercises, variantExercises, type PlannedExercise } from '../config/plan'
import type { WorkoutRow, WorkoutSession } from '../types'

const row = (date: string, exercise: string, reps = 10): WorkoutRow => ({
  session_id: `s-${date}`, date, day_type: 'push', exercise, set_number: 1, weight_lbs: null, reps, notes: '', is_historical: false,
})

const ex = (key: string, sets: number, extra: Partial<PlannedExercise> = {}): PlannedExercise => ({
  key, name: key, sets, repMin: 8, repMax: 12, restSec: 60, group: 'g', ...extra,
})

const shortOf = (type: 'push' | 'pull' | 'fullbody', variant: 'A' | 'B' | null = null) => {
  const full = variantExercises(DEFAULT_PLAN[type], variant)
  return { full, sized: shortExercises(full, 'short') }
}
const counts = (list: PlannedExercise[]) => list.map((e) => [e.key, e.sets] as const)

describe('absTrainedOn / restsAbs', () => {
  it('reads any ab movement with reps on the date, including the mat sit-up and the retired raise', () => {
    expect(absTrainedOn([row('2026-11-04', 'cable_crunch')], DEFAULT_PLAN, '2026-11-04')).toBe(true)
    expect(absTrainedOn([row('2026-11-04', 'mat_situp')], DEFAULT_PLAN, '2026-11-04')).toBe(true)
    expect(absTrainedOn([row('2026-11-04', 'hanging_leg_raise')], DEFAULT_PLAN, '2026-11-04')).toBe(true)
    expect(absTrainedOn([row('2026-11-04', 'flat_bench')], DEFAULT_PLAN, '2026-11-04')).toBe(false)
    expect(absTrainedOn([row('2026-11-04', 'cable_crunch', 0)], DEFAULT_PLAN, '2026-11-04')).toBe(false)
  })

  it('rests the abs the day after ab work, or later the same day, and not two days on', () => {
    const rows = [row('2026-11-04', 'weighted_situp')]
    expect(restsAbs(rows, DEFAULT_PLAN, '2026-11-05')).toBe(true)
    expect(restsAbs(rows, DEFAULT_PLAN, '2026-11-04')).toBe(true)
    expect(restsAbs(rows, DEFAULT_PLAN, '2026-11-06')).toBe(false)
    expect(restsAbs([], DEFAULT_PLAN, '2026-11-05')).toBe(false)
  })

  it('steps back across a month boundary', () => {
    expect(restsAbs([row('2026-10-31', 'cable_crunch')], DEFAULT_PLAN, '2026-11-01')).toBe(true)
  })
})

describe('withoutAbs', () => {
  it('leaves a list with no ab block untouched', () => {
    const list = [ex('a', 3), ex('b', 3)]
    expect(withoutAbs(list, list)).toBe(list)
  })

  it('drops the block and nothing else with no fill', () => {
    const full = [ex('crunch', 4, { group: 'abs' }), ex('a', 3), ex('b', 3)]
    expect(withoutAbs(full, full, 'none')).toEqual([full[1], full[2]])
  })

  it('borrows the full day\'s extras in order while the ab time lasts, then adds sets', () => {
    // Ab block: 2 × 4 × (40 + 60) = 800 s to spend.
    const full = [
      ex('crunch', 4, { group: 'abs' }),
      ex('situp', 4, { group: 'abs' }),
      ex('a', 4, { shortSets: 3, restSec: 120 }), // gap 1 × 160
      ex('b', 3, { shortSets: 0, restSec: 60 }), // 3 × 100 = 300
      ex('c', 3, { restSec: 120 }), // nothing to borrow
    ]
    const sized = shortExercises(full, 'short')
    const out = withoutAbs(sized, full, 'borrow')
    // Borrowed: a's 4th set (160) and all of b (300) → 340 left. Sets pass: a +1
    // (160 → 180 left), b +1 (100 → 80 left), c (160: 80 ≥ 80 fits) → 0 left.
    expect(counts(out)).toEqual([['a', 5], ['b', 4], ['c', 4]])
  })

  it('never borrows a movement the day did not have when only adding sets', () => {
    const full = [ex('crunch', 4, { group: 'abs' }), ex('a', 3), ex('b', 3, { shortSets: 0 })]
    const sized = shortExercises(full, 'short')
    const out = withoutAbs(sized, full, 'sets')
    expect(out.map((e) => e.key)).toEqual(['a'])
    // 400 s to spend at 100 a set, but at most two extra sets of one movement.
    expect(out[0].sets).toBe(5)
  })

  it('adds a circuit a whole round at a time', () => {
    const station = (key: string) => ex(key, 2, { circuit: 'c', roundScreen: true, circuitRoundRestSec: 120 })
    const full = [ex('crunch', 2, { group: 'abs', restSec: 60 }), station('l'), station('r')]
    // 200 s to spend; a round is 80 work + 120 rest = 200.
    expect(counts(withoutAbs(full, full, 'sets'))).toEqual([['l', 3], ['r', 3]])
  })

  it('keeps the shipped short days in order, abs out, with their time respent', () => {
    for (const [type, variant] of [['push', 'A'], ['pull', null], ['fullbody', null]] as const) {
      const { full, sized } = shortOf(type, variant)
      const out = withoutAbs(sized, full)
      expect(out.some((e) => /^(abs|core)$/i.test(e.group))).toBe(false)
      // Day order is the full day's order.
      const order = full.map((e) => e.key)
      expect(out.map((e) => order.indexOf(e.key))).toEqual([...out.map((e) => order.indexOf(e.key))].sort((a, b) => a - b))
      // More sets than the short day had after the abs left, and never past full + 2.
      const before = sized.filter((e) => e.group !== 'abs').reduce((s, e) => s + e.sets, 0)
      expect(out.reduce((s, e) => s + e.sets, 0)).toBeGreaterThan(before)
      for (const e of out) expect(e.sets).toBeLessThanOrEqual(full.find((f) => f.key === e.key)!.sets + 2)
    }
  })

  it('on a short push day, borrows the full day back and then a set of each bench', () => {
    // 800 s: the second press's third set (160) and the third arm round (280) come
    // back, then a set of each bench (160 each) spends what's left.
    const { full, sized } = shortOf('push', 'A')
    expect(counts(withoutAbs(sized, full))).toEqual([
      ['incline_bench', 5],
      ['flat_bench', 4],
      ['machine_overhead_press', 3],
      ['tricep_pushdown', 3],
      ['lateral_raise_l', 3],
      ['overhead_tricep_ext', 3],
      ['lateral_raise_r', 3],
    ])
  })
})

function started(planned: PlannedExercise[], extra: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    sessionId: 's1',
    date: '2026-11-05',
    dayType: 'push',
    isHistorical: false,
    length: 'short',
    restAbs: true,
    exercises: planned.map((e) => ({
      exercise: e.key,
      sets: Array.from({ length: e.sets }, (_, i) => ({ setNumber: i + 1, weightLbs: 100, reps: 10, done: false })),
    })),
    ...extra,
  }
}

describe('restoreAbs', () => {
  const full = [
    ex('crunch', 4, { group: 'abs' }),
    ex('situp', 4, { group: 'abs' }),
    ex('a', 4, { shortSets: 3, restSec: 120 }),
    ex('b', 3, { shortSets: 0 }),
    ex('c', 3, { restSec: 120 }),
  ]
  const sized = shortExercises(full, 'short')
  const filled = withoutAbs(sized, full) // a 5, b 4, c 4

  it('puts the ab block at the top prefilled from the targets and takes the fill back', () => {
    const session = started(filled)
    const out = restoreAbs(session, sized, new Map([['crunch', { weightLbs: 8, reps: 14 }]]))
    expect(out.restAbs).toBe(false)
    expect(out.exercises.map((l) => [l.exercise, l.sets.length])).toEqual([['crunch', 4], ['situp', 4], ['a', 3], ['c', 3]])
    expect(out.exercises[0].sets[0]).toEqual({ setNumber: 1, weightLbs: 8, reps: 14, done: false })
    // A key the targets don't know prefills the plan's opening reps and no weight.
    expect(out.exercises[1].sets[0]).toEqual({ setNumber: 1, weightLbs: null, reps: 8, done: false })
  })

  it('keeps a set that is already logged, and a borrowed movement with one done', () => {
    const session = started(filled)
    const a = session.exercises.find((l) => l.exercise === 'a')!
    a.sets[3] = { ...a.sets[3], done: true } // the 4th set, one past the short count, is done
    const b = session.exercises.find((l) => l.exercise === 'b')!
    b.sets[0] = { ...b.sets[0], done: true }
    const out = restoreAbs(session, sized, new Map())
    expect(out.exercises.find((l) => l.exercise === 'a')!.sets.length).toBe(4)
    // b isn't in the day with abs in, but it has a logged set: kept whole, after the day's own.
    expect(out.exercises.map((l) => l.exercise)).toEqual(['crunch', 'situp', 'a', 'c', 'b'])
    expect(out.exercises.find((l) => l.exercise === 'b')!.sets.length).toBe(4)
  })

  it('stops trimming at a done set even with undone sets below the count above it', () => {
    const session = started([ex('a', 6)])
    session.exercises[0].sets[5] = { ...session.exercises[0].sets[5], done: true }
    const out = restoreAbs(session, [ex('a', 3)], new Map())
    expect(out.exercises[0].sets.length).toBe(6)
  })

  it('keeps a movement the session added itself', () => {
    const adHoc = ex('adhoc:1', 2)
    const session = started([...filled, adHoc], { adHocExercises: [adHoc] })
    const out = restoreAbs(session, sized, new Map())
    expect(out.exercises.map((l) => l.exercise)).toContain('adhoc:1')
  })

  it('restores exactly the day a session with abs in would have started with', () => {
    const day = DEFAULT_PLAN.pull
    const resting = { variant: undefined, length: 'short' as const, startSide: 'left' as const, restAbs: true }
    const withAbs = performedExercises(day, { ...resting, restAbs: false })
    const session = started(performedExercises(day, resting), { dayType: 'pull' })
    const out = restoreAbs(session, withAbs, new Map())
    expect(out.exercises.map((l) => [l.exercise, l.sets.length])).toEqual(withAbs.map((e) => [e.key, e.sets]))
  })
})

describe('performedExercises', () => {
  it('stacks variant, length, abs rest and side order', () => {
    const list = performedExercises(DEFAULT_PLAN.push, { variant: 'B', length: 'short', startSide: 'right', restAbs: true })
    expect(list.some((e) => e.group === 'abs')).toBe(false)
    expect(list[0].key).toBe('flat_bench')
    const sided = list.filter((e) => e.side)
    expect(sided[0].side).toBe('right')
  })

  it('is the plain short day when the abs are in', () => {
    const list = performedExercises(DEFAULT_PLAN.push, { variant: 'A', length: 'short', startSide: 'left', restAbs: false })
    expect(list.map((e) => e.key).slice(0, 3)).toEqual(['cable_crunch', 'weighted_situp', 'incline_bench'])
  })
})
