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
// shrinks the LAYOUT viewport itself, which
// `100dvh` picks up natively, though not until the keyboard has arrived (expectKeyboard
// below covers the wait). The `visualViewport.resize` event, by
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

let measuredOpen = false
const keyboardListeners = new Set<() => void>()

// The browser only says the keyboard is up once it has arrived: Chrome resizes
// the layout viewport when Gboard has finished sliding in, not alongside it, so
// a composer that waits for the resize sits covered for the length of the
// animation and then pops into place. The keyboard is the same height every
// time, though, so remember it, and when a field that is about to raise it is
// tapped, take that much off the shell straight away (--kb-lift, index.css) on
// a transition the length of the keyboard's own. The measured resize then lands
// on a shell that is already the right height: the lift is dropped in the same
// handler, before the frame is drawn, and nothing moves.
//
// Only a keyboard that shrank the LAYOUT viewport is remembered. That is the
// height the shell will lose, which is not the visual viewport's drop when the
// app is drawn edge-to-edge behind the system bars; and it leaves iOS, where
// the layout never shrinks and --vvh does the work, exactly as it was.
const KEYBOARD_HEIGHT_KEY = 'keyboardHeight'
/** How long to believe a tap before deciding no keyboard is coming. */
const EXPECT_MS = 1000

/** The height stored for a screen this wide, or 0 if there is none to trust. */
export function rememberedKeyboardHeight(stored: string | null, width: number): number {
  if (!stored) return 0
  try {
    const { w, h } = JSON.parse(stored) as { w?: unknown; h?: unknown }
    return w === width && typeof h === 'number' && h > KEYBOARD_MIN_PX ? h : 0
  } catch {
    return 0
  }
}

let expected = false
let expectTimer = 0
let storedHeight: string | null | undefined

function readStoredHeight(): string | null {
  if (storedHeight === undefined) {
    try {
      storedHeight = localStorage.getItem(KEYBOARD_HEIGHT_KEY)
    } catch {
      storedHeight = null
    }
  }
  return storedHeight
}

function rememberKeyboardHeight(width: number, height: number): void {
  const next = JSON.stringify({ w: width, h: Math.round(height) })
  if (next === readStoredHeight()) return
  storedHeight = next
  try {
    localStorage.setItem(KEYBOARD_HEIGHT_KEY, next)
  } catch {
    // Private mode or a full disk: the lift just won't survive a reload.
  }
}

// Chromium has a real answer to all of the above: the VirtualKeyboard API. Asked
// to (overlaysContent), the browser stops resizing anything for the keyboard,
// lets it slide over the page, and says how tall it is (geometrychange). Then
// nothing on screen moves except what this file moves, on this file's own
// transition, and there is no browser resize to arrive early, late or in one
// jump. The page under the keyboard stays where it is, so the nav really is
// covered rather than stood down, and only the shell's foot grows to hold the
// composer clear (--kb-cover, index.css).
//
// Only the coach asks for it (overlayKeyboard): every other field in the app
// still counts on the viewport shrinking to stay in view.
type VirtualKeyboard = EventTarget & { overlaysContent: boolean; boundingRect: DOMRectReadOnly }

function virtualKeyboard(): VirtualKeyboard | undefined {
  return (navigator as Navigator & { virtualKeyboard?: VirtualKeyboard }).virtualKeyboard
}

/** The keyboard is drawn over the page rather than resizing it. */
let overlaying = false
/** How much of the page the overlaid keyboard covers, 0 when it is away. */
let coverHeight = 0

/**
 * What the shell should give up for the keyboard, and through which property.
 * A keyboard drawn over the page is cleared with --kb-cover for as long as it
 * is up. One that resizes the page is only anticipated, with --kb-lift, until
 * the resize lands.
 */
export function keyboardRoom(state: {
  overlaying: boolean
  cover: number
  expected: boolean
  remembered: number
}): { cover: number; lift: number } {
  const anticipated = state.expected ? state.remembered : 0
  if (state.overlaying) return { cover: state.cover || anticipated, lift: 0 }
  return { cover: 0, lift: anticipated }
}

function syncRoom(): void {
  const { cover, lift } = keyboardRoom({
    overlaying,
    cover: coverHeight,
    expected,
    remembered: expected ? rememberedKeyboardHeight(readStoredHeight(), window.innerWidth) : 0,
  })
  const style = document.documentElement.style
  if (cover) style.setProperty('--kb-cover', `${cover}px`)
  else style.removeProperty('--kb-cover')
  if (lift) style.setProperty('--kb-lift', `${lift}px`)
  else style.removeProperty('--kb-lift')
}

function notifyKeyboard(): void {
  for (const notify of keyboardListeners) notify()
}

function dropExpectation(): void {
  expected = false
  window.clearTimeout(expectTimer)
  syncRoom()
}

/**
 * A field has been tapped and the keyboard is on its way: make room for it now
 * rather than when the browser reports it. Does nothing until a keyboard has
 * been measured on this screen once, or while one is already up.
 */
