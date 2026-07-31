import {
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

/** How far a finger may drift between press and release and still count as a tap. */
const SLOP_PX = 24

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
      action()
    },
    // Scrolling, a system gesture, or a lost pointer: the press never happened.
    onPointerCancel: end,
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      action()
    },
    // Pointer handling replaces the click, so don't let a synthesized one
    // through as well — that would advance two sets from one tap.
    onClick: (e: ReactMouseEvent<HTMLElement>) => e.preventDefault(),
    style: { touchAction: 'manipulation' as const },
  }
}
