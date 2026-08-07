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

export function trackVisualViewport(): void {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement
  const apply = () => {
    // Scale confuses the comparison (a pinch-zoomed vv is smaller for reasons that
    // have nothing to do with a keyboard), so measure at the layout's own scale.
    const visible = vv.height * vv.scale
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
}
