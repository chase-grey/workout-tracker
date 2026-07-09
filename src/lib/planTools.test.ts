import { describe, it, expect } from 'vitest'
import { DEFAULT_PLAN } from '../config/plan'
import type { Plan } from '../config/plan'
import { applyPlanEdits, PLAN_EDIT_OPS } from './planTools'

describe('applyPlanEdits', () => {
  it('setExercise changes a field', () => {
    const { plan, applied, errors } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'setExercise', day: 'push', key: 'flat_bench', fields: { sets: 5, restSec: 150 } },
    ])
    const ex = plan.push.exercises.find((e) => e.key === 'flat_bench')
    expect(ex?.sets).toBe(5)
    expect(ex?.restSec).toBe(150)
    expect(applied).toHaveLength(1)
    expect(errors).toHaveLength(0)
  })

  it('setExercise ignores invalid numeric fields', () => {
    const { plan } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'setExercise', day: 'push', key: 'flat_bench', fields: { sets: -2, repMin: NaN } },
    ])
    const ex = plan.push.exercises.find((e) => e.key === 'flat_bench')
    expect(ex?.sets).toBe(3)
    expect(ex?.repMin).toBe(8)
  })

  it('setExercise on a missing key records an error', () => {
    const { applied, errors } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'setExercise', day: 'push', key: 'nope', fields: { sets: 4 } },
    ])
    expect(applied).toHaveLength(0)
    expect(errors).toHaveLength(1)
  })

  it('addExercise creates a slugged key', () => {
    const { plan, applied } = applyPlanEdits(DEFAULT_PLAN, [
      {
        op: 'addExercise',
        day: 'push',
        exercise: { name: 'Cable Fly!!', sets: 3, repMin: 10, repMax: 12, restSec: 60, group: 'Chest' },
      },
    ])
    const added = plan.push.exercises.find((e) => e.name === 'Cable Fly!!')
    expect(added?.key).toBe('cable_fly')
    expect(applied[0]).toContain('Added Cable Fly!! to push')
  })

  it('addExercise handles key collision by suffixing', () => {
    const { plan } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'addExercise', day: 'push', exercise: { name: 'Flat Bench', key: 'flat_bench', sets: 3, repMin: 8, repMax: 10, restSec: 120, group: 'Chest' } },
      { op: 'addExercise', day: 'push', exercise: { name: 'Flat Bench', key: 'flat_bench', sets: 3, repMin: 8, repMax: 10, restSec: 120, group: 'Chest' } },
    ])
    const keys = plan.push.exercises.map((e) => e.key)
    expect(keys).toContain('flat_bench_2')
    expect(keys).toContain('flat_bench_3')
  })

  it('addExercise fills sensible defaults when fields are missing', () => {
    const { plan } = applyPlanEdits(DEFAULT_PLAN, [
      // Intentionally omit fields the defaults should cover.
      { op: 'addExercise', day: 'pull', exercise: { name: 'Face Pull' } as never },
    ])
    const added = plan.pull.exercises.find((e) => e.name === 'Face Pull')
    expect(added).toBeDefined()
    expect(added?.sets).toBe(3)
    expect(added?.repMin).toBe(8)
    expect(added?.repMax).toBe(12)
    expect(added?.restSec).toBe(90)
    expect(added?.group).toBe('Custom')
  })

  it('removeExercise removes by key', () => {
    const { plan, applied, errors } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'removeExercise', day: 'pull', key: 'hammer_curl' },
    ])
    expect(plan.pull.exercises.some((e) => e.key === 'hammer_curl')).toBe(false)
    expect(applied[0]).toBe('Removed hammer_curl from pull')
    expect(errors).toHaveLength(0)
  })

  it('removeExercise on a missing key records an error', () => {
    const { errors } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'removeExercise', day: 'pull', key: 'nope' },
    ])
    expect(errors).toHaveLength(1)
  })

  it('setDayLabel updates the label', () => {
    const { plan, applied } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'setDayLabel', day: 'push', label: 'Heavy Push' },
    ])
    expect(plan.push.label).toBe('Heavy Push')
    expect(applied[0]).toContain('Heavy Push')
  })

  it('invalid day records an error and leaves the plan unchanged for that edit', () => {
    const badDay = 'legs' as unknown as 'push'
    const { plan, applied, errors } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'setDayLabel', day: badDay, label: 'X' },
    ])
    expect(errors).toHaveLength(1)
    expect(applied).toHaveLength(0)
    expect(plan.push.label).toBe(DEFAULT_PLAN.push.label)
    expect(plan.pull.label).toBe(DEFAULT_PLAN.pull.label)
  })

  it('does not mutate the input plan', () => {
    const beforeSets = DEFAULT_PLAN.push.exercises.find((e) => e.key === 'flat_bench')?.sets
    const beforeCount = DEFAULT_PLAN.push.exercises.length
    const beforeLabel = DEFAULT_PLAN.push.label

    applyPlanEdits(DEFAULT_PLAN, [
      { op: 'setExercise', day: 'push', key: 'flat_bench', fields: { sets: 99 } },
      { op: 'addExercise', day: 'push', exercise: { name: 'New Move' } as never },
      { op: 'setDayLabel', day: 'push', label: 'Changed' },
    ])

    expect(DEFAULT_PLAN.push.exercises.find((e) => e.key === 'flat_bench')?.sets).toBe(beforeSets)
    expect(DEFAULT_PLAN.push.exercises.length).toBe(beforeCount)
    expect(DEFAULT_PLAN.push.label).toBe(beforeLabel)
  })

  it('exposes the valid ops for prompting', () => {
    expect(PLAN_EDIT_OPS).toEqual(['setExercise', 'addExercise', 'removeExercise', 'setDayLabel'])
  })

  // Ensure the value is typed as Plan for consumers (compile-time smoke check).
  it('returns a Plan-shaped object', () => {
    const result: { plan: Plan } = applyPlanEdits(DEFAULT_PLAN, [])
    expect(result.plan.push).toBeDefined()
    expect(result.plan.pull).toBeDefined()
  })
})
