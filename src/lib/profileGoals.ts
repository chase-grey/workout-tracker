/**
 * The long-run goals a profile asks for.
 *
 * `buildGoals` lists the owner's goals — 180 and 190 lb, a 200 lb bench, a
 * six-pack — beside the ladders anyone can climb. This trims that list to what
 * a profile tracks and swaps the owner's bodyweight goals for the person's own
 * target, so no one is shown a number someone else chose.
 */

import { bodyWeightPoints, BODYWEIGHT_GAIN_CAP, BODYWEIGHT_TREND_WINDOW, buildGoals, GOAL_IDS, type GoalInputs, type GoalSpec } from './goals'
import { hasPillar, ownerFlavour, type Profile } from './profile'

export const TARGET_WEIGHT_GOAL_ID = 'bodyweight_target'

const OWNER_ONLY: string[] = [GOAL_IDS.weight180, GOAL_IDS.weight190, GOAL_IDS.benchTwoHundred, GOAL_IDS.sixPack]

/** The four stretch ladders; every other goal with no exercise behind it is not one. */
const FLEX_ID = /^(split|tailors|toeTouch|legLift)_/

/** Whether `goal` is a lift (or pull-up) goal, as opposed to bodyweight, body fat or flexibility. */
function isStrengthGoal(goal: GoalSpec): boolean {
  return goal.exerciseKey != null
}

function targetWeightGoal(profile: Profile, inputs: GoalInputs): GoalSpec | null {
  const target = profile.targetWeightLbs
  if (!target || target <= 0) return null
  const points = bodyWeightPoints(inputs.bodyWeights)
  // Which way it runs follows what they said they are doing, not where the scale
  // is today: a goal that flipped from up to down the day it was passed would
  // never read as reached. Without that, the first weigh-in decides.
  const dir = profile.dietDirection
  const direction: GoalSpec['direction'] =
    dir === 'lose' ? 'down' : dir === 'gain' ? 'up' : points.length && points[0].value > target ? 'down' : 'up'
  return {
    id: TARGET_WEIGHT_GOAL_ID,
    title: `${Math.round(target * 10) / 10} lbs`,
    unit: 'lbs',
    exerciseKey: null,
    points,
    target,
    direction,
    capPerWeek: BODYWEIGHT_GAIN_CAP,
    window: BODYWEIGHT_TREND_WINDOW,
  }
}

/** `buildGoals` for the person using the app: the owner's list untouched, anyone else's trimmed to their profile. */
export function goalsFor(profile: Profile | null | undefined, inputs: GoalInputs): GoalSpec[] {
  const all = buildGoals(inputs)
  if (ownerFlavour(profile) || !profile) return all
  const strength = hasPillar(profile, 'strength')
  const flex = hasPillar(profile, 'flexibility')
  // The lift and flexibility goals are the owner's choices of what to chase: his
  // bench, his pull-ups, his split. Someone else is shown one only once they have
  // logged the thing it measures, so a dumbbell plan isn't greeted by a pull-up
  // ladder and a new account isn't a page of goals with nothing to project.
  const logged = new Set(inputs.workouts.map((r) => r.exercise))
  const trains = (g: GoalSpec) =>
    [g.exerciseKey, ...(g.alsoCounts ?? [])].some((key) => key != null && logged.has(key))
  const kept = all.filter((g) => {
    if (OWNER_ONLY.includes(g.id)) return false
    if (isStrengthGoal(g)) return strength && trains(g)
    if (FLEX_ID.test(g.id)) return flex && g.points.length > 0
    return true
  })
  const own = targetWeightGoal(profile, inputs)
  return own ? [own, ...kept] : kept
}