export function expectKeyboard(): void {
  if (measuredOpen || coverHeight || expected) return
  startTrace()
  const height = rememberedKeyboardHeight(readStoredHeight(), window.innerWidth)
  if (!height) return
  expected = true
  syncRoom()
  // A hardware keyboard, or a focus the system declined to raise one for.
  expectTimer = window.setTimeout(() => {
    dropExpectation()
    notifyKeyboard()
  }, EXPECT_MS)
  notifyKeyboard()
}

/**
 * Have the keyboard slide over the page instead of resizing it, where the
 * browser can (see above); returns the undo. A no-op elsewhere, which leaves
 * the resize and the --vvh mirror doing the work as before.
 */
export function overlayKeyboard(): () => void {
  const vk = virtualKeyboard()
  if (!vk) return () => {}
  const onGeometry = () => {
    const height = Math.round(vk.boundingRect.height)
    trace('geometry', height)
    const was = isKeyboardOpen()
    coverHeight = height > KEYBOARD_MIN_PX ? height : 0
    if (coverHeight) {
      rememberKeyboardHeight(window.innerWidth, coverHeight)
      expected = false
      window.clearTimeout(expectTimer)
    }
    syncRoom()
    if (isKeyboardOpen() !== was) notifyKeyboard()
  }
  overlaying = true
  vk.overlaysContent = true
  vk.addEventListener('geometrychange', onGeometry)
  return () => {
    vk.removeEventListener('geometrychange', onGeometry)
    vk.overlaysContent = false
    const was = isKeyboardOpen()
    overlaying = false
    coverHeight = 0
    syncRoom()
    if (isKeyboardOpen() !== was) notifyKeyboard()
  }
}

/** The keyboard is drawn over the page, so what sits under it can stay put. */
export function keyboardCoversPage(): boolean {
  return overlaying
}

/**
 * Whether an on-screen keyboard is covering the bottom of the screen, or is
 * expected to within the moment (see expectKeyboard).
 */
export function isKeyboardOpen(): boolean {
  return measuredOpen || coverHeight > 0 || expected
}

// What the browser actually did around one keyboard coming up, so the slide can
// be judged from the phone that showed it rather than from a desktop: every
// viewport and geometry change in the second and a half after the field was
// reached for, each stamped with the milliseconds since. Handed to whoever
// asked (main.tsx reports it); the first one of a page load only.
export type KeyboardTrace = {
  overlay: boolean
  remembered: number
  events: { ms: number; what: string; value: number; inner: number; visual: number }[]
}
const TRACE_MS = 1500
const TRACE_MAX = 60
let traceSink: ((t: KeyboardTrace) => void) | undefined
let tracing: KeyboardTrace | undefined
let traceStart = 0
let traced = false

/** Receive the first keyboard trace of this page load. */
export function onKeyboardTrace(sink: (t: KeyboardTrace) => void): void {
  traceSink = sink
}

function trace(what: string, value: number): void {
  if (!tracing || tracing.events.length >= TRACE_MAX) return
  tracing.events.push({
    ms: Math.round(performance.now() - traceStart),
    what,
    value,
    inner: window.innerHeight,
    visual: Math.round(window.visualViewport?.height ?? 0),
  })
}

function startTrace(): void {
  if (traced || !traceSink) return
  traced = true
  traceStart = performance.now()
  tracing = {
    overlay: overlaying,
    remembered: rememberedKeyboardHeight(readStoredHeight(), window.innerWidth),
    events: [],
  }
  trace('tap', 0)
  window.setTimeout(() => {
    const done = tracing
    tracing = undefined
    if (done) traceSink?.(done)
  }, TRACE_MS)
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
  let restingLayout = { width: 0, rest: 0 }
  const apply = () => {
    // Scale confuses the comparison (a pinch-zoomed vv is smaller for reasons that
    // have nothing to do with a keyboard), so measure at the layout's own scale.
    const visible = vv.height * vv.scale

    const folded = foldKeyboard(resting, { width: window.innerWidth, visible })
    resting = { width: folded.width, rest: folded.rest }
    const was = isKeyboardOpen()
    // The keyboard this was waiting for is here, and the layout has shrunk by
    // its height: stop subtracting it a second time.
    if (folded.open && expected) dropExpectation()
    measuredOpen = folded.open
    if (isKeyboardOpen() !== was) notifyKeyboard()

    const layout = foldKeyboard(restingLayout, {
      width: window.innerWidth,
      visible: window.innerHeight,
    })
    restingLayout = { width: layout.width, rest: layout.rest }
    if (layout.open) rememberKeyboardHeight(layout.width, layout.rest - window.innerHeight)

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
  vv.addEventListener('resize', () => {
    trace('visual', Math.round(vv.height))
    apply()
  })
  vv.addEventListener('scroll', apply)
  // Where interactive-widget shrinks the layout viewport, that resize lands here
  // as the keyboard slides in rather than waiting for vv's end-of-animation
  // event — so the nav gets out of the way sooner.
  window.addEventListener('resize', () => {
    trace('layout', window.innerHeight)
    apply()
  })
}
