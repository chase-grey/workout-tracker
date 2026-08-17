import { describe, it, expect } from 'vitest'
import {
  DAY_TYPES,
  DEFAULT_PLAN,
  TODAY_DAY_ORDER,
  PLAN_REVISION,
  dayOrder,
  exerciseName,
  sideOrderedExercises,
  unslugKey,
  variantExercises,
  withCircuitRest,
  withDayOrder,
  withPlanDefaults,
  type DayPlan,
  type Plan,
  type PlannedExercise,
} from './plan'
import { buildSetOrder } from '../lib/circuit'
import { restBeforeNextSet } from '../lib/rest'

describe('TODAY_DAY_ORDER', () => {
  it('offers every day exactly once', () => {
    expect([...TODAY_DAY_ORDER].sort()).toEqual([...DAY_TYPES].sort())
  })

  it('puts full body ahead of pull + legs', () => {
    expect(TODAY_DAY_ORDER.indexOf('fullbody')).toBeLessThan(TODAY_DAY_ORDER.indexOf('pull'))
  })
})

describe('dayOrder', () => {
  it('falls back to the shipped order for a plan nobody has reordered', () => {
    expect(dayOrder(DEFAULT_PLAN)).toEqual(TODAY_DAY_ORDER)
  })

  it('follows the order the user saved', () => {
    const reordered = withDayOrder(DEFAULT_PLAN, ['pull', 'fullbody', 'push'])
    expect(dayOrder(reordered)).toEqual(['pull', 'fullbody', 'push'])
  })

  it('survives the round trip through storage', () => {
    const reordered = withDayOrder(DEFAULT_PLAN, ['pull', 'push', 'fullbody'])
    const loaded = withPlanDefaults(JSON.parse(JSON.stringify(reordered)) as Plan, PLAN_REVISION)
    expect(dayOrder(loaded)).toEqual(['pull', 'push', 'fullbody'])
  })

  it('keeps a saved arrangement through a shipped restructure', () => {
    // A revision bump re-adopts the shipped exercises; where the user put the days
    // is their arrangement, not part of that programming change.
    const reordered = withDayOrder(DEFAULT_PLAN, ['fullbody', 'pull', 'push'])
    const loaded = withPlanDefaults(JSON.parse(JSON.stringify(reordered)) as Plan, 0)
    expect(dayOrder(loaded)).toEqual(['fullbody', 'pull', 'push'])
  })

  it('offers every day exactly once even with duplicate or missing numbers', () => {
    const messy = {
      ...DEFAULT_PLAN,
      push: { ...DEFAULT_PLAN.push, order: 5 },
      pull: { ...DEFAULT_PLAN.pull, order: 5 },
    }
    const order = dayOrder(messy)
    expect([...order].sort()).toEqual([...DAY_TYPES].sort())
    // fullbody has no number, so it sorts by where it ships — ahead of both here.
    expect(order[0]).toBe('fullbody')
    // The tie between push and pull breaks the shipped way round.
    expect(order.indexOf('push')).toBeLessThan(order.indexOf('pull'))
  })

  it('numbers every day, so no leftover position outranks the new one', () => {
    const reordered = withDayOrder(DEFAULT_PLAN, ['pull'])
    expect(DAY_TYPES.every((t) => typeof reordered[t].order === 'number')).toBe(true)
    expect(dayOrder(reordered)[0]).toBe('pull')
  })
})

