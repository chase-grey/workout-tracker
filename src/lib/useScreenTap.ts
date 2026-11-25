import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

const SLOP_PX = 24

/**
 * Spread onto something drawn over a session whose taps are its own (a sheet
 * that bubbles its events back into the tap zone), so the tap passes over it
 * the way it passes over a button.
 */
export const TAP_SHIELD = { 'data-tap-shield': '' } as const

/** Marks the tap zone itself, so a script can find where to tap. */
export const TAP_ZONE = { 'data-tap-zone': '' } as const

const CONTROL_SELECTOR = 'button, input, label, a, [data-tap-shield]'

/**
 * Pointer handlers for the tap that advances a session, spread onto the tap
 * zone: the blank space under the set's content, or a guide with nothing in it
 * to edit. The header and the cards sit outside the zone, so a tap on or around
 * them is never a set finished. The action is told where the tap landed, for a
 * caller that marks the spot.
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

/** The least blank space under the cards that still counts as a target. */
export const MIN_TAP_ZONE_PX = 96

/** Whether the blank space left under the cards is too little to aim a tap at. */
export const tapZoneCramped = (heightPx: number) => heightPx < MIN_TAP_ZONE_PX

/**
 * Watches the blank space under a set's cards. When the cards fill the screen
 * and leave none worth aiming at, `cramped` asks the session for a `done`
 * button instead. The button takes room of its own out of the zone, so it stays
 * until there is space for the zone without it, rather than flickering at the
 * threshold.
 */
export function useTapZone() {
  const [cramped, setCramped] = useState(false)
  const observer = useRef<ResizeObserver | null>(null)
  const ref = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el) {
      setCramped(false)
      return
    }
    const measure = () => setCramped(tapZoneCramped(el.getBoundingClientRect().height))
    measure()
    observer.current = new ResizeObserver(measure)
    observer.current.observe(el)
  }, [])
  return { ref, cramped }
}
