import { describe, it, expect } from 'vitest'
import { DEFAULT_PLAN, variantExercises } from './plan'

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
  it('runs overhead press before chest isolation', () => {
    const keys = variantExercises(DEFAULT_PLAN.push, 'A').map((e) => e.key)
    expect(keys.indexOf('db_overhead_press')).toBeLessThan(keys.indexOf('iso_chest'))
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
    expect(sets('A', 'hanging_leg_raise')).toBe(4)
  })

  it('offers no added weight on the hanging raise', () => {
    const raise = DEFAULT_PLAN.push.exercises.find((e) => e.key === 'hanging_leg_raise')
    expect(raise?.repsOnly).toBe(true)
  })

  it('no longer carries the lat-pulldown finisher', () => {
    expect(DEFAULT_PLAN.push.exercises.map((e) => e.key)).not.toContain('pullups_or_pulldown')
  })
})

describe('the pull + legs day', () => {
  it('runs the hanging raise straight off the pull-up bar, still after the leg press', () => {
    const keys = DEFAULT_PLAN.pull.exercises.map((e) => e.key)
    expect(keys.indexOf('hanging_leg_raise')).toBe(keys.indexOf('weighted_pullups') + 1)
    expect(keys.indexOf('leg_press')).toBeLessThan(keys.indexOf('hanging_leg_raise'))
  })

  it('does less core than a push day, keeping weekly volume in range', () => {
    const pull = DEFAULT_PLAN.pull.exercises.find((e) => e.key === 'hanging_leg_raise')
    expect(pull?.sets).toBe(3)
    expect(pull!.sets).toBeLessThan(sets('A', 'hanging_leg_raise')!)
  })

  it('trains calves directly, since pressing never takes them through range', () => {
    expect(DEFAULT_PLAN.pull.exercises.map((e) => e.key)).toContain('calf_raise')
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
    expect(keys[2]).toBe('db_overhead_press')
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
