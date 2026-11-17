import { describe, it, expect } from 'vitest'
import { DAY_TYPES, DEFAULT_PLAN, PLAN_REVISION, withPlanDefaults, withRemovedFrom } from './plan'
import { DEFAULT_STRENGTH, STARTER_EXERCISE_NAMES, planFor, rebuildPlan, starterPlan } from './planTemplates'
import { buildPlan } from '../lib/planBuilder'
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
for (const daysPerWeek of [2, 3, 4, 5, 6] as const) {
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

  it('labels the days full body a/b(/c), leaving the third empty on a two-day week and rotating the three on longer ones', () => {
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

describe('planFor', () => {
  it('keeps a profile from before the plan questions on its starter template', () => {
    for (const setup of SETUPS) expect(planFor(setup)).toEqual(starterPlan(setup))
  })

  it('builds a profile that answered them', () => {
    const setup = { daysPerWeek: 3, equipment: 'gym', focus: ['arms'], minutes: 45 } as const
    expect(planFor({ ...setup, focus: [...setup.focus] })).toEqual(buildPlan({ ...setup, focus: [...setup.focus] }).plan)
    expect(planFor({ daysPerWeek: 2, equipment: 'gym', focus: [] })).toEqual(buildPlan({ daysPerWeek: 2, equipment: 'gym', focus: [] }).plan)
  })
})

describe('rebuildPlan', () => {
  const was = { daysPerWeek: 3, equipment: 'gym', focus: ['chest'], minutes: 60 } as const
  const old = () => planFor({ ...was, focus: [...was.focus] })
  const added = { key: 'face_pull', name: 'face pull', sets: 3, repMin: 12, repMax: 15, restSec: 60, group: 'shoulders' }

  it('replaces what was generated, edits included, with the new answers', () => {
    const current = old()
    current.push.exercises[0] = { ...current.push.exercises[0], sets: 9 }
    const next = { daysPerWeek: 2, equipment: 'dumbbells', focus: ['glutes'], minutes: 45 } as const
    const out = rebuildPlan(current, { ...was, focus: [...was.focus] }, { ...next, focus: [...next.focus] })
    expect(out).toEqual(planFor({ ...next, focus: [...next.focus] }))
  })

  it('appends what was added by hand to the same day', () => {
    const current = old()
    current.pull.exercises.push(added)
    const next = { ...was, focus: ['arms' as const], minutes: 75 as const }
    const out = rebuildPlan(current, { ...was, focus: [...was.focus] }, next)
    const fresh = planFor(next)
    expect(out.pull.exercises).toEqual([...fresh.pull.exercises, added])
    expect(out.push).toEqual(fresh.push)
  })

  it('moves a hand-added movement off a day that is no longer used, and never doubles one', () => {
    const current = old()
    current.fullbody.exercises.push(added)
    current.push.exercises.push({ ...added, key: 'flat_bench_extra' })
    const next = { ...was, daysPerWeek: 2 as const, focus: [...was.focus] }
    const out = rebuildPlan(current, { ...was, focus: [...was.focus] }, next)
    expect(out.fullbody.exercises).toEqual([])
    expect(out.pull.exercises[out.pull.exercises.length - 1]).toEqual(added)
    const again = rebuildPlan(out, next, next)
    expect(again).toEqual(out)
  })

  it('keeps the days where they sit in Today', () => {
    const current = old()
    current.push.order = 2
    current.fullbody.order = 0
    const out = rebuildPlan(current, { ...was, focus: [...was.focus] }, { ...was, focus: [...was.focus] })
    expect(out.push.order).toBe(2)
    expect(out.fullbody.order).toBe(0)
  })

  it('reads a profile with no strength answers as the default starter', () => {
    const current = starterPlan(DEFAULT_STRENGTH)
    current.push.exercises.push(added)
    const next = { ...was, focus: [...was.focus] }
    expect(rebuildPlan(current, undefined, next).push.exercises.at(-1)).toEqual(added)
  })
})

describe('starterPlan for a long lifting week', () => {
  it('writes the same three days for four, five and six days as for three', () => {
    for (const equipment of ['gym', 'dumbbells', 'bodyweight'] as const) {
      const three = starterPlan({ daysPerWeek: 3, equipment })
      for (const daysPerWeek of [4, 5, 6] as const) {
        expect(starterPlan({ daysPerWeek, equipment })).toEqual(three)
      }
    }
  })

  it('builds the same three days for a built plan too, so no volume goes to a day that does not exist', () => {
    const answers = { equipment: 'gym' as const, focus: ['arms' as const], minutes: 45 as const }
    const three = planFor({ daysPerWeek: 3, ...answers })
    for (const daysPerWeek of [4, 5, 6] as const) {
      expect(planFor({ daysPerWeek, ...answers })).toEqual(three)
    }
  })
})
