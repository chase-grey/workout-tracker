/**
 * Cardio: a session is logged after the fact as a kind and a date, with a length
 * and a distance when there's one to give — a soccer match has no distance, and
 * nobody times a pickup game. There is no guided cardio session — nobody taps a
 * phone mid-run — so this is the whole model.
 */

import { weekStartISO } from './dates'

/**
 * The quick picks a person starts with, before they add or remove any (see
 * cardioKinds). Anything else is added as a pick of their own and stored as typed.
 */
export const DEFAULT_CARDIO_KINDS = [
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
] as const

/** A default kind, or one a person named — the backend stores it as text. */
export type CardioKind = (typeof DEFAULT_CARDIO_KINDS)[number] | (string & {})

/**
 * Kinds measured in time alone. Nobody knows how far they ran in a soccer
 * game, so these never ask for a distance; anything else offers the field.
 */
const NO_DISTANCE = new Set<string>(['soccer', 'basketball', 'tennis', 'hiit'])

export function asksDistance(kind: string): boolean {
  return !NO_DISTANCE.has(kind)
}

const KIND_MAX = 24

/**
 * The person's quick picks (Settings.cardioKinds), or the defaults if they've
 * never edited them. An emptied list stays empty rather than springing back.
 */
export function cardioKinds(saved: readonly CardioKind[] | undefined): CardioKind[] {
  return [...(saved ?? DEFAULT_CARDIO_KINDS)]
}

/** `name` tidied for a quick pick: trimmed, lower case, inner spaces collapsed, capped. */
export function normalizeKind(name: string): CardioKind {
  return name.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, KIND_MAX)
}

/** `kinds` with `name` appended, unless it's blank or already there. */
export function addCardioKind(kinds: CardioKind[], name: string): CardioKind[] {
  const k = normalizeKind(name)
  return k === '' || kinds.includes(k) ? kinds : [...kinds, k]
}

/** `kinds` without `name`. Entries already logged under it keep it. */
export function removeCardioKind(kinds: CardioKind[], name: CardioKind): CardioKind[] {
  return kinds.filter((k) => k !== name)
}

/**
 * The chips the log sheet shows: the picks, plus the kind in hand when it isn't
 * one of them (a plan's session, or a pick just removed) so it can still be seen
 * selected.
 */
export function kindChips(kinds: CardioKind[], selected: CardioKind): CardioKind[] {
  return selected === '' || kinds.includes(selected) ? kinds : [...kinds, selected]
}

export type CardioEntry = {
  /** Client-minted, so a retried save is recognised rather than stored twice. */
  id: string
  date: string // YYYY-MM-DD
  kind: CardioKind
  minutes?: number
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
    weeks.set(week, (weeks.get(week) ?? 0) + (e.minutes ?? 0))
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

/** "32 min · 3.1 mi", whichever of the two were given, or '' for neither. */
export function cardioSummary(e: Pick<CardioEntry, 'minutes' | 'distanceMi'>): string {
  const parts: string[] = []
  if (e.minutes) parts.push(`${Math.round(e.minutes)} min`)
  if (e.distanceMi) parts.push(`${Number(e.distanceMi.toFixed(2))} mi`)
  return parts.join(' · ')
}

/** "soccer", or "run · 32 min · 3.1 mi". */
export function cardioLine(e: Pick<CardioEntry, 'kind' | 'minutes' | 'distanceMi'>): string {
  const summary = cardioSummary(e)
  return summary ? `${e.kind} · ${summary}` : e.kind
}
