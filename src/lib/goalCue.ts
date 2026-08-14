/**
 * The point-of-exercise nudge for a locked strength goal.
 *
 * The Goals panel answers "how am I tracking?" between sessions; this answers the
 * question you have with a bar in your hands: what do I need to hit *right now* to
 * stay on the line? It reads the locked line at today's date and turns the e1RM it
 * calls for into a concrete weight at the reps you're about to do — so a goal you
 * only touch on leg day tells you, on leg day, the number that keeps it on pace.
 *
 * Pure module — no React/DOM, no storage.
 */

import { toISODate } from './dates'
import { expectedAt, type LockedProjections } from './goalLock'
import { attemptWeight, isReadyToAttempt, type GoalSpec } from './goals'

export type GoalCue = {
  goalTitle: string
  reps: number
  /** Weight at `reps` whose Epley e1RM lands on the locked line as of today. */
  weightLbs: number
  /** The e1RM the line calls for today. */
  lineE1RM: number
  /** How the last logged session stands against the line, on its own date. */
  standing: 'ahead' | 'behind' | 'on'
  /** e1RM ahead of the line (negative = behind) at that last session. */
  aheadBy: number
  /**
   * The goal isn't asking for another working set anymore — the estimate is there
   * and what's left is the single itself (see goals.isReadyToAttempt). `weightLbs`
   * is then the attempt weight at one rep rather than a weight on the line.
   */
  ready?: true
}

const round1 = (n: number): number => Math.round(n * 10) / 10
const roundHalf = (n: number): number => Math.round(n * 2) / 2

/** The weight that yields Epley e1RM `e1rm` at `reps` reps (the inverse of epley1RM). */
function weightForE1RM(e1rm: number, reps: number): number {
  if (reps <= 0) return e1rm
  return e1rm / (1 + reps / 30)
}

/**
 * The nearest un-reached locked goal riding on `exerciseKey`, turned into a
 * target for a set of `reps` reps. Nearest so the milestone you're actually
 * working toward wins when a lift carries two (squat bodyweight before 1.5×).
 * null when nothing rides on this exercise, or it's all already met.
 *
 * A goal waiting on a real single is cued as the attempt instead — the weight it
 * takes, for one rep (see {@link GoalCue.ready}) — and outranks the goals still
 * being worked toward, since it's the one thing on this lift that would finish
 * something today.
 *
 * Only goals measured in estimated 1RM are cued. The whole cue is "load the bar
 * to this and the line is met", and a goal counted in reps — the pull-up ladder
 * — has no weight to name: what it wants is another rep on every set, which the
 * rep target on screen already says.
 */
export function goalCueForExercise(
  locked: LockedProjections,
  goals: GoalSpec[],
  exerciseKey: string,
  reps: number,
  today: Date = new Date(),
): GoalCue | null {
  let best: { goal: GoalSpec; rank: number; ready: boolean } | null = null
  for (const goal of goals) {
    if (goal.exerciseKey !== exerciseKey || goal.points.length === 0) continue
    if ((goal.measure ?? 'e1rm') !== 'e1rm') continue
    const ready = isReadyToAttempt(goal)
    // A goal being nudged along its line needs that line, so it needs a commitment
    // to read one off. An attempt doesn't: the weight comes from the target itself,
    // and being one single away from a goal is worth saying whether or not the goal
    // was ever committed to.
    if (!ready && !locked[goal.id]) continue
    const latest = goal.points[goal.points.length - 1].value
    const toward = goal.direction === 'up' ? 1 : -1
    const remaining = (goal.target - latest) * toward
    if (!ready && remaining <= 0) continue // met on the estimate and not gated on a single
    // Ready outranks anything still being worked toward: the nearest thing to do on
    // this lift is the attempt, not another set on the way to it.
    const rank = ready ? 0 : remaining
    if (!best || rank < best.rank) best = { goal, rank, ready }
  }
  if (!best) return null

  const { goal } = best

  // One single away: the number to put on the bar is what the goal asks for, at one
  // rep, and the line has nothing left to say about it.
  if (best.ready) {
    const readyLock = locked[goal.id]
    const latest = goal.points[goal.points.length - 1].value
    const toward = goal.direction === 'up' ? 1 : -1
    const over = round1((latest - goal.target) * toward)
    return {
      goalTitle: goal.title,
      reps: 1,
      weightLbs: attemptWeight(goal, exerciseKey),
      lineE1RM: round1(readyLock ? expectedAt(readyLock, toISODate(today)) : goal.target),
      standing: over > 0.05 ? 'ahead' : 'on',
      aheadBy: over,
      ready: true,
    }
  }

  const lock = locked[goal.id]!
  const lineE1RM = expectedAt(lock, toISODate(today))
  const weightLbs = roundHalf(weightForE1RM(lineE1RM, reps))

  const last = goal.points[goal.points.length - 1]
  const toward = Math.sign(lock.target - lock.startValue) || 1
  const aheadBy = round1((last.value - expectedAt(lock, last.date)) * toward)
  const standing = Math.abs(aheadBy) < 0.05 ? 'on' : aheadBy > 0 ? 'ahead' : 'behind'

  return { goalTitle: goal.title, reps, weightLbs, lineE1RM: round1(lineE1RM), standing, aheadBy }
}
