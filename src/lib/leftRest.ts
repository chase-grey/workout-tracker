/**
 * The rest a tap just cut short, kept so Android back can step into it again.
 *
 * Dismissing a rest is a navigation like any other in the session, and back
 * should undo it: a thumb that brushed the screen forty seconds into a two-minute
 * rest shouldn't cost the rest. What back returns to is the rest as it was left
 * — the same seconds still on the clock, counting on from there — rather than a
 * fresh full rest (that's the menu's "back to rest") or the wall clock's view of
 * it (which, having been tapped past and come back to, could already be over).
 *
 * Only a rest with time left is worth going back to. One that ran out — under
 * hands-free, or tapped past in overtime — was had in full, and back has nothing
 * to restore; it falls through to whatever claims it next (see useBackGuard).
 *
 * Pure module — no React/DOM. `R` is whichever rest shape the session keeps.
 */

type Timed = { seconds: number; endsAt: number }

export type LeftRest<R extends Timed> = {
  rest: R
  /** What was still on the clock when the tap landed. */
  remainingMs: number
}

/** The rest being left at `now`, or null when it had already run out. */
export function leaveRest<R extends Timed>(rest: R, now: number): LeftRest<R> | null {
  const remainingMs = rest.endsAt - now
  return remainingMs > 0 ? { rest, remainingMs } : null
}

/** The left rest, running again from the second it was left at. */
export function resumeLeftRest<R extends Timed>(left: LeftRest<R>, now: number): R {
  return { ...left.rest, endsAt: now + left.remainingMs }
}
