import { describe, it, expect } from 'vitest'
import { DEFAULT_PLAN, PLAN_REVISION, dayOrder, withPlanDefaults } from '../config/plan'
import type { Plan } from '../config/plan'
import type { DayType } from '../types'
import { applyPlanEdits, PLAN_EDIT_OPS, type PlanEdit } from './planTools'

/** A day's exercise keys in order — what the reordering ops are judged on. */
const keys = (plan: Plan, day: DayType): string[] => plan[day].exercises.map((e) => e.key)

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

  it('setExercise sets a per-station circuit rest, zero included', () => {
    // "Rest only after the lateral raise": the stations either side of it roll
    // straight on, so their rest has to be settable to 0 and stay 0.
    const { plan } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'setExercise', day: 'push', key: 'tricep_pushdown', fields: { circuitRestSec: 0 } },
      { op: 'setExercise', day: 'push', key: 'lateral_raise_l', fields: { circuitRestSec: 60 } },
    ])
    const push = (key: string) => plan.push.exercises.find((e) => e.key === key)
    expect(push('tricep_pushdown')?.circuitRestSec).toBe(0)
    expect(push('lateral_raise_l')?.circuitRestSec).toBe(60)
  })

  it('setExercise clears a circuit rest with null', () => {
    const { plan: set } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'setExercise', day: 'push', key: 'tricep_pushdown', fields: { circuitRestSec: 0 } },
    ])
    const { plan: cleared } = applyPlanEdits(set, [
      { op: 'setExercise', day: 'push', key: 'tricep_pushdown', fields: { circuitRestSec: null } },
    ])
    expect(cleared.push.exercises.find((e) => e.key === 'tricep_pushdown')).not.toHaveProperty(
      'circuitRestSec',
    )
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
    expect(applied[0]).toContain('added Cable Fly!! to push')
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
    expect(added?.group).toBe('custom')
  })

  it('removeExercise removes by key', () => {
    const curl = DEFAULT_PLAN.pull.exercises.find((e) => e.key === 'hammer_curl')
    const { plan, applied, errors } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'removeExercise', day: 'pull', key: 'hammer_curl' },
    ])
    expect(plan.pull.exercises.some((e) => e.key === 'hammer_curl')).toBe(false)
    // Reported by name — the key is an implementation detail the chat shouldn't show.
    expect(applied[0]).toBe(`removed ${curl?.name} from pull`)
    expect(errors).toHaveLength(0)
  })

  it('addExercise given only a key names the exercise off it, never with it', () => {
    // How the assistant adds a lift it knows by key: no name field at all. Storing
    // the key as the name is what put "lateral_raise" on screen in PRs.
    const { plan, applied } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'addExercise', day: 'pull', exercise: { key: 'lateral_raise' } as never },
      { op: 'addExercise', day: 'pull', exercise: { key: 'cable_crossover', name: '   ' } as never },
    ])
    const added = (key: string) => plan.pull.exercises.find((e) => e.key === key)
    expect(added('lateral_raise')?.name).toBe('lateral raise')
    expect(added('cable_crossover')?.name).toBe('cable crossover')
    expect(applied[0]).toBe('added lateral raise to pull')
  })

  it('setExercise ignores a blank name rather than emptying the row', () => {
    const { plan } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'setExercise', day: 'push', key: 'flat_bench', fields: { name: '  ' } },
    ])
    const ex = plan.push.exercises.find((e) => e.key === 'flat_bench')
    expect(ex?.name).toBe(DEFAULT_PLAN.push.exercises.find((e) => e.key === 'flat_bench')?.name)
  })

  it('removeExercise records a shipped exercise so the merge stops re-adding it', () => {
    const { plan } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'removeExercise', day: 'pull', key: 'hamstring_curl' },
      { op: 'removeExercise', day: 'pull', key: 'calf_raise' },
    ])
    expect(plan.pull.removed).toEqual(['hamstring_curl', 'calf_raise'])
    // The load it has to survive: without the list, both come straight back.
    const keys = withPlanDefaults(plan, PLAN_REVISION).pull.exercises.map((e) => e.key)
    expect(keys).not.toContain('hamstring_curl')
    expect(keys).not.toContain('calf_raise')
  })

  it('removeExercise leaves no record for an exercise the user added themselves', () => {
    // Nothing puts a custom exercise back, so a headstone would only sit there
    // waiting to strike out whatever later took the key.
    const { plan } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'addExercise', day: 'pull', exercise: { key: 'face_pull' } as never },
      { op: 'removeExercise', day: 'pull', key: 'face_pull' },
    ])
    expect(plan.pull.removed).toBeUndefined()
  })

  it('addExercise takes back the deletion of a shipped exercise', () => {
    const { plan } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'removeExercise', day: 'pull', key: 'calf_raise' },
      { op: 'addExercise', day: 'pull', exercise: { key: 'calf_raise' } as never },
    ])
    expect(plan.pull.removed).toBeUndefined()
    expect(withPlanDefaults(plan, PLAN_REVISION).pull.exercises.map((e) => e.key)).toContain(
      'calf_raise',
    )
  })

  it('removeExercise on a missing key records an error', () => {
    const { errors } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'removeExercise', day: 'pull', key: 'nope' },
    ])
    expect(errors).toHaveLength(1)
  })

  it('moveExercise puts one exercise directly before another', () => {
    const { plan, applied, errors } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'moveExercise', day: 'push', key: 'flat_bench', before: 'cable_crunch' },
    ])
    expect(keys(plan, 'push')[0]).toBe('flat_bench')
    // Nothing else moves, and nothing is lost or duplicated on the way.
    expect(keys(plan, 'push').slice(1)).toEqual(
      keys(DEFAULT_PLAN, 'push').filter((k) => k !== 'flat_bench'),
    )
    expect(applied[0]).toBe('moved flat bench press to position 1 on push')
    expect(errors).toHaveLength(0)
  })

  it('moveExercise puts one exercise directly after another, moving forwards', () => {
    // Forwards is where an index would be off by one: the anchor sits a place
    // earlier once the exercise being moved is lifted out.
    const { plan } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'moveExercise', day: 'push', key: 'cable_crunch', after: 'flat_bench' },
    ])
    const order = keys(plan, 'push')
    expect(order.indexOf('cable_crunch')).toBe(order.indexOf('flat_bench') + 1)
    expect(order).toHaveLength(DEFAULT_PLAN.push.exercises.length)
  })

  it('moveExercise moves to a position, clamping past the end', () => {
    const { plan: toTop } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'moveExercise', day: 'push', key: 'lateral_raise_r', toIndex: 0 },
    ])
    expect(keys(toTop, 'push')[0]).toBe('lateral_raise_r')

    const { plan: toEnd, errors } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'moveExercise', day: 'push', key: 'cable_crunch', toIndex: 99 },
    ])
    expect(keys(toEnd, 'push').at(-1)).toBe('cable_crunch')
    expect(errors).toHaveLength(0)
  })

  it('moveExercise one step at a time swaps neighbours, as the plan editor arrows do', () => {
    // The editor sends the row's own index ± 1, counted in the list the exercise
    // is still part of.
    const before = keys(DEFAULT_PLAN, 'push')
    const i = before.indexOf('machine_overhead_press')
    const { plan: down } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'moveExercise', day: 'push', key: 'machine_overhead_press', toIndex: i + 1 },
    ])
    expect(keys(down, 'push')[i]).toBe(before[i + 1])
    expect(keys(down, 'push')[i + 1]).toBe('machine_overhead_press')

    const { plan: up } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'moveExercise', day: 'push', key: 'machine_overhead_press', toIndex: i - 1 },
    ])
    expect(keys(up, 'push')[i - 1]).toBe('machine_overhead_press')
    expect(keys(up, 'push')[i]).toBe(before[i - 1])
  })

  it('moveExercise records an error and moves nothing when it cannot place the exercise', () => {
    const cases: PlanEdit[] = [
      { op: 'moveExercise', day: 'push', key: 'nope', toIndex: 0 },
      { op: 'moveExercise', day: 'push', key: 'flat_bench', after: 'nope' },
      // No destination at all.
      { op: 'moveExercise', day: 'push', key: 'flat_bench' },
    ]
    for (const edit of cases) {
      const { plan, applied, errors } = applyPlanEdits(DEFAULT_PLAN, [edit])
      expect(errors).toHaveLength(1)
      expect(applied).toHaveLength(0)
      expect(keys(plan, 'push')).toEqual(keys(DEFAULT_PLAN, 'push'))
    }
  })

  it('reorderDay sets the whole order at once', () => {
    const reversed = [...keys(DEFAULT_PLAN, 'pull')].reverse()
    const { plan, applied, errors } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'reorderDay', day: 'pull', keys: reversed },
    ])
    expect(keys(plan, 'pull')).toEqual(reversed)
    // The resulting order is spelled out — it's all the approve button shows.
    expect(applied[0]).toBe(
      `reordered pull: ${plan.pull.exercises.map((e) => e.name).join(' → ')}`,
    )
    expect(errors).toHaveLength(0)
  })

  it('reorderDay leaves the exercises it does not name behind the ones it does', () => {
    const { plan } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'reorderDay', day: 'pull', keys: ['hammer_curl', 'weighted_pullups'] },
    ])
    const rest = keys(DEFAULT_PLAN, 'pull').filter(
      (k) => k !== 'hammer_curl' && k !== 'weighted_pullups',
    )
    expect(keys(plan, 'pull')).toEqual(['hammer_curl', 'weighted_pullups', ...rest])
  })

  it('reorderDay skips a key the day does not have and keeps the rest', () => {
    const { plan, applied, errors } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'reorderDay', day: 'pull', keys: ['nope', 'hammer_curl'] },
    ])
    expect(keys(plan, 'pull')[0]).toBe('hammer_curl')
    expect(keys(plan, 'pull')).toHaveLength(DEFAULT_PLAN.pull.exercises.length)
    expect(applied).toHaveLength(1)
    expect(errors).toEqual(['no exercise "nope" on pull'])
  })

  it('reorderDay recognising nothing leaves the day alone', () => {
    const { plan, applied, errors } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'reorderDay', day: 'pull', keys: [] },
      { op: 'reorderDay', day: 'push', keys: ['nope'] },
    ])
    expect(keys(plan, 'pull')).toEqual(keys(DEFAULT_PLAN, 'pull'))
    expect(keys(plan, 'push')).toEqual(keys(DEFAULT_PLAN, 'push'))
    expect(applied).toHaveLength(0)
    expect(errors).toHaveLength(2)
  })

  it('reordering does not mutate the input plan', () => {
    const before = keys(DEFAULT_PLAN, 'push')
    applyPlanEdits(DEFAULT_PLAN, [
      { op: 'moveExercise', day: 'push', key: 'flat_bench', toIndex: 0 },
      { op: 'reorderDay', day: 'push', keys: ['machine_overhead_press'] },
    ])
    expect(keys(DEFAULT_PLAN, 'push')).toEqual(before)
  })

  it('reorderDays puts the days themselves in a new order', () => {
    const { plan, applied, errors } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'reorderDays', days: ['pull', 'fullbody', 'push'] },
    ])
    expect(dayOrder(plan)).toEqual(['pull', 'fullbody', 'push'])
    // Spelled out by label — it's all the approve button shows of the change.
    expect(applied[0]).toBe(
      `reordered the days: ${plan.pull.label} → ${plan.fullbody.label} → ${plan.push.label}`,
    )
    expect(errors).toHaveLength(0)
  })

  it('reorderDays leaves the days it does not name behind the ones it does', () => {
    const { plan } = applyPlanEdits(DEFAULT_PLAN, [{ op: 'reorderDays', days: ['fullbody'] }])
    const rest = dayOrder(DEFAULT_PLAN).filter((d) => d !== 'fullbody')
    expect(dayOrder(plan)).toEqual(['fullbody', ...rest])
  })

  it('reorderDays skips a day the plan does not have and keeps the rest', () => {
    const badDay = 'legs' as unknown as DayType
    const { plan, applied, errors } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'reorderDays', days: [badDay, 'pull'] },
    ])
    expect(dayOrder(plan)[0]).toBe('pull')
    expect(dayOrder(plan)).toHaveLength(dayOrder(DEFAULT_PLAN).length)
    expect(applied).toHaveLength(1)
    expect(errors).toEqual(['invalid day "legs" for op "reorderDays"'])
  })

  it('reorderDays recognising nothing leaves the order alone', () => {
    const badDay = 'legs' as unknown as DayType
    const { plan, applied, errors } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'reorderDays', days: [] },
      { op: 'reorderDays', days: [badDay] },
    ])
    expect(dayOrder(plan)).toEqual(dayOrder(DEFAULT_PLAN))
    expect(applied).toHaveLength(0)
    expect(errors).toHaveLength(2)
  })

  it('reorderDays does not disturb the exercises or the other edits in the batch', () => {
    const { plan, errors } = applyPlanEdits(DEFAULT_PLAN, [
      { op: 'reorderDays', days: ['fullbody', 'push', 'pull'] },
      { op: 'setExercise', day: 'push', key: 'flat_bench', fields: { sets: 5 } },
    ])
    expect(dayOrder(plan)).toEqual(['fullbody', 'push', 'pull'])
    expect(keys(plan, 'push')).toEqual(keys(DEFAULT_PLAN, 'push'))
    expect(plan.push.exercises.find((e) => e.key === 'flat_bench')?.sets).toBe(5)
    expect(errors).toHaveLength(0)
  })

  it('reorderDays does not mutate the input plan', () => {
    const before = dayOrder(DEFAULT_PLAN)
    applyPlanEdits(DEFAULT_PLAN, [{ op: 'reorderDays', days: [...before].reverse() }])
    expect(dayOrder(DEFAULT_PLAN)).toEqual(before)
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
    expect(PLAN_EDIT_OPS).toEqual([
      'setExercise',
      'addExercise',
      'removeExercise',
      'moveExercise',
      'reorderDay',
      'setDayLabel',
      'reorderDays',
    ])
  })

  // Ensure the value is typed as Plan for consumers (compile-time smoke check).
  it('returns a Plan-shaped object', () => {
    const result: { plan: Plan } = applyPlanEdits(DEFAULT_PLAN, [])
    expect(result.plan.push).toBeDefined()
    expect(result.plan.pull).toBeDefined()
  })
})
