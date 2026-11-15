/**
 * The buttons at the foot of Today: one per thing you can start or log from
 * there, in an order you can drag, with any of them removable and re-addable.
 *
 * The layout is kept as an order and a list of removed tiles rather than as the
 * tiles themselves, because what's available moves under it: a pillar switched
 * on in Settings, a plan day that gains its first exercise, a new cardio pin.
 * Anything available that the saved order has never seen goes in beside the
 * rest of its pillar, so the default grouping — strength, then flexibility,
 * then cardio — survives a tile arriving late.
 */

import type { DayType } from '../types'
import type { FlexRoutineKey } from '../config/flexRoutines'
import type { Pillar } from './profile'

/** A cardio session saved as a one-tap log: what it was and its usual length. */
export type CardioPin = {
  id: string
  kind: string
  minutes: number
  distanceMi?: number
}

export type HomeTile =
  | { type: 'lift'; day: DayType }
  | { type: 'core' }
  | { type: 'stretch'; routine: FlexRoutineKey }
  /** Opens the cardio log sheet. */
  | { type: 'cardio' }
  | { type: 'pin'; pin: CardioPin }

/** What Settings holds: tile ids front to back, and the ones taken off. */
export type HomeLayout = { order: string[]; removed: string[] }

export function tileId(t: HomeTile): string {
  switch (t.type) {
    case 'lift':
      return `lift:${t.day}`
    case 'stretch':
      return `stretch:${t.routine}`
    case 'pin':
      return `pin:${t.pin.id}`
    default:
      return t.type
  }
}

/** The pillar a tile belongs to — what removing its last one asks about. */
export function tilePillar(t: HomeTile): Pillar {
  if (t.type === 'lift' || t.type === 'core') return 'strength'
  if (t.type === 'stretch') return 'flexibility'
  return 'cardio'
}

/**
 * Everything that could be a tile, in the default order: strength, then
 * flexibility, then cardio. Pillars that are off are left in — the add sheet
 * offers them — and filtered out of the grid by {@link arrangeTiles}' caller.
 */
export function candidateTiles(input: {
  /** Lift days with exercises, in the plan's order; full body goes last. */
  liftDays: DayType[]
  core: boolean
  routines: FlexRoutineKey[]
  pins: CardioPin[]
}): HomeTile[] {
  const lifts = [...input.liftDays.filter((d) => d !== 'fullbody'), ...input.liftDays.filter((d) => d === 'fullbody')]
  return [
    ...lifts.map((day): HomeTile => ({ type: 'lift', day })),
    ...(input.core ? [{ type: 'core' } as HomeTile] : []),
    ...input.routines.map((routine): HomeTile => ({ type: 'stretch', routine })),
    { type: 'cardio' },
    ...input.pins.map((pin): HomeTile => ({ type: 'pin', pin })),
  ]
}

/**
 * The tiles to show, in order: `available` (default order) less what was
 * removed, sorted by the saved order. A tile the order doesn't know goes in
 * after the last tile of its own pillar, or where its pillar falls among the
 * others when none of them are showing.
 */
export function arrangeTiles(available: HomeTile[], layout: HomeLayout | undefined): HomeTile[] {
  const removed = new Set(layout?.removed ?? [])
  const shown = available.filter((t) => !removed.has(tileId(t)))
  if (!layout) return shown

  const rank = new Map(layout.order.map((id, i) => [id, i]))
  const out = shown.filter((t) => rank.has(tileId(t))).sort((a, b) => rank.get(tileId(a))! - rank.get(tileId(b))!)
  const pillarRank: Record<Pillar, number> = { strength: 0, flexibility: 1, cardio: 2, diet: 3 }

  for (const t of shown) {
    if (rank.has(tileId(t))) continue
    const p = tilePillar(t)
    let at = -1
    for (let i = 0; i < out.length; i++) if (tilePillar(out[i]) === p) at = i
    if (at === -1) {
      // No neighbour of its own: ahead of the first tile from a later pillar.
      at = out.findIndex((o) => pillarRank[tilePillar(o)] > pillarRank[p]) - 1
      if (at === -2) at = out.length - 1
    }
    out.splice(at + 1, 0, t)
  }
  return out
}

/** `ids` with the one at `from` moved to `to`. */
export function moveItem<T>(ids: T[], from: number, to: number): T[] {
  const next = [...ids]
  const [it] = next.splice(from, 1)
  next.splice(to, 0, it)
  return next
}

/** The layout after taking `id` off the grid. */
export function withRemoved(layout: HomeLayout, shownIds: string[], id: string): HomeLayout {
  return {
    order: shownIds.filter((x) => x !== id),
    removed: layout.removed.includes(id) ? layout.removed : [...layout.removed, id],
  }
}

/** The layout after putting `id` back, at the end of the grid. */
export function withAdded(layout: HomeLayout, shownIds: string[], id: string): HomeLayout {
  return {
    order: [...shownIds.filter((x) => x !== id), id],
    removed: layout.removed.filter((x) => x !== id),
  }
}

/** Whether the tile at `index` of `count` takes the whole row: the odd one out at the bottom. */
export function spansRow(index: number, count: number): boolean {
  return count % 2 === 1 && index === count - 1
}

export type Slot = { left: number; top: number; width: number; height: number }

/**
 * Which slot a tile dragged from `from` by (`dx`, `dy`) lands in: the one whose
 * centre is nearest the dragged tile's centre. The slots are measured once, as
 * the drag starts — the grid keeps the same number of tiles while it's moving,
 * so the slots stay where they were even as tiles trade places in them.
 */
export function gridDropIndex(slots: Slot[], from: number, dx: number, dy: number): number {
  const s = slots[from]
  if (!s) return from
  const cx = s.left + s.width / 2 + dx
  const cy = s.top + s.height / 2 + dy
  let best = from
  let bestDist = Infinity
  slots.forEach((o, i) => {
    const d = (o.left + o.width / 2 - cx) ** 2 + (o.top + o.height / 2 - cy) ** 2
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  })
  return best
}
