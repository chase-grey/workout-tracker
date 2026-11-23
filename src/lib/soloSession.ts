import { ALL_EXERCISES, DAY_TYPES, type Plan, type PlannedExercise } from '../config/plan'
import type { DayType } from '../types'
import { adHocExercise } from './adHocExercise'

/**
 * A workout of one movement: what a lift goal opens when it's tapped, so the sets
 * that settle it are logged on the screen every other set is, with the weight and
 * reps fields, the rest timer and the history all where they always are.
 *
 * The movement is the plan's own, from the first day that trains it, shaped the
 * way an addition to a running workout is (see adHocExercise): its key, rest,
 * increment and rep range kept, and what belonged to its place in a day shed — a
 * circuit of one is no circuit. `minSets` is for a goal counted across sets (the
 * pull-up ladder's four): the day's short form may prescribe fewer than the goal
 * reads, and a session opened to clear a rung has to be able to.
 *
 * The day is only where the rows are filed; a movement the plan has since dropped
 * falls back on its shipped default and the full-body day, the same home a lone
 * max attempt gets (see DataContext.logMaxAttempt). Null for a key nothing knows.
 */
export function soloExercise(
  plan: Plan,
  key: string,
  minSets = 0,
): { dayType: DayType; exercise: PlannedExercise } | null {
  const dayType = DAY_TYPES.find((t) => plan[t]?.exercises.some((e) => e.key === key))
  const base = dayType
    ? plan[dayType].exercises.find((e) => e.key === key)
    : ALL_EXERCISES.find((e) => e.key === key)
  if (!base) return null
  const shaped = adHocExercise(
    { name: base.name, sets: Math.max(base.sets, minSets), reps: base.repMin },
    { key: base.key, name: base.name, group: base.group, base },
  )
  return {
    dayType: dayType ?? 'fullbody',
    exercise: { ...shaped, repMin: base.repMin, repMax: base.repMax },
  }
}
