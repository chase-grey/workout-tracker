import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PLAN,
  FULLBODY_ARMS_ROUND_REST_SEC,
  GRADUATION_SETS,
  NECK_ROUND_REST_SEC,
  STRETCH_CORE,
  repRangeLabel,
  shortExercises,
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

  it('trains back with weighted pull-ups', () => {
    const back = DEFAULT_PLAN.pull.exercises.filter((e) => e.group === 'back')
    expect(back.map((e) => e.key)).toEqual(['weighted_pullups'])
  })

  it('opens with the ab block and trains no other abs', () => {
    const keys = DEFAULT_PLAN.pull.exercises.map((e) => e.key)
    expect(keys.slice(0, 2)).toEqual(['cable_crunch', 'weighted_situp'])
    expect(DEFAULT_PLAN.pull.exercises.filter((e) => e.group === 'abs').map((e) => e.sets)).toEqual([4, 4])
    expect(keys).not.toContain('cable_pulldown')
    expect(keys).not.toContain('hanging_leg_raise')
    expect(DEFAULT_PLAN.pull.exercises.some((e) => e.group === 'core')).toBe(false)
  })

  it('keeps the ab volume on push and stretch', () => {
    expect(sets('A', 'cable_crunch')).toBe(4)
    expect(sets('A', 'weighted_situp')).toBe(4)
    expect(STRETCH_CORE.sets).toBe(4)
  })

  it('runs the neck pair a round at a time with its own rest after the round', () => {
    const neck = DEFAULT_PLAN.pull.exercises.filter((e) => e.circuit === 'neck')
    expect(neck.every((e) => e.roundScreen && e.circuitRoundRestSec === NECK_ROUND_REST_SEC)).toBe(true)
  })

  it('no longer carries the calf raise', () => {
    expect(DEFAULT_PLAN.pull.exercises.map((e) => e.key)).not.toContain('calf_raise')
  })

  it('keeps the full rest on the sets the goals are read from', () => {
    const rest = (key: string) => DEFAULT_PLAN.pull.exercises.find((e) => e.key === key)?.restSec
    expect(rest('leg_press')).toBe(120)
    expect(rest('weighted_pullups')).toBe(120)
  })

  it('shows a capped movement as an open-ended rep range once it is at the cap', () => {
    const calf = { repMin: 20, repMax: 20, weightCapLbs: 100 }
    expect(repRangeLabel(calf, 100)).toBe('20+')
    // Short of the cap there is still weight to earn, so the range still closes;
    // and with no load to read it at, the cap can't be called reached.
    expect(repRangeLabel({ ...calf, repMin: 15 }, 80)).toBe('15–20')
    expect(repRangeLabel({ ...calf, repMin: 15 })).toBe('15–20')
    // A movement that takes no weight is open-ended from the first session.
    expect(repRangeLabel({ repMin: 15, repMax: 15, repLadder: true })).toBe('15+')
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

  it('opens with the same ab block as the other days, and no longer hangs from the bar', () => {
    const keys = DEFAULT_PLAN.fullbody.exercises.map((e) => e.key)
    expect(keys.slice(0, 2)).toEqual(['cable_crunch', 'weighted_situp'])
    expect(keys).not.toContain('hanging_leg_raise')
    expect(keys.filter((k) => k === 'cable_crunch')).toHaveLength(1)
  })

  it('no longer trains the raise anywhere, so graduation reads history only', () => {
    for (const day of Object.values(DEFAULT_PLAN)) {
      expect(day.exercises.map((e) => e.key)).not.toContain('hanging_leg_raise')
    }
    expect(GRADUATION_SETS).toBe(3)
  })

  it('lands in the same ballpark of sets as a push day', () => {
    const full = DEFAULT_PLAN.fullbody.exercises.reduce((s, e) => s + e.sets, 0)
    const push = variantExercises(DEFAULT_PLAN.push, 'A').reduce((s, e) => s + e.sets, 0)
    expect(full).toBeGreaterThan(15)
    expect(full).toBeLessThanOrEqual(push)
  })

  it('rests its compounds two minutes', () => {
    for (const key of ['leg_press', 'flat_bench', 'weighted_pullups']) {
      expect(DEFAULT_PLAN.fullbody.exercises.find((e) => e.key === key)?.restSec).toBe(120)
    }
  })

  it('pairs the curl and the extension a round at a time', () => {
    const arms = DEFAULT_PLAN.fullbody.exercises.filter((e) => e.circuit === 'arms')
    expect(arms.map((e) => e.key)).toEqual(['hammer_curl', 'overhead_tricep_ext'])
    expect(arms.every((e) => e.roundScreen && e.circuitRoundRestSec === FULLBODY_ARMS_ROUND_REST_SEC)).toBe(true)
  })
})

