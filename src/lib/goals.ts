/**
 * The goal set, in one place.
 *
 * Both the Goals panel and the post-workout pace note need to know what the
 * goals are, what series each one tracks and what it's aiming at. Deriving them
 * here keeps the two in agreement — otherwise a pace note about "squat my
 * bodyweight" could disagree with what the panel shows for that goal.
 *
 * Pure module — no React/DOM.
 */

import type { BodyWeightEntry, WorkoutRow } from '../types'
import { exerciseSeries, type Point } from './progress'
import { bodyFatSeries, personalSixPackTarget, type MeasurementEntry } from './bodyComp'
import { tailorsAvgSeries, warmSplitSeries, type FlexEntry } from './flex'
import { SPLIT_GOALS, TAILORS_GOALS } from './flexPredict'

/**
 * Weekly decay of the gain rate strength projections assume (see
 * predictions.weeksToClose). Strength gains taper — a straight-line projection
 * off a few promising early sessions arrives too soon and draws a line too steep
 * to hold — so their ETAs and locked lines bend, easing ~7% off the pace each
 * week. Flexibility tapers harder still (see FLEX_GAIN_DECAY); body-composition
 * goals keep a straight line (no decay).
 */
export const STRENGTH_GAIN_DECAY = 0.93

/**
 * Weekly decay of the gain rate the flexibility ladders project with.
 *
 * Range of motion tapers harder than strength does. The first weeks of honest
 * stretching buy degrees cheaply — much of that early range is the nervous system
 * agreeing to relax into a position the hips could already reach — and once
 * that's spent, the rest comes out of tissue that changes on a scale of months.
 * A fortnight of the cheap range fits several degrees a week, and drawn straight
 * that line puts a full 180° split inside the year.
 *
 * Easing 10% off the pace each week, against strength's 7%, holds the taper's
 * own contribution to eight times the weekly figure, spent over about fifteen
 * weeks; past that the pace sits on its floor (see predictions.PACE_FLOOR) and
 * the rest of the ladder is bought a fifth of a good week at a time. A good
 * fortnight still pulls the next milestone closer, and the far rungs say what
 * they should: reachable, but years of it at this pace.
 */
export const FLEX_GAIN_DECAY = 0.9

/**
 * The fastest weekly bodyweight change the goals will project against, in lbs.
 *
 * Lean gain runs about half a pound to a pound a week, and a pound is what a very
 * good eating week looks like — anything past that is food weight and water, which
 * comes back off. But a two-week fit doesn't know the difference: one heavy
 * weekend reads as +3 lbs/week and the ETA it draws is a fantasy. Holding the
 * projected pace to a pound (see predictions.capSlope) keeps the direction the
 * weigh-ins actually show while refusing to promise a date only water could hit.
 */
export const BODYWEIGHT_GAIN_CAP = 1

/**
 * The fastest weekly 1RM gain the lift goals will project against, in lbs.
 *
 * The taper alone doesn't make a lift projection honest, because everything it
 * hands out is scaled by whatever the last fortnight fit. And a fortnight of
 * estimated 1RMs doesn't move smoothly: the readings come off top sets through
 * Epley, so one extra rep on one set reads as +6 lbs/week and licenses a
 * projection nearly ninety pounds long. Bending that line doesn't make it true.
 *
 * So the pace is held to what a good month of actual training adds, spread over
 * its weeks (see predictions.capSlope), and the taper works on a figure the
 * sessions can support. Squat takes more than bench because it always has: more
 * muscle over a longer range, off a base that's further from its ceiling. With
 * the decay on top, the caps buy about 57 lbs of squat and 34 of bench over the
 * taper's first five months, and a pound a week (squat) or a little over half
 * of one (bench) for as long as the training keeps up after that.
 */
export const SQUAT_GAIN_CAP = 5
export const BENCH_GAIN_CAP = 3

/** Stable ids, used as the keys locked projections are stored under. */
export const GOAL_IDS = {
  weight180: 'bodyweight_180',
  weight190: 'bodyweight_190',
  benchBodyweight: 'bench_bodyweight',
  squatBodyweight: 'squat_bodyweight',
  squatOneAndAHalf: 'squat_1_5x_bodyweight',
  sixPack: 'six_pack',
} as const

