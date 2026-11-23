import { describe, expect, it } from 'vitest'
import { soloExercise } from './soloSession'
import { DEFAULT_PLAN, type Plan } from '../config/plan'

describe('soloExercise', () => {
  it('takes the movement from the first day that trains it, rep range and all', () => {
    const solo = soloExercise(DEFAULT_PLAN, 'flat_bench')!
    const planned = DEFAULT_PLAN.push.exercises.find((e) => e.key === 'flat_bench')!
    expect(solo.dayType).toBe('push')
    expect(solo.exercise.key).toBe('flat_bench')
    expect(solo.exercise.sets).toBe(planned.sets)
    expect(solo.exercise.repMin).toBe(planned.repMin)
    expect(solo.exercise.repMax).toBe(planned.repMax)
    expect(solo.exercise.restSec).toBe(planned.restSec)
  })

  it('sheds what belonged to its place in the day', () => {
    const { exercise } = soloExercise(DEFAULT_PLAN, 'flat_bench')!
    expect(exercise.byVariant).toBeUndefined()
    expect(exercise.shortSets).toBeUndefined()
    expect(exercise.circuit).toBeUndefined()
  })

  it('gives a goal counted across sets at least that many', () => {
    const plan: Plan = {
      ...DEFAULT_PLAN,
      pull: {
        ...DEFAULT_PLAN.pull,
        exercises: DEFAULT_PLAN.pull.exercises.map((e) => (e.key === 'weighted_pullups' ? { ...e, sets: 2 } : e)),
      },
    }
    expect(soloExercise(plan, 'weighted_pullups', 4)!.exercise.sets).toBe(4)
    expect(soloExercise(plan, 'weighted_pullups')!.exercise.sets).toBe(2)
  })

  it('falls back on the shipped default when the plan has dropped the movement', () => {
    const plan = Object.fromEntries(
      Object.entries(DEFAULT_PLAN).map(([d, day]) => [
        d,
        { ...day, exercises: day.exercises.filter((e) => e.key !== 'leg_press') },
      ]),
    ) as Plan
    const solo = soloExercise(plan, 'leg_press')!
    expect(solo.dayType).toBe('fullbody')
    expect(solo.exercise.key).toBe('leg_press')
  })

  it('is null for a movement nothing knows', () => {
    expect(soloExercise(DEFAULT_PLAN, 'not_a_lift')).toBeNull()
  })
})
