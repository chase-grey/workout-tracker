/**
 * A circuit read as the one thing it is.
 *
 * A circuit is stored as its stations — the push day's arm block is four
 * exercises sharing `circuit: 'arms'`, each with its own key and history — and
 * the session flow rotates through them a set at a time (see lib/circuit). But
 * it's one block of the day: you walk to the cable stack once, do three rounds,
 * and walk away. Every surface that lists a day's exercises had been listing the
 * stations, so the arm block read as four separate exercises everywhere it
 * appeared, and every edit that acts on a row could pull one station out of it.
 *
 * So the lists read the day as entries — an exercise, or a whole circuit — and
 * the circuit is shown, added, dropped, moved and struck off as one, the way a
 * one-arm pair is (see lib/pairedSides). The stations stay what's stored and
 * what's logged: this module only groups them.
 *
 * Grouped by the rule buildSetOrder rotates by: only a consecutive run of
 * stations sharing an id is a circuit. A run of one — a station whose mates were
 * deleted or dragged away before this, or one the same id reused later in the
 * day — is just an exercise, since there's nothing for it to rotate with. That
 * holds whether the day came from the shipped plan or from a stored one: a
 * stored day re-adopts `circuit` from the defaults (see mergeDayExercises), and
 * whatever order it was left in decides what forms a run.
 *
 * Pure module — no React/DOM.
 */

import type { SetLog } from '../types'
import { sidePartnerKey } from './pairedSides'

type Station = { key: string; circuit?: string }

/** One row of a day: an exercise on its own, or a whole circuit of them. */
export type DayEntry<T extends Station> =
  | { kind: 'exercise'; id: string; exercise: T; index: number }
  | { kind: 'circuit'; id: string; circuit: string; stations: T[]; indexes: number[] }

/**
 * The day's exercises as the entries a list shows, in day order.
 *
 * Each entry has an `id` stable across edits that don't reorder the day: an
 * exercise's key, or `circuit:<id>` for a circuit (with `#2`, `#3` for an id
 * the day reuses later).
 */
export function dayEntries<T extends Station>(exercises: readonly T[]): DayEntry<T>[] {
  const out: DayEntry<T>[] = []
  const seen = new Map<string, number>()
  let i = 0
  while (i < exercises.length) {
    const id = exercises[i].circuit
    let end = i + 1
    if (id) while (end < exercises.length && exercises[end].circuit === id) end += 1
    if (!id || end - i < 2) {
      out.push({ kind: 'exercise', id: exercises[i].key, exercise: exercises[i], index: i })
      i += 1
      continue
    }
    const n = (seen.get(id) ?? 0) + 1
    seen.set(id, n)
    const indexes: number[] = []
    for (let k = i; k < end; k++) indexes.push(k)
    out.push({
      kind: 'circuit',
      id: n === 1 ? `circuit:${id}` : `circuit:${id}#${n}`,
      circuit: id,
      stations: indexes.map((k) => exercises[k]),
      indexes,
    })
    i = end
  }
  return out
}

/** Every exercise an entry holds, in day order. */
export function entryExercises<T extends Station>(entry: DayEntry<T>): T[] {
  return entry.kind === 'circuit' ? entry.stations : [entry.exercise]
}

/**
 * The keys an edit on `key` acts on as one: its whole circuit when it's a station
 * of one, else just `key`. (A one-arm pair inside a circuit is inside the run, so
 * the circuit already carries it.)
 */
export function circuitRunKeys(exercises: readonly Station[], key: string): string[] {
  const entry = dayEntries(exercises).find((e) => entryExercises(e).some((x) => x.key === key))
  return entry ? entryExercises(entry).map((e) => e.key) : [key]
}

/**
 * The day with the entry at `from` moved to `to`, both as indexes into
 * {@link dayEntries} — a drag in a list that shows circuits as one row.
 */
export function moveEntry<T extends Station>(exercises: readonly T[], from: number, to: number): T[] {
  const entries = dayEntries(exercises)
  if (from < 0 || from >= entries.length) return [...exercises]
  const [moved] = entries.splice(from, 1)
  entries.splice(Math.max(0, Math.min(to, entries.length)), 0, moved)
  return entries.flatMap(entryExercises)
}

/** A sided name without its side: `lateral raise (left)` → `lateral raise`. */
export function sidelessName(name: string): string {
  return name.replace(/\s*\((left|right)\)\s*$/i, '')
}

/** One movement of a circuit: a station, or both sides of a one-arm pair. */
export type CircuitMember<T> = { keys: string[]; name: string; stations: T[] }

/**
 * A circuit's movements, a one-arm pair counted once — at its first station,
 * which is the side that leads (see plan.sideOrderedExercises). The arm block
 * reads as three movements, not four: the two lateral raises are one movement
 * done an arm at a time.
 */
export function circuitMembers<T extends { key: string; name: string }>(stations: readonly T[]): CircuitMember<T>[] {
  const out: CircuitMember<T>[] = []
  const placed = new Set<string>()
  for (const s of stations) {
    if (placed.has(s.key)) continue
    const partnerKey = sidePartnerKey(s.key)
    const partner = partnerKey ? stations.find((o) => o.key === partnerKey) : undefined
    if (partner) {
      placed.add(s.key)
      placed.add(partner.key)
      out.push({ keys: [s.key, partner.key], name: sidelessName(s.name), stations: [s, partner] })
    } else {
      placed.add(s.key)
      out.push({ keys: [s.key], name: s.name, stations: [s] })
    }
  }
  return out
}

/** The movements of a circuit as one compact line: `tricep pushdown · lateral raise · …`. */
export function membersLine(stations: readonly { key: string; name: string }[]): string {
  return circuitMembers(stations)
    .map((m) => m.name)
    .join(' · ')
}

/**
 * What a circuit is called: the group its stations share (`delts + triceps
 * circuit`), or plain `circuit` when they've been regrouped apart.
 */
export function circuitTitle(stations: readonly { group?: string }[]): string {
  const group = stations[0]?.group?.trim()
  return group && stations.every((s) => s.group?.trim() === group) ? group : 'circuit'
}

/** How many rounds a circuit runs: its longest station (see lib/circuit.buildSetOrder). */
export function circuitRounds(setCounts: readonly number[]): number {
  return Math.max(0, ...setCounts)
}

/** `circuit · 3 rounds`. */
export function roundsLabel(rounds: number): string {
  return `circuit · ${rounds} round${rounds === 1 ? '' : 's'}`
}

/**
 * A circuit's progress counted in rounds rather than station-sets, for a circuit
 * run a round at a time (see PlannedExercise.roundScreen), where one tap logs
 * every station's set of the round — counted by sets, one tap would take four
 * off the count at once.
 *
 * `sets` is each station's logged sets. A round is owed while any station's set
 * of it is still in play (not skipped), and done once every one of those is.
 */
export function roundTally(sets: readonly (readonly SetLog[])[]): { done: number; all: number } {
  let done = 0
  let all = 0
  const rounds = circuitRounds(sets.map((s) => s.length))
  for (let r = 0; r < rounds; r++) {
    const inPlay = sets.map((s) => s[r]).filter((s): s is SetLog => !!s && !s.skipped)
    if (inPlay.length === 0) continue
    all += 1
    if (inPlay.every((s) => s.done)) done += 1
  }
  return { done, all }
}
