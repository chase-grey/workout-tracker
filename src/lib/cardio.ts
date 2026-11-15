/**
 * Cardio: a session is logged after the fact as a kind, a length and, when it
 * has one, a distance. There is no guided cardio session — nobody taps a phone
 * mid-run — so this is the whole model.
 */

import { weekStartISO } from './dates'

/** The kinds offered as chips. Anything else typed under "other" is stored as typed. */
export const CARDIO_KINDS = [
  'run',
  'walk',
  'hike',
  'bike',
  'swim',
  'row',
  'soccer',
  'basketball',
  'tennis',
  'hiit',
  'other',
] as const

/** A preset kind, or a name typed under "other" — the backend stores it as text. */
export type CardioKind = (typeof CARDIO_KINDS)[number] | (string & {})

/**
 * Kinds measured in time alone. Nobody knows how far they ran in a soccer
 * game, so these never ask for a distance; anything else offers the field.
 */
const NO_DISTANCE = new Set<string>(['soccer', 'basketball', 'tennis', 'hiit'])

export function asksDistance(kind: string): boolean {
  return !NO_DISTANCE.has(kind)
}

export type CardioEntry = {
  /** Client-minted, so a retried save is recognised rather than stored twice. */
  id: string
  date: string // YYYY-MM-DD
  kind: CardioKind
  minutes: number
  distanceMi?: number
}

/** Distinct dates with any cardio logged, ascending — what the weekly goal counts. */
export function cardioDates(entries: CardioEntry[]): string[] {
  return [...new Set(entries.map((e) => e.date))].sort()
}

/** Total minutes in each Mon–Sun week, keyed by that week's Monday. */
export function cardioMinutesByWeek(entries: CardioEntry[]): Map<string, number> {
  const weeks = new Map<string, number>()
  for (const e of entries) {
    const week = weekStartISO(e.date)
    weeks.set(week, (weeks.get(week) ?? 0) + e.minutes)
  }
  return weeks
}

/** Entries merged by id, a fetched copy replacing the local one, newest first. */
export function mergeCardio(local: CardioEntry[], fetched: CardioEntry[]): CardioEntry[] {
  const byId = new Map<string, CardioEntry>()
  for (const e of local) byId.set(e.id, e)
  for (const e of fetched) byId.set(e.id, e)
  return [...byId.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/** "32 min · 3.1 mi", or just the minutes. */
export function cardioSummary(e: Pick<CardioEntry, 'minutes' | 'distanceMi'>): string {
  const min = `${Math.round(e.minutes)} min`
  return e.distanceMi ? `${min} · ${Number(e.distanceMi.toFixed(2))} mi` : min
}
