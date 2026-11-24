/**
 * The time a session spends on its photo screens, kept apart from the session.
 *
 * A photo moment stops the routine: lining the phone up, the shot, dragging the
 * handles onto the joints, the answer to "save this photo?". None of it is
 * stretching and none of it is rest, and how long it takes says nothing about
 * how the routine is going. So the session's own clock stands still while a
 * photo screen is up — the mark on the progress bar, the checklist's "so far",
 * the time charged to each set and the length that gets logged are all read off
 * what is left once this tally is taken out.
 *
 * Kept as banked seconds plus the start of the screen now open, the way the rest
 * tally is (see lib/rest), and saved with the session for the same reason: its
 * length is measured from a persisted `startedAt`, so a tally that restarted at
 * zero on a reload would hand the camera's minutes back to the stretching.
 *
 * Pure module — no React/DOM.
 */
export type PhotoTally = {
  /** Seconds on photo screens that have closed. */
  takenSec: number
  /** When the photo screen now up opened (epoch ms); 0 when none is. */
  since: number
}

export const NO_PHOTO_TIME: PhotoTally = { takenSec: 0, since: 0 }

/** A photo screen opened. One already running keeps its own start. */
export function openPhotoTime(tally: PhotoTally, now: number): PhotoTally {
  return tally.since ? tally : { ...tally, since: now }
}

/** Seconds the photo screen now up has been open; 0 when none is. */
export function openPhotoSec(tally: PhotoTally, now: number): number {
  return tally.since ? Math.max(0, (now - tally.since) / 1000) : 0
}

/** The photo screen closed: its seconds join the banked ones. */
export function closePhotoTime(tally: PhotoTally, now: number): PhotoTally {
  return { takenSec: tally.takenSec + openPhotoSec(tally, now), since: 0 }
}

/** Seconds on photo screens so far, one still open included. */
export function photoSecAt(tally: PhotoTally, now: number): number {
  return tally.takenSec + openPhotoSec(tally, now)
}

/**
 * A saved tally as the session resumes. A screen that was open at the reload
 * goes on running from its own start if the session reopens it, and is dropped
 * if it doesn't: with no screen there is nothing to close it, and it would run
 * the session's clock backwards for good.
 */
export function resumePhotoTime(saved: PhotoTally | null | undefined, reopened: boolean, now: number): PhotoTally {
  const takenSec = Math.max(0, saved?.takenSec ?? 0)
  if (!reopened) return { takenSec, since: 0 }
  return { takenSec, since: saved?.since && saved.since <= now ? saved.since : now }
}

/** How long the session itself has run: the wall clock since `startMs`, photo screens out. */
export function sessionElapsedSec(startMs: number, now: number, tally: PhotoTally): number {
  return Math.max(0, (now - startMs) / 1000 - photoSecAt(tally, now))
}