describe('the short forms', () => {
  const total = (list: { sets: number }[]) => list.reduce((s, e) => s + e.sets, 0)
  const short = (type: 'push' | 'pull' | 'fullbody', variant: 'A' | 'B' | null = null) =>
    shortExercises(variantExercises(DEFAULT_PLAN[type], variant), 'short')

  it('cut every day, with the ab block the eight sets the short days have in common', () => {
    expect(total(short('push', 'A'))).toBe(25)
    expect(total(short('push', 'B'))).toBe(25)
    expect(total(short('pull'))).toBe(25)
    expect(total(short('fullbody'))).toBe(25)
    expect(total(variantExercises(DEFAULT_PLAN.push, 'A'))).toBe(30)
    expect(total(DEFAULT_PLAN.pull.exercises)).toBe(43)
    expect(total(DEFAULT_PLAN.fullbody.exercises)).toBe(28)
  })

  it('train the pull-ups and the leg press at four sets on every day, short or full', () => {
    for (const type of ['pull', 'fullbody'] as const) {
      for (const key of ['weighted_pullups', 'leg_press']) {
        expect(short(type).find((e) => e.key === key)?.sets).toBe(4)
        expect(DEFAULT_PLAN[type].exercises.find((e) => e.key === key)?.sets).toBe(4)
      }
    }
  })

  it('keep the lead press whole and cut the second to two, whichever press leads', () => {
    const a = short('push', 'A')
    const b = short('push', 'B')
    expect(a.map((e) => [e.key, e.sets]).slice(2, 4)).toEqual([['incline_bench', 4], ['flat_bench', 2]])
    expect(b.map((e) => [e.key, e.sets]).slice(2, 4)).toEqual([['flat_bench', 4], ['incline_bench', 2]])
  })

  it('open every day with the whole ab block, four sets each, short or full', () => {
    for (const type of ['push', 'pull', 'fullbody'] as const) {
      const variant = type === 'push' ? 'A' : null
      const head = (list: { key: string; sets: number }[]) => list.slice(0, 2).map((e) => [e.key, e.sets])
      expect(head(short(type, variant))).toEqual([['cable_crunch', 4], ['weighted_situp', 4]])
      expect(head(variantExercises(DEFAULT_PLAN[type], variant))).toEqual([['cable_crunch', 4], ['weighted_situp', 4]])
    }
  })

  it('leave the hip circuits and the hammer curl to the full pull day', () => {
    const keys = short('pull').map((e) => e.key)
    for (const key of ['copenhagen_plank_l', 'copenhagen_plank_r', 'sideways_leg_raise_l', 'sideways_leg_raise_r', 'hammer_curl']) {
      expect(keys).not.toContain(key)
      expect(DEFAULT_PLAN.pull.exercises.map((e) => e.key)).toContain(key)
    }
  })

  it('train the three goal lifts twice a week between them', () => {
    const count = (key: string) =>
      ['push', 'pull', 'fullbody'].filter((t) => short(t as 'push' | 'pull' | 'fullbody', t === 'push' ? 'A' : null).some((e) => e.key === key)).length
    expect(count('flat_bench')).toBe(2)
    expect(count('weighted_pullups')).toBe(2)
    expect(count('leg_press')).toBe(2)
  })

  it('never run a station past the full count, and leave an unmarked movement alone', () => {
    const list = [
      { key: 'a', name: 'a', sets: 2, shortSets: 3, repMin: 8, repMax: 12, restSec: 60, group: 'g' },
      { key: 'b', name: 'b', sets: 3, repMin: 8, repMax: 12, restSec: 60, group: 'g' },
      { key: 'c', name: 'c', sets: 3, shortSets: 0, repMin: 8, repMax: 12, restSec: 60, group: 'g' },
    ]
    expect(shortExercises(list, 'short').map((e) => [e.key, e.sets])).toEqual([['a', 2], ['b', 3]])
    expect(shortExercises(list, 'full')).toBe(list)
    expect(shortExercises(list, undefined)).toBe(list)
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
