import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { dropIndex, rowPitches, rowShift, type RowBox } from './dragSort'
import { usePrefersReducedMotion } from './useReducedMotion'

/** How long a displaced row takes to slide out of the way. */
const SLIDE_MS = 150

/** Props for the element a row is dragged by. */
export type SortHandleProps = {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void
  style: CSSProperties
}

/** Props for the row itself: it has to be measurable, and it has to move. */
export type SortRowProps = {
  ref: (el: HTMLElement | null) => void
  style: CSSProperties
}

/** A list that can be dragged into a new order. */
export type Sortable = {
  row: (id: string) => SortRowProps
  handle: (id: string) => SortHandleProps
  /** The row under the finger, for the caller to lift out of the page. */
  draggingId: string | null
}

type Drag = {
  pointerId: number
  /** Where the finger went down, which every offset since is measured from. */
  startY: number
  from: number
  to: number
  delta: number
  pitches: number[]
}

/**
 * Drag-to-reorder for a vertical list of rows.
 *
 * Pointer events rather than HTML5 drag-and-drop, which phones don't fire at all:
 * the gesture is the same code for a finger and a mouse. Capturing the pointer on
 * the handle pins the drag to it, so the row keeps following even once the finger
 * has wandered off the narrow grip, and `touch-action: none` stops the page
 * scrolling underneath the gesture — but only for the handle, so the list itself
 * still scrolls normally.
 *
 * `ids` is the list front to back; `onMove` is told the from and to indices of a
 * finished drag, and is the only thing that actually changes the order. Nothing
 * moves in the data mid-drag: the rows are shifted with a transform while the
 * finger is down and snap into their real places when the reorder lands.
 *
 * The handle also takes the up and down arrow keys, so the list can be reordered
 * without a drag at all.
 */
export function useDragSort(ids: string[], onMove: (from: number, to: number) => void): Sortable {
  const rows = useRef(new Map<string, HTMLElement>())
  const refs = useRef(new Map<string, (el: HTMLElement | null) => void>())
  const [drag, setDrag] = useState<Drag | null>(null)
  // Mirrored, so the release can read the drag it is ending even if the last move
  // and the release land in the same batch.
  const live = useRef<Drag | null>(null)
  const reduced = usePrefersReducedMotion()

  const put = (next: Drag | null) => {
    live.current = next
    setDrag(next)
  }

  /** One stable ref callback per row, so a re-render doesn't churn the registry. */
  const rowRef = (id: string) => {
    let ref = refs.current.get(id)
    if (!ref) {
      ref = (el: HTMLElement | null) => {
        if (el) rows.current.set(id, el)
        else rows.current.delete(id)
      }
      refs.current.set(id, ref)
    }
    return ref
  }

  const moveBy = (id: string, by: number) => {
    const from = ids.indexOf(id)
    const to = from + by
    if (from < 0 || to < 0 || to >= ids.length) return
    onMove(from, to)
  }

  const row = (id: string): SortRowProps => {
    const index = ids.indexOf(id)
    const dragged = drag?.from === index
    let shift = 0
    if (drag) shift = dragged ? drag.delta : rowShift(drag.pitches, drag.from, drag.to, index)
    return {
      ref: rowRef(id),
      style: {
        transform: shift ? `translateY(${shift}px)` : undefined,
        // The dragged row tracks the finger exactly; the ones it displaces slide.
        transition: drag && !dragged && !reduced ? `transform ${SLIDE_MS}ms ease-out` : undefined,
        // Above its neighbours, and above the row it is passing over.
        position: dragged ? 'relative' : undefined,
        zIndex: dragged ? 10 : undefined,
      },
    }
  }

  const handle = (id: string): SortHandleProps => ({
    onPointerDown: (e) => {
      const from = ids.indexOf(id)
      const boxes = ids.map((rowId) => rows.current.get(rowId)?.getBoundingClientRect())
      // Nothing to measure against — better to leave the handle inert than to
      // drag against made-up geometry.
      if (from < 0 || boxes.some((box) => !box)) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      put({
        pointerId: e.pointerId,
        startY: e.clientY,
        from,
        to: from,
        delta: 0,
        pitches: rowPitches(boxes as RowBox[]),
      })
    },
    onPointerMove: (e) => {
      const current = live.current
      if (!current || current.pointerId !== e.pointerId) return
      const delta = e.clientY - current.startY
      put({ ...current, delta, to: dropIndex(current.pitches, current.from, delta) })
    },
    onPointerUp: (e) => {
      const current = live.current
      if (!current || current.pointerId !== e.pointerId) return
      put(null)
      if (current.to !== current.from) onMove(current.from, current.to)
    },
    // Lost to a system gesture: the row goes back where it came from.
    onPointerCancel: () => put(null),
    onKeyDown: (e) => {
      const by = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
      if (!by) return
      e.preventDefault()
      moveBy(id, by)
    },
    // The gesture is ours: the page mustn't scroll under it, and a finger held on
    // the grip mustn't raise a selection or a callout instead of picking the row up.
    style: { touchAction: 'none', userSelect: 'none', WebkitTouchCallout: 'none' },
  })

  return { row, handle, draggingId: drag ? (ids[drag.from] ?? null) : null }
}
