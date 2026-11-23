import { useEffect, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'

/** How long a finger rests before it counts as a hold. */
export const HOLD_MS = 450
/** How far it may wander in that time and still be holding, not scrolling. */
export const HOLD_SLOP_PX = 8

/**
 * Where a hold never starts: a field, where a long press is for the caret and
 * the paste menu; a chart, where a resting finger is reading a point (see
 * lib/useChartReadout); and anything that opts out with `data-no-hold`.
 */
const NO_HOLD = 'input, textarea, select, [contenteditable], [data-no-hold]'

export type LongPressProps = {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onClickCapture: (e: ReactMouseEvent<HTMLElement>) => void
  onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void
  style: CSSProperties
}

/**
 * Hold to edit: the one gesture the app uses for "change this" on anything
 * that isn't a form — the week calendar, a page's cards, a row of chips.
 *
 * Spread the props on the element that can be held. `onHold` is told what was
 * under the finger, so one handler on a page can tell which card it was. A
 * hold that lands on a button doesn't also press it: the click that follows
 * the lift is swallowed, once.
 *
 * The page scrolling under the finger ends the wait (the browser cancels the
 * pointer), as does lifting or straying past the slop.
 */
export function useLongPress(onHold: (target: Element) => void, disabled = false): LongPressProps {
  const press = useRef<{ pointerId: number; x: number; y: number; timer: number } | null>(null)
  const fired = useRef(false)
  const latest = useRef(onHold)
  latest.current = onHold

  const clear = () => {
    if (press.current) window.clearTimeout(press.current.timer)
    press.current = null
  }
  useEffect(() => clear, [])

  return {
    onPointerDown: (e) => {
      clear()
      fired.current = false
      if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return
      // The innermost thing that can be held takes the hold: a list inside a
      // card edits the list, not the page the card is on.
      const native = e.nativeEvent as PointerEvent & { holdClaimed?: boolean }
      if (native.holdClaimed) return
      const target = e.target as Element
      if (target.closest(NO_HOLD)) return
      native.holdClaimed = true
      press.current = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        timer: window.setTimeout(() => {
          press.current = null
          fired.current = true
          navigator.vibrate?.(10)
          latest.current(target)
        }, HOLD_MS),
      }
    },
    onPointerMove: (e) => {
      const p = press.current
      if (p && p.pointerId === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > HOLD_SLOP_PX) clear()
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onClickCapture: (e) => {
      if (!fired.current) return
      fired.current = false
      e.preventDefault()
      e.stopPropagation()
    },
    // A hold on Android raises the context menu; the hold is ours.
    onContextMenu: (e) => {
      if (!disabled) e.preventDefault()
    },
    // Nor should it select the text under it or raise iOS's callout.
    style: disabled ? {} : { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' },
  }
}
