/**
 * The last few things that happened around the back button, and the two
 * verdicts read off them: "this screen is blank" and "the app was reopened
 * right after a back press".
 *
 * A back press that leaves the phone on bare ground has so far thrown nothing
 * and reported nothing, and can't be made to happen on a desktop. So the phone
 * keeps a short trail — each press, each guard entry pushed or dropped, each
 * load and how it was reached — and sends it along the moment the screen is
 * found empty (see services/screenWatch). The trail is what says which press,
 * over which history stack, got there.
 *
 * Pure module — no React/DOM.
 */

export type TrailEvent = {
  /** Epoch ms. */
  t: number
  /** What happened: `load`, `back`, `guard+`, `guard-`, `shown`, `hidden`, … */
  e: string
  [detail: string]: unknown
}

export const TRAIL_MAX = 40

/** The trail with `event` on the end, cut to the newest {@link TRAIL_MAX}. */
export function appendEvent(trail: TrailEvent[], event: TrailEvent, max = TRAIL_MAX): TrailEvent[] {
  const next = [...trail, event]
  return next.length > max ? next.slice(next.length - max) : next
}

/** What one look at the screen found. */
export type ScreenProbe = {
  /** Elements directly under `#root`: none means React has nothing mounted. */
  rootChildren: number
  /** The app shell's height, or null when there is no shell on the page. */
  shellHeight: number | null
  viewportHeight: number
  /** Points across the screen that were looked at. */
  sampled: number
  /** How many of them landed on something with text or a picture in it. */
  drawn: number
}

/** A shell under this share of the screen is a collapsed one, keyboard or not. */
const COLLAPSED_SHARE = 0.25

/** Why this screen counts as blank, or null when something is on it. */
export function blankReason(p: ScreenProbe): string | null {
  if (p.sampled === 0 || p.viewportHeight <= 0) return null
  if (p.rootChildren === 0) return 'nothing mounted'
  if (p.drawn === 0) return 'nothing drawn'
  if (p.shellHeight != null && p.shellHeight < p.viewportHeight * COLLAPSED_SHARE) {
    return `shell collapsed to ${Math.round(p.shellHeight)}px of ${Math.round(p.viewportHeight)}px`
  }
  return null
}

/** How soon after a back press a fresh load is read as a reaction to it. */
export const REOPEN_WINDOW_MS = 30_000

/**
 * What the load now starting says about the one before it, or null when it
 * says nothing.
 *
 * Two things are worth a report. A load the browser reached by going back or
 * forward: the guard is meant to keep a back press inside the document, so the
 * document being navigated at all is the press getting past it. And a load
 * seconds after a back press: closing and reopening the app is the only way
 * out of a blank screen, so that is what a blank screen the probe missed looks
 * like from here.
 */
export function loadVerdict(
  previous: TrailEvent[],
  navigation: string | undefined,
  now: number,
): string | null {
  if (navigation === 'back_forward') return 'a back press loaded the page again'
  for (let i = previous.length - 1; i >= 0; i--) {
    const ev = previous[i]
    if (ev.e === 'load') return null
    // A pop of the app's own — a guard it dropped — isn't a press.
    if (ev.e !== 'back' || ev.ours === true) continue
    const age = now - ev.t
    if (age < 0 || age > REOPEN_WINDOW_MS) return null
    return `reopened ${Math.round(age / 1000)}s after a back press (${navigation ?? 'unknown'})`
  }
  return null
}
