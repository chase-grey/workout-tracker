/**
 * Pure goal predictions for flexibility metrics. Builds on the generic
 * least-squares projector in `./predictions`, feeding it the split and tailor's
 * series derived from raw flex entries. No side effects beyond the optional
 * `today` clock threaded into `project`.
 */
import { project, type Projection } from './predictions'
import { warmSplitSeries, tailorsAvgSeries, type FlexEntry } from './flex'

/** Side-split goal angles (degrees), ascending. */
export const SPLIT_GOALS = [100, 120, 150, 180] as const

/** Tailor's-pose goal angles (degrees), ascending. */
export const TAILORS_GOALS = [70, 80, 90] as const

export type FlexGoal = {
  kind: 'split' | 'tailors'
  label: string
  target: number
  /**
   * Already hit, so there's nothing left to project. Decided here rather than
   * read off the projection: `project` only reports an ETA, and a reading that
   * has sailed *past* the target has no ETA to give — the gap now points the
   * opposite way from the trend, which reads as "not trending toward it".
   *
   * Judged on the best reading ever taken, not the latest. These are milestones:
   * a 111° split doesn't stop having happened because the next session came in
   * tight.
   */
  reached: boolean
  proj: Projection
}

/** The highest value in a series, or null when it holds none. */
function bestOf(points: { value: number }[]): number | null {
  let best: number | null = null
  for (const p of points) if (best == null || p.value > best) best = p.value
  return best
}

/**
 * Project every split and tailor's goal from the given entries. Split goals come
 * first (ascending), then tailor's goals. Each goal is always included; `reached`
 * says whether it's already in the bag, and the embedded `Projection` conveys
 * whether it is on track and any ETA.
 */
export function flexGoalPredictions(entries: FlexEntry[], today?: Date): FlexGoal[] {
  const split = warmSplitSeries(entries)
  const tailors = tailorsAvgSeries(entries)
  const splitBest = bestOf(split)
  const tailorsBest = bestOf(tailors)

  const goals: FlexGoal[] = []

  for (const target of SPLIT_GOALS) {
    goals.push({
      kind: 'split',
      label: `${target}° split`,
      target,
      reached: splitBest != null && splitBest >= target,
      proj: project(split, target, today),
    })
  }

  for (const target of TAILORS_GOALS) {
    goals.push({
      kind: 'tailors',
      label: `${target}° tailor's pose`,
      target,
      reached: tailorsBest != null && tailorsBest >= target,
      proj: project(tailors, target, today),
    })
  }

  return goals
}
