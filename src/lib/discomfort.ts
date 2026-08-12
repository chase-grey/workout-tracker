/**
 * Discomfort flags — "my knee felt odd on this one" — recorded against the
 * exercise it happened on, and nothing more.
 *
 * A single twinge isn't information. The same twinge on the same movement three
 * sessions running is, and that's the only thing this module exists to make
 * visible: the flag is counted, and the count comes back up next to the lift the
 * next time it's programmed.
 *
 * Flagging deliberately changes nothing about the prescription. Sets, reps,
 * weight and rest are untouched and no plan edit follows from a flag — an app
 * that quietly dropped the load would be making a call that belongs to the
 * lifter, and would also destroy the evidence, since the next session's numbers
 * would no longer be comparable to the ones that hurt.
 *
 * Stored inside the exercise log's existing free-text `notes`, which already
 * round-trips to the sheet on every set row (see sessionToRows), so recording one
 * asks nothing new of the backend. A note can hold other text alongside the flag;
 * segments are `; `-separated and everything that isn't the flag is preserved.
 */

import type { WorkoutRow } from '../types'
import { fmtSessionDate } from './exerciseHistory'

/**
 * The spots offered when flagging, in the order they're listed. A fixed list
 * rather than free text, because the whole point is counting repeats: "knee" and
 * "left knee felt weird" would never add up to two.
 */
export const DISCOMFORT_SPOTS = [
  'knee',
  'hip',
  'lower back',
  'shoulder',
  'elbow',
  'wrist',
  'ankle',
  'neck',
] as const

export type DiscomfortSpot = (typeof DISCOMFORT_SPOTS)[number]

/** Opens the discomfort segment of a note. */
const MARKER = 'discomfort:'

/** Joins a note's segments — the flag is one of them, not the whole note. */
const SEP = '; '

/** Whether a note segment is the discomfort flag rather than ordinary text. */
function isFlag(segment: string): boolean {
  return segment.toLowerCase().startsWith(MARKER)
}

/** Lowercased, trimmed, order-preserving dedupe — spots are counted by name. */
function normalizeSpots(spots: readonly string[]): string[] {
  const out: string[] = []
  for (const spot of spots) {
    const s = spot.trim().toLowerCase()
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

/**
 * The spots flagged in a note, in the order it lists them. Anything that isn't a
 * `discomfort:` segment is ignored, so a hand-typed or imported note that merely
 * mentions a knee doesn't read as a flag.
 */
export function parseDiscomfort(note: string | null | undefined): string[] {
  if (!note) return []
  const spots: string[] = []
  for (const segment of note.split(';')) {
    const trimmed = segment.trim()
    if (!isFlag(trimmed)) continue
    spots.push(...trimmed.slice(MARKER.length).split(','))
  }
  return normalizeSpots(spots)
}

/**
 * `note` with its discomfort flag set to `spots`, or with the flag removed when
 * `spots` is empty. Other segments keep their text and their order; the flag
 * lands last, so a note the user actually wrote still reads first.
 */
export function withDiscomfort(note: string | null | undefined, spots: readonly string[]): string {
  const kept = (note ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !isFlag(s))
  const flagged = normalizeSpots(spots)
  if (flagged.length > 0) kept.push(`${MARKER} ${flagged.join(', ')}`)
  return kept.join(SEP)
}

/** `note` with one spot flagged if it wasn't, or unflagged if it was. */
export function toggleDiscomfort(note: string | null | undefined, spot: string): string {
  const spots = parseDiscomfort(note)
  const s = spot.trim().toLowerCase()
  return withDiscomfort(note, spots.includes(s) ? spots.filter((x) => x !== s) : [...spots, s])
}

/** One session in which an exercise was flagged, and where it was felt. */
export type DiscomfortReport = {
  /** The session id, or the date for rows saved without one. */
  sessionId: string
  date: string
  spots: string[]
}

/**
 * Every session `exerciseKey` was flagged in, newest first.
 *
 * The flag lives on the exercise log, so it lands on all of that exercise's set
 * rows — one report per session, not one per set. Not scoped to an A/B slot the
 * way {@link exerciseHistory} is: a sore knee doesn't care which press led that
 * day, and halving the history would hide exactly the repeat this is for.
 */
export function discomfortReports(rows: WorkoutRow[], exerciseKey: string): DiscomfortReport[] {
  const bySession = new Map<string, DiscomfortReport>()
  for (const r of rows) {
    if (r.exercise !== exerciseKey) continue
    const spots = parseDiscomfort(r.notes)
    if (spots.length === 0) continue
    const sessionId = r.session_id || r.date
    const prev = bySession.get(sessionId)
    if (!prev) {
      bySession.set(sessionId, { sessionId, date: r.date, spots })
      continue
    }
    for (const s of spots) if (!prev.spots.includes(s)) prev.spots.push(s)
  }
  // Reversed before the sort so two sessions on one date come back with the
  // later-logged one first: rows arrive chronologically, and the sort is stable.
  return [...bySession.values()]
    .reverse()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/** How often one spot has been flagged, and when it last was. */
export type DiscomfortCount = { spot: string; sessions: number; lastDate: string }

/**
 * The reports rolled up per spot, most-flagged first and most recent to break a
 * tie — so the thing that keeps happening leads the list.
 */
export function discomfortCounts(reports: readonly DiscomfortReport[]): DiscomfortCount[] {
  const bySpot = new Map<string, DiscomfortCount>()
  for (const report of reports) {
    for (const spot of report.spots) {
      const prev = bySpot.get(spot)
      if (!prev) {
        bySpot.set(spot, { spot, sessions: 1, lastDate: report.date })
        continue
      }
      prev.sessions += 1
      if (report.date > prev.lastDate) prev.lastDate = report.date
    }
  }
  return [...bySpot.values()].sort(
    (a, b) =>
      b.sessions - a.sessions || (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0),
  )
}

/**
 * One spot's tally for display: `knee ×3 · last aug 11`, or just `knee · aug 11`
 * when it has only happened once — "last" implies a pattern that a single report
 * hasn't established.
 */
export function fmtDiscomfortCount(count: DiscomfortCount, today: Date = new Date()): string {
  const when = fmtSessionDate(count.lastDate, today)
  return count.sessions === 1
    ? `${count.spot} · ${when}`
    : `${count.spot} ×${count.sessions} · last ${when}`
}
