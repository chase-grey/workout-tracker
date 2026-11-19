/**
 * Today's workout as you've rearranged it from the checklist.
 *
 * The day arrives from the plan in the plan's order, with the plan's circuits
 * (see lib/circuit). The checklist lets a running workout be reshaped by drag:
 * a row dropped between two others moves there, a row dropped ONTO another
 * joins it in a circuit, a row dropped onto a circuit becomes another station of
 * it, and a station dragged out to a gap leaves its circuit. None of that is a
 * change to the plan — next week's session opens as written — so it's kept on
 * the session as an {@link Arrangement} and applied over the day every time the
 * day is read ({@link arrange}).
 *
 * What it produces is the same list of exercises the rest of the session already
 * understands: in a new order, with `circuit` ids set or cleared. A circuit is a
 * consecutive run of exercises sharing an id, so once the list says so the set
 * order, the rests, the round count, the checklist's one-row-per-circuit and the
 * skip-as-one all follow from the code that runs a plan circuit — there is no
 * second rotation in here.
 *
 * A circuit made by hand is a plain rotation: a set at each station in turn,
 * {@link CIRCUIT_STATION_REST_SEC} to walk between them, and after a full round
 * the next station's own rest, capped (see lib/rest.restBeforeNextSet). A
 * movement dropped into one of the plan's circuits is run the way that circuit is
 * — a round to a screen and its round rest, when that's how the plan runs it.
 * Stations needn't have the same number of sets: one that has run out drops out
 * of the later rounds (see lib/circuit.buildSetOrder).
 *
 * Nothing logged moves. Sets already done stay done at the numbers they hold,
 * and a circuit is rotated by set number, so a movement joined halfway through
 * its sets is simply ahead: the flow skips what's logged, the stations behind
 * it catch up, and the rotation carries on from the first round they all owe.
 *
 * Pure module — no React/DOM.
 */

import { dayEntries, entryExercises } from './circuitEntry'

type Exercise = {
  key: string
  circuit?: string
  circuitRestSec?: number
  circuitRoundRestSec?: number
  roundScreen?: boolean
}

export type Arrangement = {
  /** Every exercise the list held when it was last rearranged, front to back. */
  order: string[]
  /**
   * Where an exercise's circuit differs from the day's: the id of the circuit
   * it's in now, or null for one taken out of the circuit the day has it in.
   * An exercise the day already has right isn't listed.
   */
  circuits: Record<string, string | null>
}

/** Where a dragged row is let go: between two rows, or on top of one. */
export type DropTarget =
  /** Before the entry at `index` — the entry count for the end of the list. */
  | { kind: 'gap'; index: number }
  /** On the entry at `index`: join it. */
  | { kind: 'onto'; index: number }

/** The id prefix of a circuit made by hand, as opposed to one the plan defines. */
export const COMBO_PREFIX = 'combo:'

export function isComboId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(COMBO_PREFIX)
}

/** An exercise as it stands outside any circuit. */
function alone<T extends Exercise>(e: T): T {
  if (e.circuit == null && e.circuitRestSec == null && e.circuitRoundRestSec == null && !e.roundScreen) return e
  const { circuit: _circuit, circuitRestSec: _rest, circuitRoundRestSec: _roundRest, roundScreen: _screen, ...own } = e
  return own as T
}

/**
 * `natural` — the day as the plan and the session's own flags give it — as the
 * arrangement has it: in its order, with its circuits.
 *
 * An exercise the arrangement has never seen (one added since, or brought in by
 * opening the day up) lands after the exercise the day puts it after — past the
 * end of that one's circuit, so an arrival can't split a rotation in two.
 *
 * A station joining one of the day's circuits takes how that circuit is run from
 * a station the day put there. One left alone in what was a circuit is no
 * circuit at all, and reads as a plain exercise again.
 *
 * With no arrangement the list comes back untouched, the same array.
 */
