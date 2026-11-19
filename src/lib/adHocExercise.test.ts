import { describe, expect, it } from 'vitest'
import { adHocAdditions, adHocExercise, exerciseOptions, isAdHocKey, LOGGED_GROUP, matchTypedName } from './adHocExercise'
import { ALL_EXERCISES, DAY_TYPES, DEFAULT_PLAN, QUICK_LOG_KEY, withPlanDefaults, type PlannedExercise, type SessionLength, type VariantKey } from '../config/plan'
import { performedExercises } from './performed'
import type { WorkoutRow } from '../types'

const row = (exercise: string): WorkoutRow => ({
  session_id: 's', date: '2026-11-01', day_type: 'push', exercise, set_number: 1,
  weight_lbs: null, reps: 10, notes: '', is_historical: false,
})

const ex = (key: string, extra: Partial<PlannedExercise> = {}): PlannedExercise => ({
  key, name: key, sets: 3, repMin: 8, repMax: 12, restSec: 90, group: 'g', ...extra,
})

describe('exerciseOptions', () => {
  it('offers every plan movement once, in plan order, under its group', () => {
    const opts = exerciseOptions(DEFAULT_PLAN, [], [])
    const keys = opts.filter((o) => o.base).map((o) => o.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.slice(0, DEFAULT_PLAN.push.exercises.length)).toEqual(DEFAULT_PLAN.push.exercises.map((e) => e.key))
    const first = opts[0]
    expect(first.group).toBe(DEFAULT_PLAN.push.exercises[0].group)
    expect(first.base).toBe(DEFAULT_PLAN.push.exercises[0])
  })

  it('leaves out what the workout already holds', () => {
    const inSession = DEFAULT_PLAN.push.exercises
    const opts = exerciseOptions(DEFAULT_PLAN, [], inSession)
    for (const e of inSession) expect(opts.find((o) => o.key === e.key)).toBeUndefined()
    expect(opts.length).toBeGreaterThan(0)
  })

  it('keeps a shipped default the live plan has dropped', () => {
    const dropped = ALL_EXERCISES[0]
    const without = (day: typeof DEFAULT_PLAN.push) => ({ ...day, exercises: day.exercises.filter((e) => e.key !== dropped.key) })
    const plan = { push: without(DEFAULT_PLAN.push), pull: without(DEFAULT_PLAN.pull), fullbody: without(DEFAULT_PLAN.fullbody) }
    const opts = exerciseOptions(plan, [], [])
    expect(opts.find((o) => o.key === dropped.key)?.base).toBe(dropped)
  })

  it('adds the names logged before that no movement explains, alphabetically and without a base', () => {
    const history = [row('sled push'), row('farmer carry'), row('sled push'), row(QUICK_LOG_KEY), row('adhoc:abc'), row('cable_pulldown')]
    const opts = exerciseOptions(DEFAULT_PLAN, history, [])
    const logged = opts.filter((o) => o.group === LOGGED_GROUP)
    expect(logged.map((o) => o.key)).toEqual(['cable_pulldown', 'farmer carry', 'sled push'])
    expect(logged.map((o) => o.name)).toEqual(['cable pull down', 'farmer carry', 'sled push'])
    expect(logged.every((o) => o.base == null)).toBe(true)
  })

  it('files a logged plan movement under its plan entry, not the log', () => {
    const key = DEFAULT_PLAN.pull.exercises[0].key
    const opts = exerciseOptions(DEFAULT_PLAN, [row(key)], [])
    expect(opts.filter((o) => o.key === key)).toHaveLength(1)
    expect(opts.find((o) => o.key === key)?.base).toBeDefined()
  })
})

/**
 * The whole point of the list: nothing you could want to add is ever missing
 * from it. Checked against every shape a session can take, since what a session
 * "already holds" is the one thing that takes a movement off the list.
 */
describe('exerciseOptions leaves nothing out', () => {
  // Movements the plan has retired but the log still holds, a name typed in once,
  // and a plan movement logged the ordinary way.
  const history = [
    row('iso_chest'), row('barbell_squat'), row('cable_row'), row('pullups_or_pulldown'),
    row('farmer carry'), row('overhead_tricep_ext'), row('hammer_curl'),
  ]
  const lengths: SessionLength[] = ['short', 'full']
  const variants: (VariantKey | undefined)[] = [undefined, 'A', 'B']
  // The plan as shipped, and as a phone that saved an older one holds it — with a
  // movement deleted from one day and one of the user's own added to another.
  const stored = withPlanDefaults({
    ...DEFAULT_PLAN,
    push: {
      ...DEFAULT_PLAN.push,
      exercises: DEFAULT_PLAN.push.exercises.filter((e) => e.key !== 'overhead_tricep_ext'),
      removed: ['overhead_tricep_ext'],
    },
    pull: { ...DEFAULT_PLAN.pull, exercises: [...DEFAULT_PLAN.pull.exercises, ex('sled_push', { name: 'sled push' })] },
  })
  const plans = [DEFAULT_PLAN, stored]

  const everything = (plan: typeof DEFAULT_PLAN) =>
    new Set([
      ...DAY_TYPES.flatMap((d) => plan[d].exercises.map((e) => e.key)),
      ...ALL_EXERCISES.map((e) => e.key),
      ...history.map((r) => r.exercise),
    ])

  for (const [p, plan] of plans.entries()) {
    for (const day of DAY_TYPES) {
      for (const length of lengths) {
        for (const variant of variants) {
          for (const resting of [{}, { restAbs: true }, { restNeck: true }, { restAbs: true, restNeck: true }]) {
            it(`offers all of it on a ${length} ${day} day (plan ${p}, variant ${variant ?? '-'}, ${JSON.stringify(resting)})`, () => {
              const inSession = performedExercises(plan[day], { variant, length, startSide: 'left', ...resting })
              const held = new Set(inSession.map((e) => e.key))
              const offered = exerciseOptions(plan, history, inSession).map((o) => o.key)
              expect(new Set(offered).size).toBe(offered.length)
              const want = [...everything(plan)].filter((k) => !held.has(k)).sort()
              expect([...offered].sort()).toEqual(want)
            })
          }
        }
      }
    }
  }

  it('offers the overhead tricep extension on every day that does not already run it', () => {
    for (const day of DAY_TYPES) {
      for (const length of lengths) {
        const inSession = performedExercises(DEFAULT_PLAN[day], { length, startSide: 'left' })
        const offered = exerciseOptions(DEFAULT_PLAN, history, inSession).some((o) => o.key === 'overhead_tricep_ext')
        expect(offered).toBe(!inSession.some((e) => e.key === 'overhead_tricep_ext'))
      }
    }
  })
})

