/**
 * Which side leads a session's one-limb-at-a-time work.
 *
 * Lateral raises and Copenhagen planks run one limb at a time (see
 * PlannedExercise.side), and whichever side goes first is the one done fresh — the
 * other follows it, and inside a circuit it follows another lap of the stations too.
 * Left every time would hand that advantage to the same side forever, so the lead
 * alternates:
 *
 *   left → right → left → …
 *
 * Read off the side the last session actually led with, the way the A/B press
 * variant turns over off the variant its last session recorded (see
 * lib/pushVariant). A running count of sessions was the earlier rule, and a count
 * only alternates while it's perfect: a session that never trained the pair — one
 * logged before the pair shipped, one where the exercise was skipped — burns a turn
 * anyway, and a session missing from history, or logged twice, flips the parity for
 * good with nothing able to notice or recover. Reading what actually happened is
 * self-correcting instead: only the last session decides, so a repeat stops there.
 *
 * Nothing stores the side per row, and nothing needs to: the two sides are separate
 * exercise keys, and a session's rows are written in the order it performed them
 * (see session.sessionToRows), so the first sided row of a session is the side that
 * led it. That reads back over history already logged, and it follows an override —
 * "actually, start me on the other side" — rather than the schedule the session was
 * offered.
 *
 * Counted off logged history rather than a stored toggle, so it survives a
 * reinstall and stays consistent across devices. Only completed sessions count:
 * starting a workout and abandoning it doesn't burn a turn. Pure module — no
 * React/DOM, no storage.
 */

import type { DayType, Side, WorkoutRow } from '../types'
import { ALL_EXERCISES } from '../config/plan'
import { trainingSessions } from './session'

/** Both sides, in the order they first lead. */
export const SIDES: Side[] = ['left', 'right']

/** The other arm — for the "actually, start me on the other side" override. */
export function otherSide(side: Side): Side {
  return side === 'left' ? 'right' : 'left'
}

/**
 * Which side each one-limb-at-a-time exercise trains, read off the shipped
 * defaults: `side` is program design rather than user preference, so a stored plan
 * always re-adopts it (see mergeDayExercises) and a row's key alone settles it.
 */
const SIDE_BY_KEY = new Map<string, Side>(
  ALL_EXERCISES.flatMap((e) => (e.side ? [[e.key, e.side] as [string, Side]] : [])),
)

/**
 * The side that led the most recent logged `dayType` session, or null if no session
 * on record trained a sided exercise at all.
 *
 * Only training sessions are eligible, so a supplemental core-only session never
 * turns the alternation over. Sessions with no sided rows are skipped rather than
 * treated as a break in the chain: a pull + legs day logged before the Copenhagen
 * plank shipped says nothing about which adductor went first, and the last session
 * that does say is still the right thing to alternate from. Dates are YYYY-MM-DD,
 * so a plain string compare orders them, and `>=` lets a later session win a
 * same-day tie since rows are appended chronologically.
 */
export function lastStartSide(workouts: WorkoutRow[], dayType: DayType): Side | null {
  const dates = new Map(
    trainingSessions(workouts)
      .filter((s) => s.dayType === dayType)
      .map((s) => [s.sessionId, s.date]),
  )
  // The first sided row of each session — the side it led with. Insertion order is
  // row order, which is what the same-day tie-break below then reads.
  const leads = new Map<string, Side>()
  for (const r of workouts) {
    if (!r.session_id || leads.has(r.session_id) || !dates.has(r.session_id)) continue
    const side = SIDE_BY_KEY.get(r.exercise)
    if (side) leads.set(r.session_id, side)
  }
  let latest: { date: string; side: Side } | null = null
  for (const [sessionId, side] of leads) {
    const date = dates.get(sessionId)!
    if (!latest || date >= latest.date) latest = { date, side }
  }
  return latest?.side ?? null
}

/**
 * The side to lead with for `dayType` right now — whichever side the last session
 * didn't lead with, and left when there's no side on record to turn over from.
 */
export function nextStartSide(workouts: WorkoutRow[], dayType: DayType): Side {
  const last = lastStartSide(workouts, dayType)
  return last ? otherSide(last) : SIDES[0]
}
