import { useRef, type PointerEvent as ReactPointerEvent } from 'react'

const SLOP_PX = 24

/**
 * Pointer handlers for a screen-wide tap that is not meant for a control. The
 * action is told where the tap landed, for a caller that marks the spot.
 */
export function useScreenTap(action: (at: { x: number; y: number }) => void, enabled = true) {
  const press = useRef<{ id: number; x: number; y: number } | null>(null)

  const isControl = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest('button, input, label, a')

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
