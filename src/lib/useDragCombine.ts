import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { dropTarget, edgeScroll, gapLine, type RowBox, type RowDrop } from './dragSort'

/** How far a finger has to travel before a press on the grip is a drag at all. */
const SLOP_PX = 6

/** How what's being carried reads while it's lifted off the list under the finger. */
export const DRAG_LIFTED = 'relative z-20 rounded-xl bg-surface-2 shadow-lg shadow-black/50'
/** How a row reads while its heading is away being carried. */
export const DRAG_LEFT = 'opacity-40'
/** How a row reads while a drop would land on top of it. */
export const DRAG_ONTO = 'ring-2 ring-accent bg-accent/15'

/** Props for the element a row, or a part of one, is dragged by. */
export type CombineHandleProps = {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void
  style: CSSProperties
}

/** A list whose rows can be dragged between each other and onto each other. */
export type DragCombine = {
  /** For the element holding the rows, which the gap line is positioned in. */
  list: (el: HTMLElement | null) => void
  /** For each row, which has to be measurable. */
  row: (id: string) => (el: HTMLElement | null) => void
  /**
   * For the element that's carried: a row's heading, under the row's own id, or
   * a part of a row that can be dragged out of it, under a drag id of its own.
   * A row that registers none is carried whole.
   */
  part: (dragId: string) => (el: HTMLElement | null) => void
  /** The grip of a whole row. */
  handle: (id: string) => CombineHandleProps
  /** The grip of a part of the row `rowId`. */
  partHandle: (dragId: string, rowId: string) => CombineHandleProps
  /** What is under the finger: a row's id or a part's drag id. */
  draggingId: string | null
  /** The row a drop would land on top of, to mark it. */
  ontoId: string | null
  /** Where to draw the line for a drop between rows, in pixels down the list element. */
  gapTop: number | null
}

type Live = {
  pointerId: number
  dragId: string
  home: number
  whole: boolean
  /** The rows as they lay when the finger went down, in viewport coordinates. */
  boxes: RowBox[]
  startY: number
  clientY: number
  /** How far the list had been scrolled when the boxes were measured. */
  scroll0: number
  listTop: number
  mover: HTMLElement
  moved: boolean
  target: RowDrop | null
}

const sameTarget = (a: RowDrop | null, b: RowDrop | null) =>
  a === b || (!!a && !!b && a.kind === b.kind && a.index === b.index)

/**
 * Drag for a vertical list where a row can be dropped BETWEEN two others or ON
 * one of them (see dragSort.dropTarget for which is which).
 *
 * The rows hold still while one is carried: with rows sliding out of the way,
 * as they do in {@link useDragSort}, the row you were aiming at would move from
 * under the finger just as you reached it. Instead a line marks the gap a drop
 * would fall into and the caller marks the row it would land on. What's carried
 * is the row's heading rather than the whole of a row that may run to a screen's
 * height, so what's under the finger stays in view of what it's being aimed at.
 *
 * Pointer events, captured on the grip, so a finger and a mouse are the same
 * gesture and only the grip gives up scrolling to it. The list can be longer
 * than its window, so holding the drag near the top or bottom of `scroller`
 * scrolls it, and the geometry is kept in the list's own terms by counting the
 * scroll since the rows were measured.
 *
 * The dragged element is moved by writing its transform directly rather than
 * through state: the list this serves re-renders a whole workout screen, and a
 * finger shouldn't wait on that. State changes only when the answer does — what
 * is being dragged, and where it would land.
 *
 * `ids` is the rows front to back. `onDrop` gets what was dragged — a row's id,
 * or a part's drag id — and where it was let go. The up and down arrow keys on a
 * row's grip move it one place.
 */