describe('withPlanDefaults', () => {
  it('keeps only the current day types and fills any missing one from the defaults', () => {
    const stored = { push: DEFAULT_PLAN.push } as Partial<Plan>
    const merged = withPlanDefaults(stored)
    expect(Object.keys(merged).sort()).toEqual([...DAY_TYPES].sort())
    expect(merged.pull.exercises.length).toBeGreaterThan(0)
  })

  it('drops a stored day type that no longer exists (the removed Core/abs day)', () => {
    // A plan saved back when the standalone Core day still shipped.
    const stored = {
      ...DEFAULT_PLAN,
      abs: { type: 'abs', label: 'Abs / Core', required: false, exercises: [] },
    } as unknown as Partial<Plan>
    const merged = withPlanDefaults(stored)
    expect('abs' in merged).toBe(false)
    expect(Object.keys(merged).sort()).toEqual([...DAY_TYPES].sort())
  })

  it('merges newly shipped exercises into a stored day near their neighbour', () => {
    // A stored push day from before Lateral Raise shipped, with a user edit.
    const defaultKeys = DEFAULT_PLAN.push.exercises.map((e) => e.key)
    // Derived rather than hard-coded, so reordering the day doesn't fail this test
    // for a reason that has nothing to do with the merge.
    const predecessor = defaultKeys[defaultKeys.indexOf('lateral_raise_l') - 1]
    const storedPush = {
      ...DEFAULT_PLAN.push,
      exercises: DEFAULT_PLAN.push.exercises
        .filter((e) => e.key !== 'lateral_raise_l')
        .map((e) => (e.key === 'flat_bench' ? { ...e, sets: 5 } : e)),
    }
    const merged = withPlanDefaults({ ...DEFAULT_PLAN, push: storedPush }, PLAN_REVISION)
    const keys = merged.push.exercises.map((e) => e.key)
    expect(keys).toContain('lateral_raise_l')
    // Inserted right after the default exercise it follows in the shipped day.
    expect(keys.indexOf('lateral_raise_l')).toBe(keys.indexOf(predecessor) + 1)
  })

  it('drops a retired default exercise from a stored day', () => {
    // The optional lat-pulldown finisher, retired now that pull + legs exists.
    const storedPush = {
      ...DEFAULT_PLAN.push,
      exercises: [
        ...DEFAULT_PLAN.push.exercises,
        { key: 'pullups_or_pulldown', name: 'weighted pull-ups or lat pulldown', sets: 3, repMin: 6, repMax: 10, restSec: 90, bodyweight: true, optional: true, group: 'pull finisher (optional)' },
      ],
    }
    const merged = withPlanDefaults({ ...DEFAULT_PLAN, push: storedPush }, PLAN_REVISION)
    expect(merged.push.exercises.map((e) => e.key)).not.toContain('pullups_or_pulldown')
  })

  it('re-adopts a renamed default exercise a stored day still calls by its old name', () => {
    const storedPush = {
      ...DEFAULT_PLAN.push,
      exercises: DEFAULT_PLAN.push.exercises.map((e) =>
        e.key === 'hanging_leg_raise' ? { ...e, name: 'hanging leg raise' } : e,
      ),
    }
    const merged = withPlanDefaults({ ...DEFAULT_PLAN, push: storedPush }, PLAN_REVISION)
    expect(merged.push.exercises.find((e) => e.key === 'hanging_leg_raise')?.name).toBe(
      'hanging knee raise',
    )
  })

  it('adopts structural fields (circuit, variants) the plan editor cannot set', () => {
    // A stored day saved before the arm circuit and the A/B split shipped.
    const storedPush = {
      ...DEFAULT_PLAN.push,
      exercises: DEFAULT_PLAN.push.exercises.map(({ circuit: _c, byVariant: _v, ...rest }) => rest),
    }
    const merged = withPlanDefaults({ ...DEFAULT_PLAN, push: storedPush }, PLAN_REVISION)
    expect(merged.push.exercises.find((e) => e.key === 'tricep_pushdown')?.circuit).toBe('arms')
    expect(merged.push.exercises.find((e) => e.key === 'flat_bench')?.byVariant?.B?.sets).toBe(4)
  })

  it('raises a stored 5-lb step on a two-dumbbell movement to a real one', () => {
    // What every device saved before the pair was accounted for: half a step, since
    // moving up swaps both dumbbells.
    const storedPull = {
      ...DEFAULT_PLAN.pull,
      exercises: DEFAULT_PLAN.pull.exercises.map((e) =>
        e.dumbbellPair ? { ...e, increment: 5 } : e,
      ),
    }
    const merged = withPlanDefaults({ ...DEFAULT_PLAN, pull: storedPull }, PLAN_REVISION)
    expect(merged.pull.exercises.find((e) => e.key === 'hammer_curl')?.increment).toBe(10)
    expect(merged.pull.exercises.find((e) => e.key === 'incline_db_curl')?.increment).toBe(10)
  })

  it('leaves a weight step the user chose themselves alone', () => {
    const storedPull = {
      ...DEFAULT_PLAN.pull,
      exercises: DEFAULT_PLAN.pull.exercises.map((e) =>
        e.key === 'hammer_curl' ? { ...e, increment: 20 } : e,
      ),
    }
    const merged = withPlanDefaults({ ...DEFAULT_PLAN, pull: storedPull }, PLAN_REVISION)
    expect(merged.pull.exercises.find((e) => e.key === 'hammer_curl')?.increment).toBe(20)
  })

  it('adopts the pair flag on a day stored before it existed', () => {
    const storedPull = {
      ...DEFAULT_PLAN.pull,
      exercises: DEFAULT_PLAN.pull.exercises.map(({ dumbbellPair: _p, ...rest }) => rest),
    }
    const merged = withPlanDefaults({ ...DEFAULT_PLAN, pull: storedPull }, PLAN_REVISION)
    expect(merged.pull.exercises.find((e) => e.key === 'hammer_curl')?.dumbbellPair).toBe(true)
  })

  it('never clobbers a user-customized exercise', () => {
    const storedPush = {
      ...DEFAULT_PLAN.push,
      exercises: DEFAULT_PLAN.push.exercises.map((e) =>
        e.key === 'flat_bench' ? { ...e, sets: 5, restSec: 200 } : e,
      ),
    }
    const merged = withPlanDefaults({ ...DEFAULT_PLAN, push: storedPush }, PLAN_REVISION)
    const flat = merged.push.exercises.find((e) => e.key === 'flat_bench')
    expect(flat?.sets).toBe(5)
    expect(flat?.restSec).toBe(200)
  })

  describe('a plan that predates a shipped restructure', () => {
    /** A stored push day as it looked before this revision: old order and volume. */
    const legacyPush = {
      type: 'push' as const,
      label: 'push',
      required: true,
      exercises: [
        { key: 'cable_crunch', name: 'cable crunch', sets: 3, repMin: 12, repMax: 15, restSec: 60, increment: 5, group: 'abs' },
        { key: 'hanging_leg_raise', name: 'hanging leg raise', sets: 3, repMin: 10, repMax: 15, restSec: 60, bodyweight: true, group: 'abs' },
        { key: 'incline_bench', name: 'incline bench press', sets: 4, repMin: 6, repMax: 10, restSec: 150, increment: 5, group: 'chest' },
        { key: 'flat_bench', name: 'flat bench press', sets: 3, repMin: 8, repMax: 12, restSec: 120, increment: 5, group: 'chest' },
        { key: 'iso_chest', name: 'chest fly / pec deck', sets: 3, repMin: 12, repMax: 15, restSec: 75, increment: 2.5, group: 'chest' },
        { key: 'db_overhead_press', name: 'dumbbell overhead press', sets: 3, repMin: 8, repMax: 12, restSec: 120, increment: 5, group: 'shoulders & triceps' },
        { key: 'lateral_raise', name: 'lateral raise', sets: 3, repMin: 12, repMax: 20, restSec: 60, increment: 2.5, group: 'shoulders & triceps' },
        { key: 'tricep_pushdown', name: 'tricep pushdown', sets: 3, repMin: 10, repMax: 15, restSec: 60, increment: 2.5, group: 'shoulders & triceps' },
        { key: 'overhead_tricep_ext', name: 'overhead tricep extension', sets: 3, repMin: 10, repMax: 15, restSec: 60, increment: 2.5, group: 'shoulders & triceps' },
        { key: 'pullups_or_pulldown', name: 'weighted pull-ups or lat pulldown', sets: 3, repMin: 6, repMax: 10, restSec: 90, bodyweight: true, optional: true, group: 'pull finisher (optional)' },
      ],
    }
    // No revision recorded: the device saved this plan before revisions existed.
    const merged = withPlanDefaults({ ...DEFAULT_PLAN, push: legacyPush })

    it('adopts the shipped order, so the arm circuit really alternates', () => {
      const keys = merged.push.exercises.map((e) => e.key)
      // A raise between the two tricep movements, and a tricep movement between
      // the two arms — the stored day had all three moves in a row instead.
      expect(keys.indexOf('lateral_raise_l')).toBeGreaterThan(keys.indexOf('tricep_pushdown'))
      expect(keys.indexOf('lateral_raise_l')).toBeLessThan(keys.indexOf('overhead_tricep_ext'))
      expect(keys.indexOf('lateral_raise_r')).toBeGreaterThan(keys.indexOf('overhead_tricep_ext'))
    })

    it('replaces the both-arms lateral raise with the left/right pair', () => {
      const keys = merged.push.exercises.map((e) => e.key)
      expect(keys).not.toContain('lateral_raise')
      expect(keys).toContain('lateral_raise_l')
      expect(keys).toContain('lateral_raise_r')
    })

    it('adopts the shipped volume, so core reaches four sets', () => {
      expect(merged.push.exercises.find((e) => e.key === 'cable_crunch')?.sets).toBe(4)
      const raise = merged.push.exercises.find((e) => e.key === 'hanging_leg_raise')
      expect(raise?.sets).toBe(4)
      // Without the new repMax the graduation to full leg raises is unreachable.
      expect(raise?.repMax).toBe(20)
    })

    it('moves overhead press ahead of chest isolation', () => {
      const keys = merged.push.exercises.map((e) => e.key)
      expect(keys.indexOf('db_overhead_press')).toBeLessThan(keys.indexOf('iso_chest'))
    })

    it('drops the retired finisher and refreshes the day label', () => {
      expect(merged.push.exercises.map((e) => e.key)).not.toContain('pullups_or_pulldown')
      expect(merged.push.label).toBe('push + core')
    })

    it('keeps an exercise the user added themselves', () => {
      const withCustom = {
        ...legacyPush,
        exercises: [
          ...legacyPush.exercises,
          { key: 'ex_custom', name: 'face pull', sets: 3, repMin: 12, repMax: 15, restSec: 60, group: 'custom' },
        ],
      }
      const out = withPlanDefaults({ ...DEFAULT_PLAN, push: withCustom })
      expect(out.push.exercises.map((e) => e.key)).toContain('ex_custom')
    })
  })

  it('leaves the defaults themselves intact when nothing is stored', () => {
    const merged = withPlanDefaults(null)
    expect(merged.push.exercises.map((e) => e.key)).toEqual(
      DEFAULT_PLAN.push.exercises.map((e) => e.key),
    )
  })

  describe('slug-as-name repair', () => {
    const custom = (key: string, name: string): PlannedExercise => ({
      key,
      name,
      sets: 3,
      repMin: 12,
      repMax: 20,
      restSec: 60,
      group: 'custom',
    })
    /** The stored plan that results from saving `extra` onto the pull day. */
    const storedWith = (...extra: PlannedExercise[]) => ({
      ...DEFAULT_PLAN,
      pull: { ...DEFAULT_PLAN.pull, exercises: [...DEFAULT_PLAN.pull.exercises, ...extra] },
    })
    const nameOf = (plan: Plan, key: string) => plan.pull.exercises.find((e) => e.key === key)?.name

    it('spaces out a stored name that is really just the key', () => {
      // What the assistant saves when it's asked to add a lift by key alone.
      const out = withPlanDefaults(storedWith(custom('lateral_raise', 'lateral_raise')), PLAN_REVISION)
      expect(nameOf(out, 'lateral_raise')).toBe('lateral raise')
    })

    it('fills a blank stored name from the key', () => {
      const out = withPlanDefaults(storedWith(custom('cable_crossover', '  ')), PLAN_REVISION)
      expect(nameOf(out, 'cable_crossover')).toBe('cable crossover')
    })

    it('leaves a name the user chose alone', () => {
      const out = withPlanDefaults(storedWith(custom('ex_custom', 'my funny raise')), PLAN_REVISION)
      expect(nameOf(out, 'ex_custom')).toBe('my funny raise')
      // A one-word key that matches its name has nothing to repair.
      const single = withPlanDefaults(storedWith(custom('shrugs', 'shrugs')), PLAN_REVISION)
      expect(nameOf(single, 'shrugs')).toBe('shrugs')
    })
  })
})

