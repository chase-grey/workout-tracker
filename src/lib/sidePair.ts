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
 * Identity of one round of a lift, shared by the two sides of a sided pair: the
 * Copenhagen plank's left set 2 and its right set 2 are one round. It is what
 * the session asks a round's animation under (see lib/roundVariant), named for
 * whichever side the day lays out first. An exercise with no other side is its
 * own round.
 */
export function sidedRoundKey(exercises: readonly SidedMember[], key: string, setIndex: number): string {
  const peer = sidePairPeer(exercises, key)
  const first = peer == null ? key : (exercises.find((e) => e.key === key || e.key === peer)?.key ?? key)
  return `${first}:${setIndex}`
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

/**
 * Whether the two sides' sets read the same numbers — the condition for showing
 * them as one entry. A missing set agrees with nothing.
 */
export function sidesAgree(a: SetLog | undefined, b: SetLog | undefined): boolean {
  return !!a && !!b && (a.weightLbs ?? null) === (b.weightLbs ?? null) && a.reps === b.reps
}

/**
 * How the sets on one round screen are entered, card by card.
 *
 * Both arms of a one-arm pair are on the screen together when a circuit runs a
 * round at a time, and they're one dumbbell, one pin and the same reps — so they
 * take ONE card: a single weight and a single reps field, written to both sides'
 * sets so each side's history, progression and chart go on reading their own
 * rows. The card sits at the leading arm's place in the round; the other arm's
 * place keeps a slim `echo` of it, because which station it follows is the
 * round's pacing — the raise's arms straddle a tricep station so neither works
 * twice in a row — and the echo is what says "the other arm now".
 *
 * `together(lead, follow)` decides whether a pair is shown as one: the caller's
 * own "sides differ" choice, and whether the two sets still read alike. Sides
 * prescribed differently — a weaker arm the progression is holding back (see
 * progression.nextTargets, which prescribes each side off its own history) —
 * stay as two cards, the way they were, since that difference is the point of
 * logging them apart.
 *
 * A pair only merges when both its steps are on this screen; a side whose set is
 * already logged or struck off is just a card.
 */
export type RoundCard<S> =
  | { kind: 'one'; step: S }
  | { kind: 'pair'; lead: S; follow: S }
  | { kind: 'echo'; step: S; lead: S }

export function roundCards<S extends { ex: SidedMember }>(
  steps: readonly S[],
  together: (lead: S, follow: S) => boolean,
): RoundCard<S>[] {
  const members = steps.map((s) => s.ex)
  const followOf = new Map<S, S>()
  const leadOf = new Map<S, S>()
  for (const s of steps) {
    if (leadOf.has(s) || followOf.has(s)) continue
    const peer = sidePairPeer(members, s.ex.key)
    const other = peer == null ? undefined : steps.find((o) => o !== s && o.ex.key === peer)
    if (!other || !together(s, other)) continue
    followOf.set(s, other)
    leadOf.set(other, s)
  }
  return steps.map((s): RoundCard<S> => {
    const follow = followOf.get(s)
    if (follow) return { kind: 'pair', lead: s, follow }
    const lead = leadOf.get(s)
    if (lead) return { kind: 'echo', step: s, lead }
    return { kind: 'one', step: s }
  })
}

/**
 * A list of per-exercise lines with each pair whose two sides say the same thing
 * folded into one, under the side-less name — the finish recap's "new baseline:
 * lateral raise (left)" and "(right)" from one entry made for both. Sides that
 * differ (`same` false) keep their own lines.
 */
export function foldSides<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  rename: (item: T, name: string) => T,
  same: (a: T, b: T) => boolean = () => true,
): T[] {
  const sideOf = (name: string) => /\s*\((left|right)\)\s*$/i.exec(name)
  const out: T[] = []
  const used = new Set<number>()
  items.forEach((item, i) => {
    if (used.has(i)) return
    const m = sideOf(nameOf(item))
    if (m) {
      const base = nameOf(item).slice(0, m.index)
      const want = m[1].toLowerCase() === 'left' ? 'right' : 'left'
      const j = items.findIndex(
        (o, k) => k !== i && !used.has(k) && nameOf(o).toLowerCase() === `${base} (${want})`.toLowerCase(),
      )
      if (j >= 0 && same(item, items[j])) {
        used.add(j)
        out.push(rename(item, base))
        return
      }
    }
    out.push(item)
  })
  return out
}
