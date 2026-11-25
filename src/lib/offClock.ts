/**
 * The time a session spends off its own clock: under the pause curtain, on a
 * stretch routine's photo screens, and on its "ready?" screen waiting for the
 * tap that says the gear is in hand.
 *
 * A pause is you saying the session has stopped. A photo moment stops it just
 * as surely: lining the phone up, the shot, dragging the handles onto the
 * joints, the answer to "save this photo?". Neither is work and neither is the
 * rest the plan prescribed, and how long either takes says nothing about how
 * the session is going. So the session's clock stands still through both — the
 * mark on the progress bar, the checklist's "so far", the time charged to each
 * set, the rest tally and the length that gets logged are all read with this
 * time taken out.
 *
 * The wait on "ready?" is the same kind of time. It lasts as long as putting the
 * ball away and finding the strap lasts, and the count that follows the tap is
 * where the session picks up again.
 *
 * Kept as banked seconds plus the start of the stretch now running, the way the
 * rest tally is (see lib/rest), and saved with the session for the same reason:
 * its length is measured from a persisted `startedAt`, so a tally that restarted
 * at zero on a reload would hand the minutes straight back.
 *
 * Pure module — no React/DOM.
 */
export type OffClock = {
  /** Seconds off the clock in stretches that have ended. */
  takenSec: number
  /** When the stretch now running began (epoch ms); 0 when the session is on its clock. */
  since: number
}

export const ON_THE_CLOCK: OffClock = { takenSec: 0, since: 0 }

/** The session stopped. A stretch already running keeps its own start. */
export function stepOff(clock: OffClock, now: number): OffClock {
  return clock.since ? clock : { ...clock, since: now }
}

/** Seconds the stretch now running has lasted; 0 when the session is on its clock. */
export function runningOffSec(clock: OffClock, now: number): number {
  return clock.since ? Math.max(0, (now - clock.since) / 1000) : 0
}

/** The session picked up again: the stretch's seconds join the banked ones. */
export function stepOn(clock: OffClock, now: number): OffClock {
  return { takenSec: clock.takenSec + runningOffSec(clock, now), since: 0 }
}

/** Seconds off the clock so far, a stretch still running included. */
export function offSecAt(clock: OffClock, now: number): number {
  return clock.takenSec + runningOffSec(clock, now)
}

/**
 * How much of the stretch now running falls after `fromMs` — the part of a rest
 * that began at `fromMs` which was spent paused, and so isn't rest. A pause
 * opened before the rest only overlaps it from the rest's start.
 */
export function runningOffSecSince(clock: OffClock, fromMs: number, now: number): number {
  return clock.since ? Math.max(0, (now - Math.max(clock.since, fromMs)) / 1000) : 0
}

/**
 * A saved tally as the session resumes. A stretch that was running at the
 * reload goes on running from its own start: the session comes back under the
 * curtain, or on the photo screen, it left from, and the minutes the page was
 * gone stay off the clock. `opening` starts one now, for a session that opens
 * straight onto a photo screen.
 */
export function resumeOffClock(saved: OffClock | null | undefined, opening: boolean, now: number): OffClock {
  const takenSec = Math.max(0, saved?.takenSec ?? 0)
  const since = saved?.since && saved.since > 0 && saved.since <= now ? saved.since : 0
  return { takenSec, since: since || (opening ? now : 0) }
}

/** How long the session itself has run: the wall clock since `startMs`, less the time off it. */
export function sessionElapsedSec(startMs: number, now: number, clock: OffClock): number {
  return Math.max(0, (now - startMs) / 1000 - offSecAt(clock, now))
}