export type GoalSpec = {
  id: string
  title: string
  unit: string
  /**
   * The exercise whose logging moves this goal, if any. Body-composition goals
   * have none — nothing you do in a session changes them on the spot.
   */
  exerciseKey: string | null
  /** The series the goal is measured on, oldest → newest. */
  points: Point[]
  target: number
  /**
   * Which way the metric has to move to reach the target. Declared rather than
   * inferred, so "reached" is decided correctly for a goal that climbs (squat) and
   * one that falls (body fat) alike.
   */
  direction: 'up' | 'down'
  /** True when the target itself moves with bodyweight (bench/squat multiples). */
  movingTarget?: boolean
  /**
   * A milestone that stays earned: "reached" is judged on the best reading ever
   * taken, not the latest (see {@link isReached}). Set on the flexibility goals —
   * a 111° split doesn't stop having happened because the next session came in
   * tight — where a strength or bodyweight goal is only reached while you're
   * actually there.
   */
  milestone?: boolean
  /**
   * Weekly decay of the gain rate for this goal's projection (see
   * STRENGTH_GAIN_DECAY, FLEX_GAIN_DECAY). Omitted for goals that project as a
   * straight line.
   */
  decayPerWeek?: number
  /**
   * Fastest weekly change this goal's ETA may be projected from, in the goal's
   * unit (see BODYWEIGHT_GAIN_CAP, SQUAT_GAIN_CAP). Omitted for goals read off a
   * measurement with no weekly ceiling worth naming.
   */
  capPerWeek?: number
}

/**
 * Whether the goal's target has been met. A milestone is judged on the best
 * reading ever taken and stays reached once hit (see GoalSpec.milestone); every
 * other goal is judged on the latest value, so a bodyweight that touched 180 and
 * slid back isn't at 180 now.
 */
export function isReached(goal: GoalSpec): boolean {
  if (goal.points.length === 0) return false
  const values = goal.points.map((p) => p.value)
  const measured = goal.milestone
    ? goal.direction === 'up'
      ? Math.max(...values)
      : Math.min(...values)
    : values[values.length - 1]
  return goal.direction === 'up' ? measured >= goal.target : measured <= goal.target
}

/**
 * The date the goal's target was first met, or null if no reading ever met it.
 * The first crossing rather than the latest one: that's the day it happened, and
 * it's the day a commitment should be judged against. A non-milestone goal that
 * fell back off the target and climbed to it again therefore still reports the
 * original date — the achievement keeps the date it was earned on.
 */
export function reachedDate(goal: GoalSpec): string | null {
  return reachedPoint(goal)?.date ?? null
}

function reachedPoint(goal: GoalSpec): Point | undefined {
  return goal.points.find((p) => (goal.direction === 'up' ? p.value >= goal.target : p.value <= goal.target))
}

export type GoalInputs = {
  workouts: WorkoutRow[]
  bodyWeights: BodyWeightEntry[]
  measurements: MeasurementEntry[]
  heightIn: number
  /**
   * Stretch logs, feeding the flexibility goals. Optional: the goals are always
   * listed (empty when omitted), and the callers that don't display them — the
   * post-workout pace note, the in-session lift cue — filter to exercise-driven
   * goals anyway. Only the Goals panel needs to pass real entries.
   */
  flexEntries?: FlexEntry[]
}

/** Weigh-ins, minus implausible values (stray test rows) that would skew a fit. */
export function bodyWeightPoints(bodyWeights: BodyWeightEntry[]): Point[] {
  return bodyWeights.filter((b) => b.weightLbs >= 50).map((b) => ({ date: b.date, value: b.weightLbs }))
}

/**
 * Every goal, in the order they should be shown. Strength goals expressed as a
 * multiple of bodyweight come in ascending order, so the nearer milestone is
 * always listed (and reached) before the harder one. The flexibility ladders
 * (side split, then tailor's pose) come last, each ascending for the same reason.
 */
