/**
 * How the screen under the tab bar arrives when what it shows changes.
 *
 * Arrivals only: the screen you left is gone the moment you tap, and the new one
 * is already there and already takes taps while it settles. Nothing here waits
 * on an animation, so nothing here can make the app feel slower than a cut.
 */

/**
 * What the shell is showing: a tab, or a session that owns the screen.
 * `session` is whether one is running at all, on screen or set aside.
 */
export type Screen = { tab: string; immersive: boolean; session: boolean }

/**
 * `left` and `right` are where the new tab comes in from, so the screen travels
 * the way the thumb just did along the bar.
 */
export type ScreenMove = 'left' | 'right' | 'rise' | 'return' | 'settle'

/**
 * The arrival for going from `prev` to `next`, or null for no move at all.
 * `tabs` is the bar's order, left to right.
 */
export function screenMove(prev: Screen, next: Screen, tabs: readonly string[]): ScreenMove | null {
  if (next.immersive !== prev.immersive) {
    if (!next.immersive) return 'settle'
    // A session that just started fades its own first screen in (useSessionFade);
    // one picked back up was mounted all along and has no fade of its own.
    return prev.session ? 'return' : 'rise'
  }
  // A tab changing underneath a session or a recap isn't on screen to be seen.
  if (next.immersive || next.tab === prev.tab) return null
  const from = tabs.indexOf(prev.tab)
  const to = tabs.indexOf(next.tab)
  // A tab that isn't on the bar has no side to come from; it reads as further on.
  if (from < 0 || to < 0) return 'right'
  return to > from ? 'right' : 'left'
}

export const SCREEN_MOVE_MS = 180

/** Front-loaded: most of the distance is covered in the first few frames. */
export const SCREEN_MOVE_EASING = 'cubic-bezier(0.2, 0, 0, 1)'

/**
 * Transform and opacity only, so the compositor can run it without a layout.
 * A starting session only travels: faded here as well as by itself, it would
 * spend its first frames at a fade of a fade, darker than either meant.
 */
export function screenMoveKeyframes(move: ScreenMove): Keyframe[] {
  const from: Record<ScreenMove, string> = {
    left: 'translateX(-14px)',
    right: 'translateX(14px)',
    rise: 'translateY(12px)',
    return: 'translateY(12px)',
    settle: 'scale(0.985)',
  }
  return [
    { opacity: move === 'rise' ? 1 : 0, transform: from[move] },
    { opacity: 1, transform: 'none' },
  ]
}
