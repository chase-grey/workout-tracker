import { describe, it, expect } from 'vitest'
import { DAY_TYPES, DEFAULT_PLAN, PLAN_REVISION, withPlanDefaults, withRemovedFrom } from './plan'
import { STARTER_EXERCISE_NAMES, starterPlan } from './planTemplates'
import type { StrengthSetup } from '../lib/profile'

const FORBIDDEN = [
  'weightCapLbs',
  'stackSetting',
  'byVariant',
  'shortSets',
  'circuit',
  'sharedLoad',
  'roundScreen',
  'repLadder',
  'side',
  'circuitRestSec',
  'circuitRoundRestSec',
] as const

const SETUPS: StrengthSetup[] = []
for (const daysPerWeek of [2, 3] as const) {
  for (const equipment of ['gym', 'dumbbells', 'bodyweight'] as const) {
    SETUPS.push({ daysPerWeek, equipment })
  }
}

describe.each(SETUPS)('starterPlan %o', (setup) => {
  const plan = starterPlan(setup)

  it('has all three slots, each custom and required, in order', () => {
    expect(Object.keys(plan).sort()).toEqual([...DAY_TYPES].sort())
    DAY_TYPES.forEach((type, i) => {
      expect(plan[type].type).toBe(type)
      expect(plan[type].custom).toBe(true)
      expect(plan[type].required).toBe(true)
      expect(plan[type].order).toBe(i)
    })
  })

  it('labels the days full body a/b(/c), leaving the third empty on a two-day week', () => {
    expect(plan.push.label).toBe('full body a')
    expect(plan.pull.label).toBe('full body b')
    if (setup.daysPerWeek === 2) {
      expect(plan.fullbody.label).toBe('full body')
      expect(plan.fullbody.exercises).toEqual([])
    } else {
      expect(plan.fullbody.label).toBe('full body c')
      expect(plan.fullbody.exercises.length).toBeGreaterThan(0)
    }
  })

  it('has well-formed exercises with unique keys', () => {
    for (const type of DAY_TYPES) {
      const { exercises } = plan[type]
      if (exercises.length) expect(exercises.length).toBeGreaterThanOrEqual(5)
      expect(exercises.length).toBeLessThanOrEqual(6)
      expect(new Set(exercises.map((e) => e.key)).size).toBe(exercises.length)
      for (const e of exercises) {
        expect(e.sets).toBeGreaterThan(0)
        expect(e.repMin).toBeGreaterThan(0)
        expect(e.repMin).toBeLessThanOrEqual(e.repMax)
        expect(e.restSec).toBeGreaterThan(0)
        expect(e.name).toBe(e.name.toLowerCase())
        for (const f of FORBIDDEN) expect(e).not.toHaveProperty(f)
      }
    }
  })

  it('names every key it introduces', () => {
    const shipped = new Set(
      DAY_TYPES.flatMap((t) => DEFAULT_PLAN[t].exercises.map((e) => e.key)),
    )
    for (const type of DAY_TYPES) {
      for (const e of plan[type].exercises) {
        if (!shipped.has(e.key) && !(e.key in STARTER_EXERCISE_NAMES)) {
          // a retired shipped key (calf_raise, deadbug, cable_pulldown, ...) is fine
          expect(['calf_raise', 'deadbug', 'cable_pulldown', 'barbell_squat']).toContain(e.key)
        }
      }
    }
  })

  it('survives withPlanDefaults untouched, at any revision', () => {
    expect(withPlanDefaults(plan, 0)).toEqual(plan)
    expect(withPlanDefaults(plan, PLAN_REVISION)).toEqual(plan)
    expect(withPlanDefaults(plan)).toEqual(plan)
    expect(withPlanDefaults(withRemovedFrom(plan, plan), 0)).toEqual(plan)
  })
})

describe('starterPlan covers the body', () => {
  it('trains a push, a pull, legs and core on every non-empty day', () => {
    for (const setup of SETUPS) {
      const plan = starterPlan(setup)
      for (const type of DAY_TYPES) {
        const groups = plan[type].exercises.map((e) => e.group)
        if (!groups.length) continue
        expect(groups).toContain('legs')
        expect(groups).toContain('back')
        expect(groups.some((g) => /chest|shoulders|triceps/.test(g))).toBe(true)
        expect(groups.some((g) => /^(abs|core hold)$/.test(g))).toBe(true)
      }
    }
  })
})

describe('a stored day that is not custom', () => {
  it('still gains the shipped defaults it lacks', () => {
    const stored = {
      ...DEFAULT_PLAN,
      push: { ...DEFAULT_PLAN.push, exercises: DEFAULT_PLAN.push.exercises.slice(0, 1) },
    }
    const out = withPlanDefaults(stored, PLAN_REVISION)
    expect(out.push.exercises.map((e) => e.key)).toEqual(
      DEFAULT_PLAN.push.exercises.map((e) => e.key),
    )
    expect(out.push.custom).toBeUndefined()
  })
})
