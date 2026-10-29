import { useRef, type PointerEvent as ReactPointerEvent } from 'react'

const SLOP_PX = 24

/**
 * Spread onto a card whose taps are its own — the set card, where a tap is a
 * reach for the weight or reps field — so the screen tap passes over it the way
 * it passes over a button. The blank screen around the card keeps advancing.
 */
export const TAP_SHIELD = { 'data-tap-shield': '' } as const

const CONTROL_SELECTOR = 'button, input, label, a, [data-tap-shield]'

/**
 * Pointer handlers for a screen-wide tap that is not meant for a control. The
 * action is told where the tap landed, for a caller that marks the spot.
 */
export function useScreenTap(action: (at: { x: number; y: number }) => void, enabled = true) {
  const press = useRef<{ id: number; x: number; y: number } | null>(null)

  const isControl = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest(CONTROL_SELECTOR)

  const cancel = () => {
    press.current = null
  }

  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || isControl(e.target)) return
      press.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const start = press.current
      cancel()
      if (!start || start.id !== e.pointerId || !enabled) return
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) <= SLOP_PX) action({ x: e.clientX, y: e.clientY })
    },
    onPointerCancel: cancel,
  }
}
