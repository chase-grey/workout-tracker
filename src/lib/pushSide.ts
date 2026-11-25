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
 * The turn belongs to the movement, not to the day it was trained on. The lateral
 * raise is on the push day and the full-body day both, and a turn kept per day
 * handed the left arm the fresh start on the push day and again on the full-body
 * day before the right arm got one. So each pair is read off the last session that
 * trained it, whatever day that was, and two pairs sharing a day each lead with
 * their own side.
 *
 * Counted off logged history rather than a stored toggle, so it survives a
 * reinstall and stays consistent across devices. Only completed sessions count:
 * starting a workout and abandoning it doesn't burn a turn. Pure module — no
 * React/DOM, no storage.
 */

import type { Side, WorkoutRow } from '../types'
import { ALL_EXERCISES } from '../config/plan'
import { sidePartnerKey } from './pairedSides'
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

/** One name for both halves of a sided pair, so either side's rows find its turn. */
function pairOf(key: string): string {
  const partner = sidePartnerKey(key)
  return partner != null && partner < key ? partner : key
}

/**
 * The side each sided pair was last led with, keyed by {@link pairOf} — a pair no
 * session on record has trained is absent.
 *
 * Only training sessions are eligible, so a supplemental core-only session never
 * turns the alternation over, and every day type counts: a pair trained on two
 * days has one turn between them. A session that didn't train a pair says nothing
 * about it — a pull + legs day logged before the Copenhagen plank shipped, a short
 * day that left it out — so the last session that did is still what that pair
 * turns over from. Dates are YYYY-MM-DD, so a plain string compare orders them,
 * and `>=` lets a later session win a same-day tie since rows are appended
 * chronologically.
 */
function lastLeads(workouts: WorkoutRow[]): Map<string, Side> {
  const dates = new Map(trainingSessions(workouts).map((s) => [s.sessionId, s.date]))
  // The first row of each pair in each session — the side that session led it
  // with. Insertion order is row order, which the same-day tie-break then reads.
  const seen = new Set<string>()
  const latest = new Map<string, { date: string; side: Side }>()
  for (const r of workouts) {
    const side = SIDE_BY_KEY.get(r.exercise)
    const date = r.session_id ? dates.get(r.session_id) : undefined
    if (!side || date == null) continue
    const pair = pairOf(r.exercise)
    const turn = `${r.session_id}|${pair}`
    if (seen.has(turn)) continue
    seen.add(turn)
    const prev = latest.get(pair)
    if (!prev || date >= prev.date) latest.set(pair, { date, side })
  }
  return new Map([...latest].map(([pair, v]) => [pair, v.side]))
}

/**
 * The side that led `key`'s pair the last time a session trained it, or null if
 * none on record has. Either side's key asks about the same pair.
 */
export function lastStartSide(workouts: WorkoutRow[], key: string): Side | null {
  return lastLeads(workouts).get(pairOf(key)) ?? null
}

/**
 * The side each shipped one-limb-at-a-time exercise leads with right now, keyed by
 * exercise key (both halves of a pair carry the pair's answer) — whichever side its
 * last session didn't lead with, and left when there's none on record to turn over
 * from. This is what a session pins as `startSides`.
 */
export function nextStartSides(workouts: WorkoutRow[]): Record<string, Side> {
  const leads = lastLeads(workouts)
  const out: Record<string, Side> = {}
  for (const key of SIDE_BY_KEY.keys()) {
    const last = leads.get(pairOf(key))
    out[key] = last ? otherSide(last) : SIDES[0]
  }
  return out
}
