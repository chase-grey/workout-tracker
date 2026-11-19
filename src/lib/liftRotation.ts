/**
 * Which lift day is up next.
 *
 * The lift days take turns, and the turn goes to whichever has waited longest:
 * a day never trained before any that has, then the one trained longest ago,
 * with the offered order settling ties. Run in order that is a plain cycle —
 *
 *   push → full body → pull + legs → push → …
 *
 * — and it stays sensible when the order is broken: train a day twice running,
 * or out of turn, and the day that has now waited longest is still the one
 * asked for.
 *
 * Full body carries one more condition. It trains everything, so it is only
 * suggested after a day off the bar: with a lift logged yesterday (or already
 * today) its turn passes to the split day that has waited longest. Because the
 * turn is read off how long each day has waited rather than off a counter, full
 * body stays owed through that — it is still the longest-waiting day tomorrow,
 * and takes the suggestion on the first day that follows a rest day. Nothing is
 * held back the day after a full body session; the rotation just carries on.
 *
 * Read off logged history rather than a stored pointer, so it survives a
 * reinstall and agrees across devices. Only lifting counts: a stretch, a cardio
 * session or a core block is a rest day here (callers pass `trainingSessions`,
 * which leaves those out). Pure module: no React/DOM, no storage.
 */

import type { DayType } from '../types'
import { daysBetween } from './dates'

/** A lift session as far as the rotation cares: the day it was on and what it trained. */
export type RotationSession = { date: string; dayType: DayType }

/**
 * The day to suggest today, or null when there are no days to offer.
 *
 * @param sessions lift sessions in log order (oldest first within a date)
 * @param today    YYYY-MM-DD
 * @param order    the days on offer, in the order they're offered
 */
export function nextLiftDay(sessions: RotationSession[], today: string, order: DayType[]): DayType | null {
  if (order.length === 0) return null

  // Where each day was last trained: its date, and its place in the log to
  // split a date that held two sessions. Dates are YYYY-MM-DD, so a plain
  // string compare orders them.
  const last = new Map<DayType, { date: string; seq: number }>()
  let liftedSinceYesterday = false
  sessions.forEach((s, seq) => {
    const prev = last.get(s.dayType)
    if (!prev || s.date >= prev.date) last.set(s.dayType, { date: s.date, seq })
    const ago = daysBetween(s.date, today)
    if (ago === 0 || ago === 1) liftedSinceYesterday = true
  })

  // Longest-waiting first; `sort` is stable, so untrained days and exact ties
  // keep the offered order.
  const byWait = [...order].sort((a, b) => {
    const la = last.get(a)
    const lb = last.get(b)
    if (!la || !lb) return la ? 1 : lb ? -1 : 0
    return la.date === lb.date ? la.seq - lb.seq : la.date < lb.date ? -1 : 1
  })

  if (byWait[0] === 'fullbody' && liftedSinceYesterday && byWait.length > 1) return byWait[1]
  return byWait[0]
}
