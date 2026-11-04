import {
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

/** How far a finger may drift between press and release and still count as a tap. */
const SLOP_PX = 24

/**
 * How long after the release the browser's trailing `click` is waited for. It
 * follows within a few milliseconds on touch, so this is generous; a second,
 * deliberate tap inside the window is not something a thumb manages.
 */
const GHOST_CLICK_MS = 400

/**
 * Eat the one `click` the browser synthesizes after a release we have already
 * acted on, wherever it lands. Capture phase on the window, so it is gone before
 * React's root listener — and so any handler the page has — sees it.
 */
function swallowNextClick() {
  const off = () => {
    window.removeEventListener('click', eat, true)
    window.clearTimeout(timer)
  }
  const eat = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    off()
  }
  window.addEventListener('click', eat, true)
  const timer = window.setTimeout(off, GHOST_CLICK_MS)
}

/**
 * Handlers that make a tap fire reliably on touch, for buttons pressed straight
 * out of a focused input.
 *
 * The browser's own `click` needs press and release to hit-test onto the same
 * element, and here they often don't: the press blurs the weight/reps field, the
 * on-screen keyboard closes, and the page reflows out from under the finger
 * before it lifts. The button lights up (`:active` fires on press) but never
 * fires. Capturing the pointer pins the whole gesture to this element, so the
 * release lands on it whatever the layout did in between. A real scroll still
 * cancels the press, and small drift is forgiven rather than swallowed.
 *
 * The browser still emits its compatibility `click` after the release, hit-tested
 * afresh at the same coordinates — and by then the action has run and whatever it
 * put on screen is what the click lands on. That is how the finish button's own
 * click used to press "nice" on the recap that had just replaced it, so the recap
 * was dismissed before it was ever seen. The release therefore eats the next
 * click anywhere on the page, not only one that comes back to this element.
 */
export function usePressAction(action: () => void) {
  const press = useRef<{ id: number; x: number; y: number } | null>(null)

  const end = () => {
    press.current = null
  }

  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      press.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const start = press.current
      end()
      if (!start || start.id !== e.pointerId) return
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP_PX) return
      swallowNextClick()
      action()
    },
    // Scrolling, a system gesture, or a lost pointer: the press never happened.
    onPointerCancel: end,
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      action()
    },
    // Pointer handling replaces the click. The release above already eats the
    // synthesized one wherever it lands; this covers a click that reaches the
    // element by another route — a form submit, an assistive tap — so none can
    // advance a second set from one press.
    onClick: (e: ReactMouseEvent<HTMLElement>) => e.preventDefault(),
    style: { touchAction: 'manipulation' as const },
  }
}
