import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { MdAdd, MdClose, MdEdit } from 'react-icons/md'
import { v4 as uuid } from 'uuid'
import { Collapse } from '../../components/Collapse'
import { ControlWord } from '../../components/ControlWord'
import { useControlLabel } from '../../lib/useControlLabel'
import { useData } from '../../store/DataContext'
import { toISODate, weekStartISO } from '../../lib/dates'
import { ownerProfile } from '../../lib/ownerProfile'
import {
  hasPillar,
  PILLAR_GOAL_KEY,
  PILLAR_LABELS,
  profileWeeklyGoals,
  withPillar,
  type Pillar,
  type Profile,
} from '../../lib/profile'
import { recommendWeeklyGoals } from '../../lib/recommend'
import {
  arrangeTiles,
  gridDropIndex,
  moveItem,
  spansRow,
  tileId,
  tilePillar,
  withAdded,
  withRemoved,
  type CardioPin,
  type HomeLayout,
  type HomeTile,
  type Slot,
} from '../../lib/homeTiles'
import { useBackGuard } from '../../lib/useBackGuard'
import { CardioLogSheet } from './CardioLogSheet'

const tileButton =
  'min-h-[52px] w-full rounded-2xl bg-surface px-2 text-lg font-bold leading-tight active:bg-surface-2'

/** How long a tile is held before the grid goes into edit mode. */
const HOLD_MS = 450
/** How far a finger may wander during the hold and still be holding, not scrolling. */
const HOLD_SLOP_PX = 8

const GOAL_LABELS: Partial<Record<Pillar, string>> = {
  strength: 'workouts a week',
  flexibility: 'stretches a week',
  cardio: 'cardio days a week',
}

type Drag = {
  id: string
  pointerId: number
  startX: number
  startY: number
  dx: number
  dy: number
  from: number
  to: number
  slots: Slot[]
}

/** Asked when a pillar's last tile comes off, or a tile from a pillar that's off goes on. */
type Question = {
  pillar: Pillar
  mode: 'remove' | 'add'
  /** What adding commits once the pillar is on. */
  add?: { id: string } | { pin: CardioPin }
}

type Props = {
  /** Every tile there could be, in the default order (lib/homeTiles.candidateTiles). */
  candidates: HomeTile[]
  label: (t: HomeTile) => string
  detail?: (t: HomeTile) => string | undefined
  dimmed: (t: HomeTile) => boolean
  onOpen: (t: HomeTile) => void
}

/**
 * The buttons at the foot of Today. A tap starts or logs; holding one puts the
 * grid into edit mode with that tile already under the finger, where tiles
 * drag into a new order, an × takes one off and + puts one back or pins a
 * cardio session.
 *
 * Taking off the last tile of a pillar asks whether it's still being tracked,
 * with its weekly goal right there to change; putting on a tile from a pillar
 * that's off asks for the goal to track it at. The tiles are the everyday face
 * of what the profile tracks, so this is where changing it comes naturally.
 */
