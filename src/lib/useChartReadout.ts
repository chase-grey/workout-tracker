import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import { type Gesture, gestureFrom, type Mark, withinReach } from './chartReadout'

/**
 * One place to touch a chart, and one way to put its readout away.
 *
 * Recharts makes the plot itself keyboard-focusable and shows the numbers for as
 * long as it holds focus. On a phone that turns a single tap into a focus box
 * drawn around the whole graph with the readout pinned open inside it — and on a
 * page of plain divs nothing ever takes that focus back, so the box follows you
 * down the tab. There's nothing here to reach with a keyboard, so `chart` switches
 * that layer off and this hook does the job it was doing instead: touch a point to
 * read it, touch anything off that card to be done with it.
 *
 * "A point", not "the card": the card used to answer any touch anywhere on it,
 * which meant a thumb carrying the page past a chart opened the readout on the
 * way through. So a touch has to be aimed at the data — near a plotted point
 * (see {@link withinReach}), and part of a gesture that was reading rather than
 * scrolling. A finger that sets off down the page is scrolling and gets nothing;
 * one that runs along the curve is scrubbing it and reads as it goes. A mouse
 * keeps the hover it expects, over the curve itself.
 */
export function useChartReadout() {
  const card = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  // Recharts can track the active dot from a touch, but its hover-triggered
  // tooltip is not reliably activated by that same pointer stream. Keep the
  // selected row ourselves so a finger scrub can drive both pieces together.
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>()
  /** Where the finger went down, and what the gesture has turned out to be. */
  const touch = useRef<{ x: number; y: number; gesture: Gesture } | null>(null)

  useEffect(() => {
    if (!open) return
    // Captured at the document, so the tap that dismisses can be a tap on
    // anything — including a control that handles the event and stops it.
    const onDown = (e: PointerEvent) => {
      if (!card.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  const pointAt = (e: { clientX: number; clientY: number }) => {
    if (card.current == null) return null
    const marks = marksIn(card.current)
    if (!withinReach(marks, e.clientX, e.clientY)) return null
    return nearestMarkIndex(marks, e.clientX)
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    touch.current = { x: e.clientX, y: e.clientY, gesture: 'tap' }
    const index = pointAt(e)
    if (e.pointerType === 'mouse') {
      setSelectedIndex(index ?? undefined)
      setOpen(index != null)
    }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse') {
      const index = pointAt(e)
      setSelectedIndex(index ?? undefined)
      setOpen(index != null)
      return
    }
    const down = touch.current
    if (!down || down.gesture === 'scroll') return
    if (down.gesture === 'tap') {
      down.gesture = gestureFrom(e.clientX - down.x, e.clientY - down.y)
      // The page is on its way past: whatever was being read is done with.
      if (down.gesture === 'scroll') setOpen(false)
      if (down.gesture !== 'scrub') return
    }
    // Scrubbing along the curve: keep the popup on the nearest plotted row.
    // Once the gesture has been identified as a scrub, the finger may drift
    // above or below the line while it travels horizontally.
    if (down.gesture === 'scrub') {
      const index = nearestMarkIndex(marksIn(card.current!), e.clientX)
      if (index != null) {
        setSelectedIndex(index)
        setOpen(true)
      }
    } else if (!open) {
      const index = pointAt(e)
      if (index != null) {
        setSelectedIndex(index)
        setOpen(true)
      }
    }
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    const down = touch.current
    touch.current = null
    // A scrub is already showing what it found, and a scroll asked for nothing.
    if (e.pointerType === 'mouse' || down?.gesture !== 'tap') return
    const index = pointAt(e)
    setSelectedIndex(index ?? undefined)
    setOpen(index != null)
  }

  const onPointerCancel = () => {
    touch.current = null
    setOpen(false)
  }

  return {
    /** For the card around the chart: it decides which touches are reading it. */
    card: { ref: card, onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    /** For the chart — see above for why its own focus layer is off. */
    chart: { accessibilityLayer: false },
    /**
     * For the `<Tooltip>`: the hook owns visibility so touch scrubbing can show
     * the same popup as mouse hover. `defaultIndex` is the row under the finger.
     */
    tooltip: { active: open, defaultIndex: selectedIndex },
  }
}

/**
 * Where this card's plotted points are on screen, read off the dots Recharts
 * drew for them — the one place their positions are already worked out.
 */
function marksIn(card: HTMLElement): Mark[] {
  return [...card.querySelectorAll('.recharts-line-dot')].map((dot) => {
    const box = dot.getBoundingClientRect()
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  })
}

/** Return the row at the nearest x coordinate, collapsing multiple series. */
function nearestMarkIndex(marks: Mark[], x: number): number | null {
  const xs = [...new Set(marks.map((mark) => mark.x))].sort((a, b) => a - b)
  if (xs.length === 0) return null
  let best = 0
  for (let i = 1; i < xs.length; i += 1) {
    if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i
  }
  return best
}
