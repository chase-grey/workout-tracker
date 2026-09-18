import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import { type Gesture, gestureFrom } from './chartReadout'

/** Share Recharts' selection between the dot and popup, including touch scrubs. */
export function useChartReadout() {
  const card = useRef<HTMLDivElement>(null)
  const resolving = useRef(false)
  const [open, setOpen] = useState(false)
  const touch = useRef<{ x: number; y: number; gesture: Gesture } | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!card.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  // Recharts updates its hover selection on mousemove and touchmove, but not
  // touchstart/end. Feed taps through that same coordinate resolver. Counting
  // visible dots cannot yield a data index: merged rows may have no visible dot.
  const selectTouch = (e: { clientX: number; clientY: number }, onlyIfClamped = false) => {
    const chart = card.current?.querySelector('.recharts-wrapper')
    const plot = chart?.querySelector('.recharts-cartesian-grid')?.getBoundingClientRect()
    // Edge dots straddle the plot boundary. Keep rounding of touch coordinates
    // from pushing a tap just outside the selectable area; scrubs may drift.
    const scrubbing = touch.current?.gesture === 'scrub'
    const nearPlot = plot && e.clientX >= plot.left - 24 && e.clientX <= plot.right + 24
      && e.clientY >= plot.top - 24 && e.clientY <= plot.bottom + 24
    const clamp = (value: number, lo: number, hi: number) => Math.max(lo + 1, Math.min(hi - 1, value))
    const clientX = plot && (nearPlot || scrubbing) ? clamp(e.clientX, plot.left, plot.right) : e.clientX
    const clientY = plot && (nearPlot || scrubbing) ? clamp(e.clientY, plot.top, plot.bottom) : e.clientY
    if (onlyIfClamped && clientX === e.clientX && clientY === e.clientY) return false
    if (resolving.current) return false
    resolving.current = true
    try {
      chart?.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, clientX, clientY,
      }))
    } finally {
      resolving.current = false
    }
    return true
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse') return
    touch.current = { x: e.clientX, y: e.clientY, gesture: 'tap' }
    selectTouch(e)
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse') return
    const down = touch.current
    if (!down || down.gesture === 'scroll') return
    if (down.gesture === 'tap') down.gesture = gestureFrom(e.clientX - down.x, e.clientY - down.y)
    if (down.gesture === 'scroll') setOpen(false)
    else selectTouch(e)
  }
  const onPointerUp = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse' && touch.current?.gesture === 'tap') selectTouch(e)
    touch.current = null
  }
  const onPointerCancel = () => {
    touch.current = null
    setOpen(false)
  }
  const onSelection = (state: { activeIndex?: string | number | null; isTooltipActive?: boolean }, e: { clientX?: number; clientY?: number; type: string }) => {
    if (touch.current?.gesture === 'scroll') return
    if (!state.isTooltipActive && e.clientX != null && e.clientY != null
      && selectTouch({ clientX: e.clientX, clientY: e.clientY }, true)) return
    setOpen(state.activeIndex != null && state.isTooltipActive !== false)
  }

  return {
    card: {
      ref: card, onPointerDown, onPointerMove, onPointerUp, onPointerCancel,
      style: { touchAction: 'pan-y' },
    },
    chart: { accessibilityLayer: false, onMouseMove: onSelection, onClick: onSelection, onTouchMove: onSelection, throttleDelay: 0 },
    tooltip: {
      active: open,
      isAnimationActive: false,
      // Follow the selected x position, with the entire popup above the plot.
      // Percentage translation accommodates both short and multi-row readouts.
      position: { y: 0 },
      allowEscapeViewBox: { x: false, y: true },
      wrapperStyle: {
        zIndex: 50,
        translate: '0 calc(-100% - 12px)',
        maxWidth: 'calc(100vw - 32px)',
        whiteSpace: 'normal' as const,
      },
    },
  }
}
