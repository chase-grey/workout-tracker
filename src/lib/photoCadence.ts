import {
  coldSplitOf,
  coldTailorsLeftOf,
  coldTailorsRightOf,
  warmSplitOf,
  warmTailorsLeftOf,
  warmTailorsRightOf,
  type FlexEntry,
} from './flex'
import { weekStartISO } from './dates'
import type { PhotoGate, PhotoKind } from './photoSteps'

/**
 * Angle photos are a weekly measurement, not a per-session one — a week's worth
 * of stretching is what moves a reading, so asking every session is noise. Each
 * shot is owed once per Mon–Sun week: take it in Monday's session and the rest
 * of the week's sessions run straight through without a camera screen.
 */

/** Whether an entry carries the reading a given shot would produce. */
const CAPTURED: Record<PhotoKind, (e: FlexEntry) => boolean> = {
  'cold-split': (e) => coldSplitOf(e) != null,
  'cold-tailors': (e) => coldTailorsLeftOf(e) != null || coldTailorsRightOf(e) != null,
  'warm-tailors': (e) => warmTailorsLeftOf(e) != null || warmTailorsRightOf(e) != null,
  'warm-split': (e) => warmSplitOf(e) != null,
}

/** The shots already logged in the Mon–Sun week containing `today`. */
export function shotsThisWeek(entries: FlexEntry[], today: string): Set<PhotoKind> {
  const week = weekStartISO(today)
  const out = new Set<PhotoKind>()
  for (const e of entries) {
    if (weekStartISO(e.date) !== week) continue
    for (const kind of Object.keys(CAPTURED) as PhotoKind[]) {
      if (CAPTURED[kind](e)) out.add(kind)
    }
  }
  return out
}

/**
 * Narrow a photo screen to the shots still owed this week, or null when the week
 * already has them all — the caller skips the screen entirely. A gate whose
 * shots are only partly covered still shows, asking for just the missing ones.
 */
export function dueGate(
  gate: PhotoGate | null,
  entries: FlexEntry[],
  today: string,
): PhotoGate | null {
  if (!gate) return null
  const have = shotsThisWeek(entries, today)
  const shots = gate.shots.filter((k) => !have.has(k))
  if (shots.length === 0) return null
  return shots.length === gate.shots.length ? gate : { ...gate, shots }
}
