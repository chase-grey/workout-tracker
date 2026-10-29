/**
 * Keeping the two sides of a one-limb-at-a-time exercise in step while you type.
 *
 * A sided pair (see PlannedExercise.side) is one movement logged twice — the
 * lateral raise's left arm and its right arm are separate exercises so an
 * imbalance stays visible, but they're the same dumbbell lifted for the same
 * reps. Nothing held them together on the set screen: the load-sharing group
 * carried a typed weight across (see lib/sharedLoad), but the reps typed for the
 * left arm stayed the left arm's, and the right arm still asked for the
 * prescription — a number you had to type twice, and could easily type once.
 *
 * So an edit to one side's set is an edit to the other side's set of the same
 * number. Set-for-set rather than every pending set of the other side: the
 * carry-forward (see lib/carryForward) already walks a logged set's numbers to
 * the sets after it, exercise by exercise, and mirroring set N to set N keeps the
 * two sides reading the same thing at every round of a circuit without racing it.
 */

import type { ExerciseLog, SetLog, Side } from '../types'

/** The plan fields a sided pair is read from. */
export type SidedMember = {
  key: string
  side?: Side
}

/**
 * The other half of `key`'s sided pair, or null if it has none.
 *
 * Paired the way the day is laid out (see plan.sideOrderedExercises): a sided
 * exercise pairs with the next sided exercise of the other side, whatever sits
 * between them — the arm circuit puts a tricep station between the two raises.
 * A sided exercise with no partner after it, or whose next sided neighbour is the
 * same side, is alone.
 */
export function sidePairPeer(exercises: readonly SidedMember[], key: string): string | null {
  for (let i = 0; i < exercises.length; i++) {
    const a = exercises[i]
    if (!a.side) continue
    const j = exercises.findIndex((e, k) => k > i && e.side && e.side !== a.side)
    if (j < 0) continue
    const b = exercises[j]
    if (a.key === key) return b.key
    if (b.key === key) return a.key
    i = j
  }
  return null
}

/**
 * The session's logs with a weight or reps just typed at one side's set written
 * into the other side's set of the same index.
 *
 * Only a typed edit mirrors. A patch that marks the set done is a set being
 * logged — the measured seconds of a hold that ended itself travel in the same
 * reps field — and what one arm actually did is not a prescription for the other.
 * Notes stay with the set they were written on.
 *
 * The other side's set is left alone when it's already done (it records what was
 * lifted), when it doesn't exist (a set added to one side only), and when it
 * already reads the typed number. A cleared weight field reads as `null` and
 * mirrors nothing, for the reason spreadSharedWeight gives: emptying the box is a
 * step towards the next number, not an instruction.
 *
 * Returns `logs` itself when nothing changes.
 */
export function mirrorSidedEdit<T extends ExerciseLog>(params: {
  logs: T[]
  exercises: readonly SidedMember[]
  exKey: string
  index: number
  patch: Partial<SetLog>
}): T[] {
  const { logs, exercises, exKey, index, patch } = params
  if ('done' in patch) return logs
  const mirrored: Partial<Pick<SetLog, 'weightLbs' | 'reps'>> = {}
  if (patch.weightLbs != null) mirrored.weightLbs = patch.weightLbs
  if (patch.reps != null) mirrored.reps = patch.reps
  if (Object.keys(mirrored).length === 0) return logs
  const peer = sidePairPeer(exercises, exKey)
  if (peer == null) return logs
  let changed = false
  const out = logs.map((log) => {
    if (log.exercise !== peer) return log
    const target = log.sets[index]
    if (!target || target.done) return log
    const same = (Object.keys(mirrored) as (keyof typeof mirrored)[]).every((k) => target[k] === mirrored[k])
    if (same) return log
    changed = true
    return {
      ...log,
      sets: log.sets.map((s, i) => (i === index ? { ...s, ...mirrored } : s)),
    }
  })
  return changed ? out : logs
}