export function useDragCombine(
  ids: string[],
  onDrop: (dragId: string, target: RowDrop) => void,
  scroller: RefObject<HTMLElement | null>,
): DragCombine {
  const rows = useRef(new Map<string, HTMLElement>())
  const parts = useRef(new Map<string, HTMLElement>())
  const listEl = useRef<HTMLElement | null>(null)
  const refs = useRef(new Map<string, (el: HTMLElement | null) => void>())
  const live = useRef<Live | null>(null)
  const frame = useRef(0)
  const [shown, setShown] = useState<{ dragId: string; target: RowDrop | null; gapTop: number | null } | null>(null)

  /** One stable ref callback per element, so a re-render doesn't churn the registry. */
  const refFor = (kind: 'row' | 'part', id: string) => {
    const name = `${kind}:${id}`
    let ref = refs.current.get(name)
    if (!ref) {
      const registry = kind === 'row' ? rows.current : parts.current
      ref = (el: HTMLElement | null) => {
        if (el) registry.set(id, el)
        else registry.delete(id)
      }
      refs.current.set(name, ref)
    }
    return ref
  }

  const track = () => {
    const d = live.current
    if (!d) return
    const scrolled = (scroller.current?.scrollTop ?? 0) - d.scroll0
    const y = d.clientY + scrolled
    const dy = y - d.startY
    d.mover.style.transform = `translateY(${dy}px)`
    if (Math.abs(dy) > SLOP_PX) d.moved = true
    const target = d.moved ? dropTarget(d.boxes, y, d.home, d.whole) : null
    if (sameTarget(target, d.target)) return
    d.target = target
    setShown({
      dragId: d.dragId,
      target,
      gapTop: target?.kind === 'gap' ? gapLine(d.boxes, target.index) - d.listTop : null,
    })
  }

  const tick = () => {
    const d = live.current
    const el = scroller.current
    if (!d) return
    if (el) {
      const box = el.getBoundingClientRect()
      const by = edgeScroll(d.clientY, box.top, box.bottom)
      // Only once the finger has headed for that edge: a row picked up near the
      // top of the window hasn't asked to go further up by being there.
      const headed = by < 0 ? d.clientY < d.startY - SLOP_PX : d.clientY > d.startY + SLOP_PX
      if (by && headed) {
        const before = el.scrollTop
        el.scrollTop = before + by
        if (el.scrollTop !== before) track()
      }
    }
    frame.current = requestAnimationFrame(tick)
  }

  const end = () => {
    const d = live.current
    live.current = null
    cancelAnimationFrame(frame.current)
    if (d) d.mover.style.transform = ''
    setShown(null)
    return d
  }

  // A list taken off the screen mid-drag leaves nothing running behind it.
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const grip = (dragId: string, rowId: string, whole: boolean): CombineHandleProps => ({
    onPointerDown: (e) => {
      if (live.current) return
      const home = ids.indexOf(rowId)
      const boxes = ids.map((id) => rows.current.get(id)?.getBoundingClientRect())
      const mover = parts.current.get(dragId) ?? (whole ? rows.current.get(rowId) : undefined)
      // Nothing to measure against — better an inert grip than a drag against
      // made-up geometry.
      if (home < 0 || !mover || boxes.some((box) => !box)) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      live.current = {
        pointerId: e.pointerId,
        dragId,
        home,
        whole,
        boxes: (boxes as DOMRect[]).map((b) => ({ top: b.top, height: b.height })),
        startY: e.clientY,
        clientY: e.clientY,
        scroll0: scroller.current?.scrollTop ?? 0,
        listTop: listEl.current?.getBoundingClientRect().top ?? 0,
        mover,
        moved: false,
        target: null,
      }
      setShown({ dragId, target: null, gapTop: null })
      frame.current = requestAnimationFrame(tick)
    },
    onPointerMove: (e) => {
      const d = live.current
      if (!d || d.pointerId !== e.pointerId) return
      d.clientY = e.clientY
      track()
    },
    onPointerUp: (e) => {
      if (live.current?.pointerId !== e.pointerId) return
      const d = end()
      if (d?.target) onDrop(d.dragId, d.target)
    },
    // Lost to a system gesture: everything stays where it was.
    onPointerCancel: () => {
      end()
    },
    onKeyDown: (e) => {
      if (!whole) return
      const by = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
      const from = ids.indexOf(rowId)
      if (!by || from < 0 || from + by < 0 || from + by >= ids.length) return
      e.preventDefault()
      onDrop(dragId, { kind: 'gap', index: by < 0 ? from - 1 : from + 2 })
    },
    // The gesture is ours: the list mustn't scroll under it, and a finger held on
    // the grip mustn't raise a selection or a callout instead of picking it up.
    style: { touchAction: 'none', userSelect: 'none', WebkitTouchCallout: 'none' },
  })

  return {
    list: (el) => {
      listEl.current = el
    },
    row: (id) => refFor('row', id),
    part: (dragId) => refFor('part', dragId),
    handle: (id) => grip(id, id, true),
    partHandle: (dragId, rowId) => grip(dragId, rowId, false),
    draggingId: shown?.dragId ?? null,
    ontoId: shown?.target?.kind === 'onto' ? (ids[shown.target.index] ?? null) : null,
    gapTop: shown?.gapTop ?? null,
  }
}
