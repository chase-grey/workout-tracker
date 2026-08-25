import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PLAN,
  GRADUATION_SETS,
  STRETCH_CORE,
  repRangeLabel,
  variantExercises,
} from './plan'

/** Set count for one exercise in one variant of the push day. */
function sets(variant: 'A' | 'B', key: string): number | undefined {
  return variantExercises(DEFAULT_PLAN.push, variant).find((e) => e.key === key)?.sets
}

/** Position of one exercise in one variant of the push day. */
function position(variant: 'A' | 'B', key: string): number {
  return variantExercises(DEFAULT_PLAN.push, variant).findIndex((e) => e.key === key)
}

describe('variantExercises', () => {
  it('leaves a day alone when it has no variant', () => {
    expect(variantExercises(DEFAULT_PLAN.pull, null)).toBe(DEFAULT_PLAN.pull.exercises)
  })

  it('makes incline the primary press on A', () => {
    expect(sets('A', 'incline_bench')).toBe(4)
    expect(sets('A', 'flat_bench')).toBe(3)
    expect(position('A', 'incline_bench')).toBeLessThan(position('A', 'flat_bench'))
  })

  it('makes flat the primary press on B', () => {
    expect(sets('B', 'flat_bench')).toBe(4)
    expect(sets('B', 'incline_bench')).toBe(3)
    expect(position('B', 'flat_bench')).toBeLessThan(position('B', 'incline_bench'))
  })

  it('keeps both variants the same length and membership', () => {
    const a = variantExercises(DEFAULT_PLAN.push, 'A').map((e) => e.key)
    const b = variantExercises(DEFAULT_PLAN.push, 'B').map((e) => e.key)
    expect([...a].sort()).toEqual([...b].sort())
  })

  it('leaves exercises without an override in their original order', () => {
    for (const variant of ['A', 'B'] as const) {
      const keys = variantExercises(DEFAULT_PLAN.push, variant).map((e) => e.key)
      // Core still opens the day and the arm circuit still closes it.
      expect(keys[0]).toBe('cable_crunch')
      expect(keys[keys.length - 1]).toBe('lateral_raise_r')
    }
  })

  it('does not mutate the stored plan', () => {
    const before = DEFAULT_PLAN.push.exercises.map((e) => e.sets)
    variantExercises(DEFAULT_PLAN.push, 'B')
    expect(DEFAULT_PLAN.push.exercises.map((e) => e.sets)).toEqual(before)
  })

  it('gives each variant the same total set count', () => {
    const total = (v: 'A' | 'B') =>
      variantExercises(DEFAULT_PLAN.push, v).reduce((s, e) => s + e.sets, 0)
    expect(total('A')).toBe(total('B'))
  })
})

describe('the push + core day', () => {
  it('trains no chest isolation — the presses carry the chest', () => {
    for (const v of ['A', 'B'] as const) {
      expect(variantExercises(DEFAULT_PLAN.push, v).map((e) => e.key)).not.toContain('iso_chest')
    }
  })

  it('presses overhead on the machine, not the dumbbells', () => {
    const keys = DEFAULT_PLAN.push.exercises.map((e) => e.key)
    expect(keys).toContain('machine_overhead_press')
    expect(keys).not.toContain('db_overhead_press')
    // A stack steps in 5s where a pair of dumbbells can only move 10 — the point
    // of the switch, so a 10 here would be a regression.
    const press = DEFAULT_PLAN.push.exercises.find((e) => e.key === 'machine_overhead_press')
    expect(press?.increment).toBe(5)
    expect(press?.dumbbellPair).toBeUndefined()
  })

  it('never puts the two tricep movements next to each other', () => {
    const keys = variantExercises(DEFAULT_PLAN.push, 'A').map((e) => e.key)
    const gap = Math.abs(keys.indexOf('tricep_pushdown') - keys.indexOf('overhead_tricep_ext'))
    expect(gap).toBeGreaterThan(1)
  })

  it('puts the arm work in one circuit, alternating delt and tricep stations', () => {
    const circuit = DEFAULT_PLAN.push.exercises.filter((e) => e.circuit === 'arms').map((e) => e.key)
    expect(circuit).toEqual([
      'tricep_pushdown',
      'lateral_raise_l',
      'overhead_tricep_ext',
      'lateral_raise_r',
    ])
  })

  it('does four sets of each core movement', () => {
    expect(sets('A', 'cable_crunch')).toBe(4)
    expect(sets('A', 'weighted_situp')).toBe(4)
  })

  it('loads both ab movements, and no longer hangs from the bar', () => {
    const keys = DEFAULT_PLAN.push.exercises.map((e) => e.key)
    expect(keys).toContain('weighted_situp')
    expect(keys).not.toContain('hanging_leg_raise')
    // The reason for the swap: an ab movement you can add weight to has somewhere
    // to progress once the reps are there.
    const abs = DEFAULT_PLAN.push.exercises.filter((e) => e.group === 'abs')
    expect(abs.every((e) => e.increment != null && !e.repsOnly)).toBe(true)
  })

  it('no longer carries the lat-pulldown finisher', () => {
    expect(DEFAULT_PLAN.push.exercises.map((e) => e.key)).not.toContain('pullups_or_pulldown')
  })
})

