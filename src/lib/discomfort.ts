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
 *
 * A twinge is as often noticed on the way home as mid-set, so a flag can also be
 * added to a session that's already saved — see {@link discomfortEdit}, which
 * produces the note rewrite, and {@link applyNotesEdit}, which applies it.
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

/**
 * `spots` narrowed to the ones the app counts, in the order given.
 *
 * The tally only means anything if the same twinge is named the same way every
 * time, so a spot outside the offered list is dropped rather than recorded —
 * "left knee" and "knee" would never add up to two. The in-app picker can only
 * produce valid spots; this guards the coach's tool call, which can name
 * anything.
 */
export function knownSpots(spots: readonly string[]): DiscomfortSpot[] {
  const out: DiscomfortSpot[] = []
  for (const s of spots) {
    const spot = DISCOMFORT_SPOTS.find((k) => k === s.trim().toLowerCase())
    if (spot && !out.includes(spot)) out.push(spot)
  }
  return out
}

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
 * A note's segments, trimmed, with the empties dropped.
 *
 * A note is `; `-joined text, so anything looking for a marker in one has to look
 * segment by segment rather than at the whole string: a row can carry a marker and
 * a discomfort flag added to it afterwards, and neither is the note entire.
 */
export function noteSegments(note: string | null | undefined): string[] {
  return (note ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * The spots flagged in a note, in the order it lists them. Anything that isn't a
 * `discomfort:` segment is ignored, so a hand-typed or imported note that merely
 * mentions a knee doesn't read as a flag.
 */
export function parseDiscomfort(note: string | null | undefined): string[] {
  const spots: string[] = []
  for (const segment of noteSegments(note)) {
    if (!isFlag(segment)) continue
    spots.push(...segment.slice(MARKER.length).split(','))
  }
  return normalizeSpots(spots)
}

/**
 * `note` with its discomfort flag set to `spots`, or with the flag removed when
 * `spots` is empty. Other segments keep their text and their order; the flag
 * lands last, so a note the user actually wrote still reads first.
 */
export function withDiscomfort(note: string | null | undefined, spots: readonly string[]): string {
  const kept = noteSegments(note).filter((s) => !isFlag(s))
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

/**
 * The key a row's session is counted under — its id, or its date for rows saved
 * without one (imported history, and anything logged before session ids).
 */
export function sessionKeyOf(row: WorkoutRow): string {
  return row.session_id || row.date
}

/**
 * A rewrite of one logged exercise's note, addressed by session and exercise
 * rather than by row.
 *
 * The note belongs to the exercise log and `sessionToRows` copies it onto every
 * one of that exercise's set rows, so they only ever move together — which is
 * also why a flag added afterwards rewrites rows in place instead of appending:
 * a second row for the same set would be counted as a set.
 */
export type NotesEdit = { session: string; exercise: string; notes: string }

/**
 * The edit that sets a logged exercise's discomfort flag to `spots` — or clears
 * it, when `spots` is empty. Null when that session logged no such exercise.
 *
 * This is the path for a twinge noticed after the fact: the one during a session
 * is written straight to the live log, but by the time you're driving home the
 * session is saved and the note has to be edited where it landed.
 */
export function discomfortEdit(
  rows: WorkoutRow[],
  session: string,
  exercise: string,
  spots: readonly string[],
): NotesEdit | null {
  const logged = rows.find((r) => r.exercise === exercise && sessionKeyOf(r) === session)
  if (!logged) return null
  return { session, exercise, notes: withDiscomfort(logged.notes, spots) }
}

/** `rows` with `edit` applied to every set row of the exercise it addresses. */
export function applyNotesEdit(rows: WorkoutRow[], edit: NotesEdit): WorkoutRow[] {
  return rows.map((r) =>
    r.exercise === edit.exercise && sessionKeyOf(r) === edit.session
      ? { ...r, notes: edit.notes }
      : r,
  )
}

/**
 * The session `exercise` was last logged in — on `date`, if one is named.
 *
 * What "today's leg press" resolves to when a flag arrives without a session to
 * hang it on. Ties on a date go to the later-logged session, rows arriving in
 * the order they were appended.
 */
export function lastSessionWith(
  rows: WorkoutRow[],
  exercise: string,
  date?: string,
): { session: string; date: string } | null {
  let found: { session: string; date: string } | null = null
  for (const r of rows) {
    if (r.exercise !== exercise) continue
    if (date && r.date !== date) continue
    if (!found || r.date >= found.date) found = { session: sessionKeyOf(r), date: r.date }
  }
  return found
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
    const sessionId = sessionKeyOf(r)
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