export function arrange<T extends Exercise>(natural: T[], arrangement: Arrangement | null | undefined): T[] {
  if (!arrangement) return natural
  const { order, circuits } = arrangement

  // How each of the day's own circuits is run, read off a station still in it.
  const traits = new Map<string, Pick<Exercise, 'roundScreen' | 'circuitRoundRestSec'>>()
  for (const e of natural) {
    if (!e.circuit || circuits[e.key] !== undefined || traits.has(e.circuit)) continue
    traits.set(e.circuit, { roundScreen: e.roundScreen, circuitRoundRestSec: e.circuitRoundRestSec })
  }
  const placed = (e: T): T => {
    const to = circuits[e.key]
    if (to === undefined) return e
    if (to === null) return alone(e)
    const like = traits.get(to)
    const { roundScreen: _screen, circuitRoundRestSec: _roundRest, ...own } = e
    const out = { ...own, circuit: to } as T
    if (like?.roundScreen) out.roundScreen = true
    if (like?.circuitRoundRestSec != null) out.circuitRoundRestSec = like.circuitRoundRestSec
    return out
  }

  const at = new Map(order.map((key, i) => [key, i]))
  const out = natural
    .filter((e) => at.has(e.key))
    .sort((a, b) => at.get(a.key)! - at.get(b.key)!)
    .map(placed)
  natural.forEach((e, i) => {
    if (at.has(e.key)) return
    let insertAt = 0
    for (let j = i - 1; j >= 0; j--) {
      let idx = out.findIndex((o) => o.key === natural[j].key)
      if (idx < 0) continue
      const id = out[idx].circuit
      if (id) while (idx + 1 < out.length && out[idx + 1].circuit === id) idx += 1
      insertAt = idx + 1
      break
    }
    out.splice(insertAt, 0, placed(e))
  })

  // A run of one has nothing to rotate with.
  return out.map((e, i) =>
    e.circuit && out[i - 1]?.circuit !== e.circuit && out[i + 1]?.circuit !== e.circuit ? alone(e) : e,
  )
}

/** An id no circuit in the list is using. */
function freshComboId(exercises: readonly Exercise[]): string {
  const used = new Set(exercises.map((e) => e.circuit))
  let n = 1
  while (used.has(`${COMBO_PREFIX}${n}`)) n += 1
  return `${COMBO_PREFIX}${n}`
}

/**
 * The arrangement after the exercises `keys` are dropped at `target`, whose
 * index counts the entries of the list as arranged now (see
 * lib/circuitEntry.dayEntries — a circuit is one entry).
 *
 * - Onto an exercise: the two become a circuit, the dropped one after it.
 * - Onto a circuit: the dropped ones become its last stations.
 * - Into a gap: they move there. A whole entry moves as it is, a circuit still a
 *   circuit; stations taken out of one arrive as plain exercises.
 *
 * Whatever a station leaves behind closes up, and a circuit left with a single
 * station stops being one. Dropping something onto itself, or a station onto the
 * circuit it's already in, changes nothing and hands back the arrangement given.
 */
export function dropAt<T extends Exercise>(
  natural: T[],
  arrangement: Arrangement | null | undefined,
  keys: readonly string[],
  target: DropTarget,
): Arrangement | null {
  const list = arrange(natural, arrangement)
  const unchanged = arrangement ?? null
  const picked = new Set(keys)
  const groups = dayEntries(list).map((entry) => ({
    circuit: entry.kind === 'circuit' ? entry.circuit : null,
    items: entryExercises(entry),
  }))
  if (!groups.some((g) => g.items.some((e) => picked.has(e.key)))) return unchanged

  // What's lifted out, a group at a time: a group taken whole stays a group.
  const lifted: typeof groups = []
  const rest = groups.map((g) => {
    const taken = g.items.filter((e) => picked.has(e.key))
    if (taken.length === 0) return g
    if (taken.length === g.items.length) lifted.push({ circuit: g.circuit, items: taken })
    else lifted.push(...taken.map((e) => ({ circuit: null, items: [e] })))
    return { circuit: g.circuit, items: g.items.filter((e) => !picked.has(e.key)) }
  })

  let next: typeof groups
  if (target.kind === 'onto') {
    const onto = groups[target.index]
    if (!onto || onto.items.some((e) => picked.has(e.key))) return unchanged
    const id = onto.circuit ?? freshComboId(list)
    next = rest.map((g, i) =>
      i === target.index ? { circuit: id, items: [...g.items, ...lifted.flatMap((l) => l.items)] } : g,
    )
  } else {
    const index = Math.max(0, Math.min(target.index, groups.length))
    next = [...rest.slice(0, index), ...lifted, ...rest.slice(index)]
  }

  const flat = next
    .filter((g) => g.items.length > 0)
    .flatMap((g) => g.items.map((e) => ({ key: e.key, circuit: g.items.length > 1 ? g.circuit : null })))
  if (flat.every((e, i) => e.key === list[i]?.key && e.circuit === (list[i]?.circuit ?? null))) return unchanged

  const native = new Map(natural.map((e) => [e.key, e.circuit ?? null]))
  const circuits: Arrangement['circuits'] = {}
  for (const e of flat) if (e.circuit !== native.get(e.key)) circuits[e.key] = e.circuit
  return { order: flat.map((e) => e.key), circuits }
}