describe('withCircuitRest', () => {
  const day = DEFAULT_PLAN.push
  const station = (d: DayPlan, key: string) => d.exercises.find((e) => e.key === key)

  it('sets one station rest and leaves the rest of the day alone', () => {
    const next = withCircuitRest(day, 'lateral_raise_l', 90)
    expect(station(next, 'lateral_raise_l')?.circuitRestSec).toBe(90)
    expect(next.exercises.map((e) => e.key)).toEqual(day.exercises.map((e) => e.key))
    for (const e of next.exercises) {
      if (e.key !== 'lateral_raise_l') {
        expect(e.circuitRestSec).toBe(station(day, e.key)?.circuitRestSec)
      }
    }
  })

  it('keeps a zero, which is the whole point of the field', () => {
    // "no rest after this move" has to survive as a real setting rather than
    // reading as unset and falling back to the built-in station change.
    expect(station(withCircuitRest(day, 'tricep_pushdown', 0), 'tricep_pushdown')?.circuitRestSec).toBe(0)
  })

  it('clears the field rather than storing a number for the default', () => {
    const set = withCircuitRest(day, 'tricep_pushdown', 0)
    const cleared = withCircuitRest(set, 'tricep_pushdown', null)
    expect(station(cleared, 'tricep_pushdown')).not.toHaveProperty('circuitRestSec')
  })

  it('rests only after the stations asked for, across a whole circuit', () => {
    // The reported case: rest after each lateral raise, roll straight on from the
    // two tricep stations.
    const wanted: Record<string, number> = {
      tricep_pushdown: 0,
      lateral_raise_l: 60,
      overhead_tricep_ext: 0,
      lateral_raise_r: 60,
    }
    const next = Object.entries(wanted).reduce((d, [key, sec]) => withCircuitRest(d, key, sec), day)
    for (const [key, sec] of Object.entries(wanted)) {
      expect(station(next, key)?.circuitRestSec).toBe(sec)
    }
  })

  it('leaves the day untouched when no exercise matches', () => {
    expect(withCircuitRest(day, 'not_an_exercise', 30)).toEqual(day)
  })

  it('does not mutate the day it was given', () => {
    const before = station(day, 'lateral_raise_l')?.circuitRestSec
    withCircuitRest(day, 'lateral_raise_l', 45)
    expect(station(day, 'lateral_raise_l')?.circuitRestSec).toBe(before)
  })
})