describe('the pull + legs day', () => {
  it('no longer carries the hip machines or the row', () => {
    const keys = DEFAULT_PLAN.pull.exercises.map((e) => e.key)
    expect(keys).not.toContain('leg_adductor')
    expect(keys).not.toContain('leg_abductor')
    expect(keys).not.toContain('cable_row')
  })

  it('still trains back, on the movement worth the day pulling volume', () => {
    const back = DEFAULT_PLAN.pull.exercises.filter((e) => e.group === 'back')
    expect(back.map((e) => e.key)).toEqual(['weighted_pullups'])
  })

  it('trains no abs at all, on what is already the longest day', () => {
    const keys = DEFAULT_PLAN.pull.exercises.map((e) => e.key)
    expect(keys).not.toContain('weighted_situp')
    expect(keys).not.toContain('cable_crunch')
    expect(keys).not.toContain('hanging_leg_raise')
    expect(DEFAULT_PLAN.pull.exercises.some((e) => e.group === 'core')).toBe(false)
  })

  it('gives up no weekly ab volume by dropping them, since push and stretch carry it', () => {
    // The sets that left this day were the ones done last; the ones that remain are
    // done first on push and on their own after a stretch.
    expect(sets('A', 'cable_crunch')).toBe(4)
    expect(sets('A', 'weighted_situp')).toBe(4)
    expect(STRETCH_CORE.sets).toBe(4)
  })

  it('trains calves directly, since pressing never takes them through range', () => {
    expect(DEFAULT_PLAN.pull.exercises.map((e) => e.key)).toContain('calf_raise')
  })

  it('caps the calf raise at the stack, so it climbs in reps from there', () => {
    const calf = DEFAULT_PLAN.pull.exercises.find((e) => e.key === 'calf_raise')
    expect(calf?.weightCapLbs).toBe(100)
    // The reps already owned at the cap are the floor the ladder starts from — a
    // range topping out below them would ask for a step backwards.
    expect(calf?.repMin).toBe(20)
    expect(calf?.repMax).toBe(20)
  })

  it('shows the capped movement as an open-ended rep range', () => {
    const calf = DEFAULT_PLAN.pull.exercises.find((e) => e.key === 'calf_raise')!
    expect(repRangeLabel(calf)).toBe('20+')
  })

  it('pairs the two neck directions as a circuit', () => {
    const neck = DEFAULT_PLAN.pull.exercises.filter((e) => e.circuit === 'neck')
    expect(neck.map((e) => e.key)).toEqual(['neck_extension', 'neck_flexion'])
    // Light and high-rep by design — the neck is the one place a heavy grind is a
    // bad bet, so a low rep floor here would be a regression.
    expect(neck.every((e) => e.repMin >= 12)).toBe(true)
  })
})

describe('the full body day', () => {
  it('covers legs, press, pull and overhead press', () => {
    const keys = DEFAULT_PLAN.fullbody.exercises.map((e) => e.key)
    for (const key of ['leg_press', 'flat_bench', 'weighted_pullups', 'db_overhead_press']) {
      expect(keys).toContain(key)
    }
  })

  it('includes core work', () => {
    const groups = DEFAULT_PLAN.fullbody.exercises.map((e) => e.group)
    expect(groups).toContain('core')
  })

  it('prescribes the sets the graduation standard is judged against', () => {
    // The only day that still trains the raise, so if these two ever drift apart
    // the switch to full leg raises stops being earnable at all.
    const raise = DEFAULT_PLAN.fullbody.exercises.find((e) => e.key === 'hanging_leg_raise')
    expect(raise?.sets).toBe(GRADUATION_SETS)
  })

  it('offers no added weight on the hanging raise', () => {
    const raise = DEFAULT_PLAN.fullbody.exercises.find((e) => e.key === 'hanging_leg_raise')
    expect(raise?.repsOnly).toBe(true)
  })

  it('lands in the same ballpark of sets as a push day', () => {
    const full = DEFAULT_PLAN.fullbody.exercises.reduce((s, e) => s + e.sets, 0)
    const push = variantExercises(DEFAULT_PLAN.push, 'A').reduce((s, e) => s + e.sets, 0)
    expect(full).toBeGreaterThan(15)
    expect(full).toBeLessThanOrEqual(push)
  })
})

describe('the A/B swap', () => {
  it('is position-independent, so reordering the day cannot misplace it', () => {
    // A user who drags the core work to the end of the day still gets a clean
    // swap of the two presses — an absolute sort index would have spliced an
    // unrelated exercise between them.
    const reordered = {
      ...DEFAULT_PLAN.push,
      exercises: [
        ...DEFAULT_PLAN.push.exercises.filter((e) => e.group !== 'abs'),
        ...DEFAULT_PLAN.push.exercises.filter((e) => e.group === 'abs'),
      ],
    }
    const keys = variantExercises(reordered, 'B').map((e) => e.key)
    expect(keys[0]).toBe('flat_bench')
    expect(keys[1]).toBe('incline_bench')
    expect(keys[2]).toBe('machine_overhead_press')
  })

  it('skips the swap when the partner has been removed', () => {
    const withoutIncline = {
      ...DEFAULT_PLAN.push,
      exercises: DEFAULT_PLAN.push.exercises.filter((e) => e.key !== 'incline_bench'),
    }
    const out = variantExercises(withoutIncline, 'B')
    expect(out.map((e) => e.key)).not.toContain('incline_bench')
    // The set-count override still applies even with nothing to trade places with.
    expect(out.find((e) => e.key === 'flat_bench')?.sets).toBe(4)
  })
})
