import { describe, it, expect } from 'vitest'
import { DEFAULT_PLAN, withPlanDefaults, type Plan } from './plan'

describe('withPlanDefaults', () => {
  it('adds a missing day type from the defaults', () => {
    const stored = { push: DEFAULT_PLAN.push, pull: DEFAULT_PLAN.pull } as Partial<Plan>
    const merged = withPlanDefaults(stored)
    expect(merged.abs).toBeDefined()
    expect(merged.abs.exercises.length).toBeGreaterThan(0)
  })

  it('merges newly shipped exercises into a stored day near their neighbour', () => {
    // A stored push day from before Lateral Raise shipped, with a user edit.
    const storedPush = {
      ...DEFAULT_PLAN.push,
      exercises: DEFAULT_PLAN.push.exercises
        .filter((e) => e.key !== 'lateral_raise')
        .map((e) => (e.key === 'flat_bench' ? { ...e, sets: 5 } : e)),
    }
    const merged = withPlanDefaults({ ...DEFAULT_PLAN, push: storedPush })
    const keys = merged.push.exercises.map((e) => e.key)
    expect(keys).toContain('lateral_raise')
    // Inserted right after its default predecessor (db_overhead_press).
    expect(keys.indexOf('lateral_raise')).toBe(keys.indexOf('db_overhead_press') + 1)
  })

  it('never clobbers a user-customized exercise', () => {
    const storedPush = {
      ...DEFAULT_PLAN.push,
      exercises: DEFAULT_PLAN.push.exercises.map((e) =>
        e.key === 'flat_bench' ? { ...e, sets: 5, restSec: 200 } : e,
      ),
    }
    const merged = withPlanDefaults({ ...DEFAULT_PLAN, push: storedPush })
    const flat = merged.push.exercises.find((e) => e.key === 'flat_bench')
    expect(flat?.sets).toBe(5)
    expect(flat?.restSec).toBe(200)
  })

  it('leaves the defaults themselves intact when nothing is stored', () => {
    const merged = withPlanDefaults(null)
    expect(merged.push.exercises.map((e) => e.key)).toEqual(
      DEFAULT_PLAN.push.exercises.map((e) => e.key),
    )
  })
})