describe('the arm circuit as it ships', () => {
  /** The circuit's stations in the order a session led by the left arm rotates them. */
  const stations = sideOrderedExercises(variantExercises(DEFAULT_PLAN.push, 'A'), 'left').filter(
    (e) => e.circuit === 'arms',
  )

  /** Every hop inside the circuit — station change and new round alike — and its rest. */
  const hops = (() => {
    const order = buildSetOrder(
      stations,
      stations.map((e) => e.sets),
    )
    return order.slice(0, -1).map((step, i) => {
      const next = order[i + 1]
      const from = stations[step.exIndex]
      const to = stations[next.exIndex]
      return {
        from: from.key,
        sec: restBeforeNextSet({
          currentRestSec: from.restSec,
          sameExercise: to.key === from.key,
          nextRestSec: to.restSec,
          sameCircuit: true,
          newCircuitRound: next.setIndex > step.setIndex,
          circuitRestSec: from.circuitRestSec,
        }),
      }
    })
  })()

  it('breaks after a lateral raise and nowhere else', () => {
    for (const { from, sec } of hops) {
      if (from.startsWith('lateral_raise')) expect(sec).toBeGreaterThan(0)
      else expect(sec).toBe(0)
    }
  })

  it('rests the same after either arm, station change or new round', () => {
    const raises = hops.filter((h) => h.from.startsWith('lateral_raise'))
    // Both arms and both kinds of hop, or the assertion above proves little.
    expect(new Set(raises.map((h) => h.from)).size).toBe(2)
    expect(raises.length).toBeGreaterThan(2)
    expect(new Set(raises.map((h) => h.sec))).toEqual(new Set([60]))
  })
})

