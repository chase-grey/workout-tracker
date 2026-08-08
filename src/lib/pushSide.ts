/**
 * Which side leads a session's one-limb-at-a-time work.
 *
 * Lateral raises run one arm at a time (see PlannedExercise.side), and whichever
 * arm goes first is the one done fresh — the other follows it, and inside the arm
 * circuit it follows another lap of the stations too. Left every time would hand
 * that advantage to the same arm forever, so the lead alternates:
 *
 *   1st push session ever → left, 2nd → right, 3rd → left, …
 *
 * A straight running count, unlike the A/B press variant, which resets each week
 * (see lib/pushVariant). The ask here is simply "a different side each time", and
 * a per-week reset would repeat a side across every week boundary with an odd
 * number of sessions in it.
 *
 * Counted off logged history rather than a stored toggle, so it survives a
 * reinstall and stays consistent across devices. Only completed sessions count:
 * starting a workout and abandoning it doesn't burn a turn. Pure module — no
 * React/DOM, no storage.
 */

import type { DayType, Side, WorkoutRow } from '../types'
import { trainingSessions } from './session'

/** Both sides, in the order they first lead. */
export const SIDES: Side[] = ['left', 'right']

/** The side that leads the nth session of a day, counting n from 0. */
export function sideForIndex(index: number): Side {
  return index % 2 === 0 ? 'left' : 'right'
}

/** The other arm — for the "actually, start me on the other side" override. */
export function otherSide(side: Side): Side {
  return side === 'left' ? 'right' : 'left'
}

/** How many sessions of `dayType` are already logged, over all of history. */
export function sessionsLogged(workouts: WorkoutRow[], dayType: DayType): number {
  return trainingSessions(workouts).filter((s) => s.dayType === dayType).length
}

/**
 * The side to lead with for `dayType` right now — the opposite of whichever side
 * led the last one, and left for the very first session of the day.
 */
export function nextStartSide(workouts: WorkoutRow[], dayType: DayType): Side {
  return sideForIndex(sessionsLogged(workouts, dayType))
}
