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

/**
 * Weekly decay of the gain rate strength projections assume (see
 * predictions.weeksToClose). Strength gains taper — a straight-line projection
 * off a few promising early sessions arrives too soon and draws a line too steep
 * to hold — so their ETAs and locked lines bend, easing ~7% off the pace each
 * week. Body-composition goals keep a straight line (no decay).
 */
export const STRENGTH_GAIN_DECAY = 0.93

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
   * Weekly decay of the gain rate for this goal's projection (see
   * STRENGTH_GAIN_DECAY). Omitted for goals that project as a straight line.
   */
  decayPerWeek?: number
}

/** Whether the latest value has met or passed the goal's target. */
export function isReached(goal: GoalSpec): boolean {
  const latest = goal.points.length ? goal.points[goal.points.length - 1].value : null
  if (latest == null) return false
  return goal.direction === 'up' ? latest >= goal.target : latest <= goal.target
}

export type GoalInputs = {
  workouts: WorkoutRow[]
  bodyWeights: BodyWeightEntry[]
  measurements: MeasurementEntry[]
  heightIn: number
}

/** Weigh-ins, minus implausible values (stray test rows) that would skew a fit. */
export function bodyWeightPoints(bodyWeights: BodyWeightEntry[]): Point[] {
  return bodyWeights.filter((b) => b.weightLbs >= 50).map((b) => ({ date: b.date, value: b.weightLbs }))
}

/**
 * Every goal, in the order they should be shown. Strength goals expressed as a
 * multiple of bodyweight come in ascending order, so the nearer milestone is
 * always listed (and reached) before the harder one.
 */
export function buildGoals({ workouts, bodyWeights, measurements, heightIn }: GoalInputs): GoalSpec[] {
  const bwPoints = bodyWeightPoints(bodyWeights)
  const currentBw = bwPoints.length ? bwPoints[bwPoints.length - 1].value : 0

  const benchPoints = exerciseSeries(workouts, 'flat_bench', '1rm')
  const squatPoints = exerciseSeries(workouts, 'barbell_squat', '1rm')
  const bfPoints = bodyFatSeries(measurements, heightIn)
  const { target: bfTarget } = personalSixPackTarget(measurements, heightIn)

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
    },
    {
      id: GOAL_IDS.weight190,
      title: 'bodyweight → 190',
      unit: 'lbs',
      exerciseKey: null,
      points: bwPoints,
      target: 190,
      direction: 'up',
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
  ]
}