describe('matchTypedName', () => {
  const options = exerciseOptions(DEFAULT_PLAN, [row('farmer carry')], [])
  it('lands a retyped name on the option it already is, whatever the case or spacing', () => {
    expect(matchTypedName('  Farmer Carry ', options)?.key).toBe('farmer carry')
    const planned = DEFAULT_PLAN.push.exercises[0]
    expect(matchTypedName(planned.name.toUpperCase(), options)?.key).toBe(planned.key)
  })
  it('matches nothing to a blank or a new name', () => {
    expect(matchTypedName('   ', options)).toBeNull()
    expect(matchTypedName('sandbag toss', options)).toBeNull()
  })
})

describe('adHocExercise', () => {
  it('mints a fresh ad-hoc key for a typed name and trims it', () => {
    const e = adHocExercise({ name: '  farmer carry ', sets: 3, reps: 12 }, null)
    expect(isAdHocKey(e.key)).toBe(true)
    expect(e).toMatchObject({ name: 'farmer carry', sets: 3, repMin: 12, repMax: 12, restSec: 60, group: 'ad hoc' })
    expect(adHocExercise({ name: 'x', sets: 1, reps: 1 }, null).key).not.toBe(e.key)
  })

  it('keeps a plan movement whole but for its place in the day', () => {
    const base = ex('plank', {
      name: 'plank', timed: true, repsOnly: true, increment: 5, weightCapLbs: 50, group: 'core',
      circuit: 'c', circuitRestSec: 10, circuitRoundRestSec: 90, roundScreen: true,
      sharedLoad: 's', side: 'left', shortSets: 2, byVariant: { A: { sets: 2 } }, optional: true,
    })
    const e = adHocExercise({ name: 'ignored', sets: 2, reps: 45 }, { key: base.key, name: base.name, group: base.group, base })
    expect(e).toEqual({
      key: 'plank', name: 'plank', sets: 2, repMin: 45, repMax: 45, restSec: 90,
      timed: true, repsOnly: true, increment: 5, weightCapLbs: 50, group: 'core',
    })
  })

  it('logs a movement known only from the log onto its stored key', () => {
    const e = adHocExercise({ name: 'typed', sets: 4, reps: 8 }, { key: 'farmer carry', name: 'farmer carry', group: LOGGED_GROUP })
    expect(e).toMatchObject({ key: 'farmer carry', name: 'farmer carry', sets: 4, repMin: 8, restSec: 60, group: LOGGED_GROUP })
  })

  it('clamps the counts into range and rounds them', () => {
    expect(adHocExercise({ name: 'x', sets: 0, reps: 1000.4 }, null)).toMatchObject({ sets: 1, repMin: 999 })
    expect(adHocExercise({ name: 'x', sets: 99, reps: NaN }, null)).toMatchObject({ sets: 20, repMin: 1 })
    expect(adHocExercise({ name: 'x', sets: 2.6, reps: 9.5 }, null)).toMatchObject({ sets: 3, repMin: 10 })
  })
})

describe('adHocAdditions', () => {
  const input = { name: '', sets: 2, reps: 30 }

  it('adds both sides of a sided movement, left first, with the same prescription', () => {
    const opts = exerciseOptions(DEFAULT_PLAN, [], [])
    const right = opts.find((o) => o.key === 'copenhagen_plank_r')!
    const added = adHocAdditions(input, right, opts)
    expect(added.map((e) => e.key)).toEqual(['copenhagen_plank_l', 'copenhagen_plank_r'])
    expect(added.map((e) => [e.sets, e.repMin])).toEqual([[2, 30], [2, 30]])
  })

  it("adds only the missing side when the workout already holds the other", () => {
    const opts = exerciseOptions(DEFAULT_PLAN, [], [ALL_EXERCISES.find((e) => e.key === 'copenhagen_plank_l')!])
    const right = opts.find((o) => o.key === 'copenhagen_plank_r')!
    expect(adHocAdditions(input, right, opts).map((e) => e.key)).toEqual(['copenhagen_plank_r'])
  })

  it('adds an unpaired movement or a typed name on its own', () => {
    const opts = exerciseOptions(DEFAULT_PLAN, [], [])
    expect(adHocAdditions(input, opts.find((o) => o.key === 'flat_bench')!, opts).map((e) => e.key)).toEqual(['flat_bench'])
    expect(adHocAdditions({ ...input, name: 'farmer carry' }, null, opts)).toHaveLength(1)
  })
})
