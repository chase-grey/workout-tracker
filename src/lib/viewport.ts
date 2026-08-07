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
// This is an iOS-ONLY fallback. Chrome/Android honours `interactive-widget=
// resizes-content` (see index.html) and shrinks the LAYOUT viewport in lockstep
// with the keyboard animation, which `100dvh` picks up natively with zero lag.
// The `visualViewport.resize` event, by contrast, only fires on Android AFTER the
// keyboard has finished sliding in (~0.5s) — so mirroring --vvh there would
// override the instant native resize with a stale, laggy px height. Safari ignores
// interactive-widget entirely and never resizes any viewport for the keyboard, so
// there JS is the only option. Gate on that: run only where it's actually needed.
function keyboardResizesLayoutViewport(): boolean {
  // True when the browser shrinks the layout viewport for the keyboard on its own
  // (Chrome/Android + interactive-widget). iOS/iPadOS WebKit does not — it needs
  // the JS mirror below.
  if (typeof navigator === 'undefined') return true
  const ua = navigator.userAgent || ''
  const iOS =
    /iP(hone|od|ad)/.test(ua) ||
    (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document)
  return !iOS
}

export function trackVisualViewport(): void {
  const vv = window.visualViewport
  if (!vv) return
  // On everything but iOS, let the native layout-viewport resize + `100dvh` drive
  // the shell — mirroring --vvh here would only add the Android resize-event lag.
  if (keyboardResizesLayoutViewport()) return
  const root = document.documentElement
  const apply = () => {
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`)
    root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`)
  }
  apply()
  vv.addEventListener('resize', apply)
  vv.addEventListener('scroll', apply)
}