describe('the two-dumbbell movements as they ship', () => {
  const paired = DAY_TYPES.flatMap((t) =>
    DEFAULT_PLAN[t].exercises.filter((e) => e.dumbbellPair).map((e) => ({ day: t, ex: e })),
  )

  it('steps every one of them in 10s, on every day it appears', () => {
    // A pair only changes 10 lbs at a time: the rack moves in 5s and both hands
    // change together, so 5 is a step that doesn't exist.
    expect(paired.length).toBeGreaterThan(0)
    for (const { day, ex } of paired) {
      expect(ex.increment, `${ex.key} on ${day}`).toBe(10)
    }
  })

  it('covers the curls and the overhead press', () => {
    expect(new Set(paired.map((p) => p.ex.key))).toEqual(
      new Set(['hammer_curl', 'incline_db_curl', 'db_overhead_press']),
    )
  })

  it('leaves the one-dumbbell lateral raise on its own smaller step', () => {
    const raise = DEFAULT_PLAN.push.exercises.find((e) => e.key === 'lateral_raise_l')
    expect(raise?.dumbbellPair).toBeUndefined()
    expect(raise?.increment).toBe(2.5)
  })
})

describe('exerciseName', () => {
  it('names a planned exercise', () => {
    expect(exerciseName('lateral_raise_l')).toBe('lateral raise (left)')
  })

  it('still names a retired exercise whose history remains', () => {
    // The both-arms raise, retired when it split into a left and a right station.
    expect(exerciseName('lateral_raise')).toBe('lateral raise')
    expect(exerciseName('pullups_or_pulldown')).toBe('weighted pull-ups or lat pulldown')
  })

  it('never shows an unknown key with its underscores', () => {
    expect(exerciseName('face_pull')).toBe('face pull')
    expect(exerciseName('side-bend')).toBe('side bend')
  })
})

describe('unslugKey', () => {
  it('spaces a key back out into words', () => {
    expect(unslugKey('lateral_raise')).toBe('lateral raise')
    expect(unslugKey('overhead-tricep__ext')).toBe('overhead tricep ext')
    expect(unslugKey('_squat_')).toBe('squat')
  })
})
