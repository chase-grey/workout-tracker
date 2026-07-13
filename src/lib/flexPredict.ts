/**
 * Pure goal predictions for flexibility metrics. Builds on the generic
 * least-squares projector in `./predictions`, feeding it the split and tailor's
 * series derived from raw flex entries. No side effects beyond the optional
 * `today` clock threaded into `project`.
 */
import { project, type Projection } from './predictions'
import { splitSeries, tailorsAvgSeries, type FlexEntry } from './flex'

/** Side-split goal angles (degrees), ascending. */
export const SPLIT_GOALS = [100, 120, 150, 180] as const

/** Tailor's-pose goal angles (degrees). */
export const TAILORS_GOALS = [90] as const

export type FlexGoal = {
  kind: 'split' | 'tailors'
  label: string
  target: number
  proj: Projection
}

/**
 * Project every split and tailor's goal from the given entries. Split goals come
 * first (ascending), then tailor's goals. Each goal is always included; the
 * embedded `Projection` conveys whether it is on track and any ETA.
 */
export function flexGoalPredictions(entries: FlexEntry[], today?: Date): FlexGoal[] {
  const split = splitSeries(entries)
  const tailors = tailorsAvgSeries(entries)

  const goals: FlexGoal[] = []

  for (const target of SPLIT_GOALS) {
    goals.push({
      kind: 'split',
      label: `${target}° split`,
      target,
      proj: project(split, target, today),
    })
  }

  for (const target of TAILORS_GOALS) {
    goals.push({
      kind: 'tailors',
      label: `${target}° tailor's pose`,
      target,
      proj: project(tailors, target, today),
    })
  }

  return goals
}
