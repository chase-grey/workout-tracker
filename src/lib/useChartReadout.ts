import { useEffect, useRef, useState } from 'react'

/**
 * One place to touch a chart, and one way to put its readout away.
 *
 * Recharts makes the plot itself keyboard-focusable and shows the numbers for as
 * long as it holds focus. On a phone that turns a single tap into a focus box
 * drawn around the whole graph with the readout pinned open inside it — and on a
 * page of plain divs nothing ever takes that focus back, so the box follows you
 * down the tab. There's nothing here to reach with a keyboard, so `chart` switches
 * that layer off and this hook does the job it was doing instead: touch a chart to
 * read it, touch anything off that card to be done with it.
 */
export function useChartReadout() {
  const card = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

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

  const show = () => setOpen(true)

  return {
    /** For the card around the chart: touching it is what opens the readout. */
    card: { ref: card, onPointerDown: show, onPointerMove: show },
    /** For the chart — see above for why its own focus layer is off. */
    chart: { accessibilityLayer: false },
    /**
     * For the `<Tooltip>`: undefined leaves Recharts to track the pointer as it
     * normally would, false keeps the readout shut whatever the pointer did last.
     */
    tooltip: { active: open ? undefined : false },
  }
}