export function buildGoals({
  workouts,
  bodyWeights,
  measurements,
  heightIn,
  flexEntries = [],
}: GoalInputs): GoalSpec[] {
  const bwPoints = bodyWeightPoints(bodyWeights)
  const currentBw = bwPoints.length ? bwPoints[bwPoints.length - 1].value : 0

  const benchPoints = exerciseSeries(workouts, 'flat_bench', '1rm')
  const squatPoints = exerciseSeries(workouts, 'barbell_squat', '1rm')
  const bfPoints = bodyFatSeries(measurements, heightIn)
  const { target: bfTarget } = personalSixPackTarget(measurements, heightIn)

  // The flexibility ladders run on the same series their projections and
  // celebrations do: the warm side split, and the average of the warm tailor's
  // left/right. Each milestone angle becomes its own goal.
  const splitPoints = warmSplitSeries(flexEntries)
  const tailorsPoints = tailorsAvgSeries(flexEntries)
  const splitGoals: GoalSpec[] = SPLIT_GOALS.map((deg): GoalSpec => ({
    id: `split_${deg}`,
    title: `${deg}° split`,
    unit: '°',
    exerciseKey: null,
    points: splitPoints,
    target: deg,
    direction: 'up',
    milestone: true,
    decayPerWeek: FLEX_GAIN_DECAY,
  }))
  const tailorsGoals: GoalSpec[] = TAILORS_GOALS.map((deg): GoalSpec => ({
    id: `tailors_${deg}`,
    title: `${deg}° tailor's pose`,
    unit: '°',
    exerciseKey: null,
    points: tailorsPoints,
    target: deg,
    direction: 'up',
    milestone: true,
    decayPerWeek: FLEX_GAIN_DECAY,
  }))

  // 999 stands in for "no bodyweight logged yet", so a moving target can't be 0
  // and read as already reached.
  const bwTarget = (mult: number) => (currentBw > 0 ? Math.round(currentBw * mult * 10) / 10 : 999)

  return [
    {
      id: GOAL_IDS.weight180,
      title: 'bodyweight → 180',
      unit: 'lbs',
      exerciseKey: null,
      points: bwPoints,
      target: 180,
      direction: 'up',
      capPerWeek: BODYWEIGHT_GAIN_CAP,
    },
    {
      id: GOAL_IDS.weight190,
      title: 'bodyweight → 190',
      unit: 'lbs',
      exerciseKey: null,
      points: bwPoints,
      target: 190,
      direction: 'up',
      capPerWeek: BODYWEIGHT_GAIN_CAP,
    },
    {
      id: GOAL_IDS.benchBodyweight,
      title: `bench my bodyweight (${currentBw || '—'} lbs)`,
      unit: 'lbs',
      exerciseKey: 'flat_bench',
      points: benchPoints,
      target: bwTarget(1),
      direction: 'up',
      movingTarget: true,
      decayPerWeek: STRENGTH_GAIN_DECAY,
      capPerWeek: BENCH_GAIN_CAP,
    },
    {
      id: GOAL_IDS.squatBodyweight,
      title: 'squat my bodyweight',
      unit: 'lbs',
      exerciseKey: 'barbell_squat',
      points: squatPoints,
      target: bwTarget(1),
      direction: 'up',
      movingTarget: true,
      decayPerWeek: STRENGTH_GAIN_DECAY,
      capPerWeek: SQUAT_GAIN_CAP,
    },
    {
      id: GOAL_IDS.squatOneAndAHalf,
      title: 'squat 1.5× bodyweight',
      unit: 'lbs',
      exerciseKey: 'barbell_squat',
      points: squatPoints,
      target: bwTarget(1.5),
      direction: 'up',
      movingTarget: true,
      decayPerWeek: STRENGTH_GAIN_DECAY,
      capPerWeek: SQUAT_GAIN_CAP,
    },
    {
      id: GOAL_IDS.sixPack,
      title: 'visible 6-pack abs',
      unit: '% bf',
      exerciseKey: null,
      points: bfPoints,
      target: bfTarget,
      direction: 'down',
    },
    ...splitGoals,
    ...tailorsGoals,
  ]
}
