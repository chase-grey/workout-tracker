// The on-screen keyboard shrinks a phone browser's VISUAL viewport but leaves the
// LAYOUT viewport alone — so `100dvh` keeps reporting the full screen and the chat
// input ends up hidden behind the keyboard. Mirror the visual viewport onto two
// custom properties so the app shell can size itself to the space that's actually
// on screen:
//   --vvh     the visible height
//   --vv-top  how far the browser has pushed the visual viewport down the layout one
// Only the phone media query in index.css reads them; on a desktop they just track
// the window and nothing changes.
//
// This is a FALLBACK for browsers that don't shrink the layout viewport themselves.
// Chrome/Android honours `interactive-widget=resizes-content` (see index.html) and
// shrinks the LAYOUT viewport in lockstep with the keyboard animation, which
// `100dvh` picks up natively with zero lag. The `visualViewport.resize` event, by
// contrast, only fires AFTER the keyboard has finished sliding in (~0.5s) — so
// mirroring --vvh there would override the instant native resize with a stale,
// laggy px height. Safari ignores interactive-widget entirely and never resizes any
// viewport for the keyboard, so there JS is the only option.
//
// Rather than sniff the UA for that split, measure it: `innerHeight` is the layout
// viewport, `visualViewport.height` is what's actually on screen, so a gap between
// them IS the keyboard covering content the layout doesn't know about. Only then is
// the mirror needed. That keeps the native fast path untouched wherever it works
// (the two stay equal, so --vvh is cleared and the dvh fallback wins) and still
// covers any browser where it doesn't — iOS, or an Android too old for
// interactive-widget. It can't reintroduce the lag either: on a lagging resize
// event we simply haven't run yet, so there's no stale height to override with.
//
// A gap only counts as a keyboard once it's keyboard-sized. Installed from Chrome,
// this app runs edge-to-edge — it's drawn behind the status and navigation bars —
// and there the two viewports differ by those bars' heights with no keyboard in
// sight. Mirroring that sizes the shell to the wrong box and offsets it down the
// screen by the status bar, which pushes the tail of every tab off the bottom where
// no amount of scrolling reaches it. The bars are tens of px; a keyboard takes a
// third of a phone screen, so the two don't overlap. Bars are exactly what
// `env(safe-area-inset-*)` is for, and that's who handles them (see index.css).
const KEYBOARD_MIN_PX = 120

/**
 * Fold one viewport measurement into the running "is the keyboard up?" state.
 *
 * There is no keyboard API, so the keyboard is inferred: the visible height has
 * dropped a keyboard's worth below the tallest this orientation has ever been.
 * That reads true on both browsers — iOS shrinks only the visual viewport,
 * Android with interactive-widget=resizes-content shrinks the layout one in step
 * with it, and `visible` falls either way. Measuring against a remembered
 * resting height rather than `innerHeight` is what makes the Android case
 * detectable at all: there the two shrink together, so the gap the --vvh mirror
 * below looks for stays stubbornly zero.
 *
 * The resting height is keyed to the width so a rotation starts over. Landscape
 * is shorter than the portrait resting height by more than a keyboard, which
 * would otherwise read as a keyboard that never goes away.
 */
export function foldKeyboard(
  prev: { width: number; rest: number },
  next: { width: number; visible: number },
): { width: number; rest: number; open: boolean } {
  const rest = next.width === prev.width ? Math.max(prev.rest, next.visible) : next.visible
  return { width: next.width, rest, open: rest - next.visible > KEYBOARD_MIN_PX }
}

let keyboardOpen = false
const keyboardListeners = new Set<() => void>()

/** Whether an on-screen keyboard is currently covering the bottom of the screen. */
export function isKeyboardOpen(): boolean {
  return keyboardOpen
}

/** Subscribe to keyboard open/close; returns the unsubscribe. */
export function onKeyboardChange(notify: () => void): () => void {
  keyboardListeners.add(notify)
  return () => {
    keyboardListeners.delete(notify)
  }
}

export function trackVisualViewport(): void {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement
  let resting = { width: 0, rest: 0 }
  const apply = () => {
    // Scale confuses the comparison (a pinch-zoomed vv is smaller for reasons that
    // have nothing to do with a keyboard), so measure at the layout's own scale.
    const visible = vv.height * vv.scale

    const folded = foldKeyboard(resting, { width: window.innerWidth, visible })
    resting = { width: folded.width, rest: folded.rest }
    if (folded.open !== keyboardOpen) {
      keyboardOpen = folded.open
      for (const notify of keyboardListeners) notify()
    }

    if (window.innerHeight - visible > KEYBOARD_MIN_PX) {
      // The shell is offset by --vv-top, so it can only be as tall as what's left
      // below that — otherwise it hangs off the bottom of the screen and takes the
      // end of the scroller with it.
      const height = Math.min(visible, window.innerHeight - vv.offsetTop)
      root.style.setProperty('--vvh', `${Math.round(height)}px`)
      root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`)
    } else {
      // The layout viewport is tracking the keyboard on its own — hand the shell
      // back to `100dvh`, which follows it with no event-loop delay.
      root.style.removeProperty('--vvh')
      root.style.removeProperty('--vv-top')
    }
  }
  apply()
  vv.addEventListener('resize', apply)
  vv.addEventListener('scroll', apply)
  // Where interactive-widget shrinks the layout viewport, that resize lands here
  // as the keyboard slides in rather than waiting for vv's end-of-animation
  // event — so the nav gets out of the way sooner.
  window.addEventListener('resize', apply)
}