export function HomeTiles({ candidates, label, detail, dimmed, onOpen }: Props) {
  const { settings, updateSettings } = useData()
  const [fallbackProfile] = useState(() => ownerProfile())
  const profile: Profile = settings.profile ?? fallbackProfile
  const pillarOn = (p: Pillar) => hasPillar(settings.profile, p)

  const tiles = arrangeTiles(
    candidates.filter((t) => pillarOn(tilePillar(t))),
    settings.homeLayout,
  )
  const ids = tiles.map(tileId)
  const layout: HomeLayout = settings.homeLayout ?? { order: ids, removed: [] }
  const offGrid = candidates.filter((t) => !ids.includes(tileId(t)) && t.type !== 'pin')

  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [pinning, setPinning] = useState(false)
  const [question, setQuestion] = useState<Question | null>(null)
  const [drag, setDragState] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const press = useRef<{ id: string; pointerId: number; x: number; y: number; timer: number } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const els = useRef(new Map<string, HTMLElement>())

  useBackGuard(editing, () => setEditing(false))

  // The hold that opens edit mode is invisible, so while labels are on there's
  // a plain edit button under the grid too. Holding counts as a use of it: by
  // the third time in, you know where it is.
  const editLabel = useControlLabel('editTiles')
  const addLabel = useControlLabel('addTile')
  const editEverShown = useRef(false)
  if (editLabel.show) editEverShown.current = true

  const setDrag = (d: Drag | null) => {
    dragRef.current = d
    setDragState(d)
  }

  // Once a tile is picked up the page mustn't scroll under it. A hold starts
  // as an ordinary touch, which the browser is free to pan, so the pan is
  // refused here — non-passive, which React's own touch handlers can't be.
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const stop = (e: TouchEvent) => {
      if (dragRef.current && e.cancelable) e.preventDefault()
    }
    grid.addEventListener('touchmove', stop, { passive: false })
    return () => grid.removeEventListener('touchmove', stop)
  }, [])

  const clearPress = () => {
    if (press.current) window.clearTimeout(press.current.timer)
    press.current = null
  }

  const pickUp = (id: string, pointerId: number, x: number, y: number) => {
    const from = ids.indexOf(id)
    const rects = ids.map((i) => els.current.get(i)?.getBoundingClientRect())
    if (from < 0 || rects.some((r) => !r)) return
    try {
      els.current.get(id)?.setPointerCapture(pointerId)
    } catch {
      /* the finger already lifted; the drag ends on the next up */
    }
    setDrag({
      id,
      pointerId,
      startX: x,
      startY: y,
      dx: 0,
      dy: 0,
      from,
      to: from,
      slots: rects.map((r) => ({ left: r!.left, top: r!.top, width: r!.width, height: r!.height })),
    })
  }

  const save = (patch: Partial<typeof settings>) => void updateSettings({ ...settings, ...patch })

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>, id: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (editing) {
      pickUp(id, e.pointerId, e.clientX, e.clientY)
      return
    }
    clearPress()
    const { pointerId, clientX: x, clientY: y } = e
    press.current = {
      id,
      pointerId,
      x,
      y,
      timer: window.setTimeout(() => {
        const held = press.current
        press.current = null
        if (!held) return
        editLabel.used()
        setEditing(true)
        navigator.vibrate?.(10)
        pickUp(id, pointerId, held.x, held.y)
      }, HOLD_MS),
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const held = press.current
    if (held && held.pointerId === e.pointerId && Math.hypot(e.clientX - held.x, e.clientY - held.y) > HOLD_SLOP_PX) {
      clearPress()
    }
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    setDrag({ ...d, dx, dy, to: gridDropIndex(d.slots, d.from, dx, dy) })
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    clearPress()
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    setDrag(null)
    if (d.to !== d.from) save({ homeLayout: { ...layout, order: moveItem(ids, d.from, d.to) } })
  }

  const onPointerCancel = () => {
    clearPress()
    setDrag(null)
  }

  const week = weekStartISO(toISODate(new Date()))
  const goalFor = (p: Pillar) => {
    const key = PILLAR_GOAL_KEY[p]
    return (pillarOn(p) ? profileWeeklyGoals(profile, week)[key] : 0) || recommendWeeklyGoals([p])[key] || 1
  }

  const remove = (t: HomeTile) => {
    const id = tileId(t)
    const p = tilePillar(t)
    const emptied = !tiles.some((o) => tileId(o) !== id && tilePillar(o) === p)
    if (t.type === 'pin') {
      save({
        cardioPins: (settings.cardioPins ?? []).filter((x) => x.id !== t.pin.id),
        homeLayout: { ...layout, order: ids.filter((x) => x !== id) },
      })
    } else {
      save({ homeLayout: withRemoved(layout, ids, id) })
    }
    if (emptied) setQuestion({ pillar: p, mode: 'remove' })
  }

  const add = (t: HomeTile) => {
    setAdding(false)
    const p = tilePillar(t)
    if (!pillarOn(p)) {
      setQuestion({ pillar: p, mode: 'add', add: { id: tileId(t) } })
      return
    }
    save({ homeLayout: withAdded(layout, ids, tileId(t)) })
  }

  const pin = (body: Omit<CardioPin, 'id'>) => {
    const next: CardioPin = { ...body, id: uuid() }
    if (!pillarOn('cardio')) {
      setQuestion({ pillar: 'cardio', mode: 'add', add: { pin: next } })
      return
    }
    save({ cardioPins: [...(settings.cardioPins ?? []), next] })
  }

  /** Answer the question: track `pillar` at `goal` a week, or stop. */
  const answer = (q: Question, track: boolean, goal: number) => {
    setQuestion(null)
    const patch: Partial<typeof settings> = {}
    const current = pillarOn(q.pillar) ? profileWeeklyGoals(profile, week)[PILLAR_GOAL_KEY[q.pillar]] : 0
    if (track !== pillarOn(q.pillar) || (track && goal !== current)) {
      patch.profile = withPillar(profile, q.pillar, track, goal, week)
    }
    if (track && q.add && 'id' in q.add) patch.homeLayout = withAdded(layout, ids, q.add.id)
    if (track && q.add && 'pin' in q.add) patch.cardioPins = [...(settings.cardioPins ?? []), q.add.pin]
    if (Object.keys(patch).length) save(patch)
  }

  const order = drag ? moveItem(tiles, drag.from, drag.to) : tiles
  const onlyPillar = profile.pillars.length === 1

  return (
    <>
      <div
        ref={gridRef}
        className="grid grid-cols-2 gap-2"
        onContextMenu={(e) => e.preventDefault()}
      >
        {order.map((t, i) => {
          const id = tileId(t)
          const dragged = drag?.id === id
          const from = drag?.slots[drag.from]
          const to = drag?.slots[drag.to]
          const shift =
            dragged && from && to ? `translate(${drag.dx + from.left - to.left}px, ${drag.dy + from.top - to.top}px)` : undefined
          const sub = detail?.(t)
          return (
            <div
              key={id}
              ref={(el) => {
                if (el) els.current.set(id, el)
                else els.current.delete(id)
              }}
              className={`relative ${spansRow(i, order.length) ? 'col-span-2' : ''}`}
              style={{
                transform: shift,
                zIndex: dragged ? 10 : undefined,
                touchAction: editing ? 'none' : undefined,
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
              }}
              onPointerDown={(e) => onPointerDown(e, id)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
            >
              <button
                onClick={() => {
                  if (!editing) onOpen(t)
                }}
                className={`${tileButton} ${dimmed(t) && !editing ? 'opacity-50' : ''} ${
                  editing && !dragged ? 'tile-wiggle' : ''
                } ${dragged ? 'scale-105 shadow-lg shadow-black/40' : ''}`}
              >
                {label(t)}
                {sub && <span className="block text-xs font-medium text-neutral-400">{sub}</span>}
              </button>
              {editing && !dragged && (
                <button
                  aria-label={`remove ${label(t)}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => remove(t)}
                  className="absolute -right-3 -top-3 flex h-11 w-11 items-center justify-center"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-600 text-neutral-50">
                    <MdClose aria-hidden />
                  </span>
                </button>
              )}
            </div>
          )
        })}
      </div>

      {editEverShown.current && (
        <Collapse id="home-tiles-edit" open={editLabel.show && !editing}>
          <button
            onClick={() => {
              editLabel.used()
              setEditing(true)
            }}
            aria-label="edit tiles"
            className="flex min-h-[44px] w-full items-center justify-center rounded-2xl text-xl text-neutral-400 active:bg-surface"
          >
            <MdEdit aria-hidden />
            <ControlWord show={editLabel.show} word={editLabel.word} layout="inline" />
          </button>
        </Collapse>
      )}

      {editing && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              addLabel.used()
              setAdding(true)
            }}
            aria-label="add"
            className="flex min-h-[52px] items-center justify-center rounded-2xl border-2 border-dashed border-surface-2 text-2xl text-neutral-400 active:bg-surface"
          >
            <MdAdd aria-hidden />
            <ControlWord show={addLabel.show} word={addLabel.word} layout="inline" />
          </button>
          <button
            onClick={() => setEditing(false)}
            className="min-h-[52px] rounded-2xl bg-accent text-lg font-bold text-on-accent"
          >
            done
          </button>
        </div>
      )}

      {adding && (
        <AddSheet
          tiles={offGrid}
          label={label}
          onAdd={add}
          onPin={() => {
            setAdding(false)
            setPinning(true)
          }}
          onClose={() => setAdding(false)}
        />
      )}

      {pinning && <CardioLogSheet onPin={pin} onClose={() => setPinning(false)} />}

      {question && (
        <TrackSheet
          key={`${question.pillar}:${question.mode}`}
          question={question}
          initialGoal={goalFor(question.pillar)}
          canStop={!(onlyPillar && pillarOn(question.pillar))}
          onAnswer={(track, goal) => answer(question, track, goal)}
          onClose={() => setQuestion(null)}
        />
      )}
    </>
  )
}

const PILLAR_ORDER: Pillar[] = ['strength', 'flexibility', 'cardio']

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useBackGuard(true, onClose)
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >
        <h2 className="mb-4 text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>
  )
}

/** What + offers: every tile not on the grid, by pillar, and a new cardio pin. */
function AddSheet({
  tiles,
  label,
  onAdd,
  onPin,
  onClose,
}: {
  tiles: HomeTile[]
  label: (t: HomeTile) => string
  onAdd: (t: HomeTile) => void
  onPin: () => void
  onClose: () => void
}) {
  return (
    <Sheet title="add" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {PILLAR_ORDER.map((p) => {
          const group = tiles.filter((t) => tilePillar(t) === p)
          if (group.length === 0 && p !== 'cardio') return null
          return (
            <div key={p} className="flex flex-col gap-2">
              <span className="text-xs tracking-wider text-neutral-500">{PILLAR_LABELS[p]}</span>
              <div className="grid grid-cols-2 gap-2">
                {group.map((t) => (
                  <button key={tileId(t)} onClick={() => onAdd(t)} className={`${tileButton} bg-surface-2`}>
                    {label(t)}
                  </button>
                ))}
                {p === 'cardio' && (
                  <button onClick={onPin} className={`${tileButton} bg-surface-2`}>
                    pin cardio
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}

/** Whether a pillar is still tracked, and at how many a week. */
function TrackSheet({
  question,
  initialGoal,
  canStop,
  onAnswer,
  onClose,
}: {
  question: Question
  initialGoal: number
  canStop: boolean
  onAnswer: (track: boolean, goal: number) => void
  onClose: () => void
}) {
  const [goal, setGoal] = useState(initialGoal)
  const name = PILLAR_LABELS[question.pillar]
  const goalLabel = GOAL_LABELS[question.pillar] ?? 'a week'
  const bump = (by: number) => setGoal((g) => Math.min(7, Math.max(1, g + by)))
  return (
    <Sheet title={question.mode === 'remove' ? `still tracking ${name}?` : `track ${name}`} onClose={onClose}>
      <div className="flex min-h-[52px] items-center gap-3 rounded-xl bg-surface-2 px-3">
        <span className="flex-1 text-sm">{goalLabel}</span>
        <button
          onClick={() => bump(-1)}
          aria-label={`fewer ${goalLabel}`}
          disabled={goal <= 1}
          className="h-11 w-11 rounded-lg bg-surface text-lg font-semibold disabled:text-neutral-600"
        >
          −
        </button>
        <span className="w-6 text-center font-semibold tabular-nums">{goal}</span>
        <button
          onClick={() => bump(1)}
          aria-label={`more ${goalLabel}`}
          disabled={goal >= 7}
          className="h-11 w-11 rounded-lg bg-surface text-lg font-semibold disabled:text-neutral-600"
        >
          +
        </button>
      </div>
      <button
        onClick={() => onAnswer(true, goal)}
        className="mt-4 min-h-[52px] w-full rounded-2xl bg-accent text-lg font-bold text-on-accent"
      >
        {question.mode === 'remove' ? 'keep tracking' : 'add'}
      </button>
      {question.mode === 'remove' && canStop && (
        <button
          onClick={() => onAnswer(false, goal)}
          className="mt-2 min-h-[52px] w-full rounded-2xl bg-surface-2 text-lg font-semibold text-neutral-300"
        >
          stop tracking {name}
        </button>
      )}
    </Sheet>
  )
}
