/**
 * The wall-clock time each set of a session actually took, priced the way the
 * estimate prices it: a set owns the stretch from the moment it came on screen
 * to the moment the next one did, so the rest after a set is that set's. Summed
 * by exercise, it's what the checklist sets beside the projection.
 *
 * Kept as one running boundary rather than per-set start and end stamps: every
 * second of the session lands on exactly one set, so the exercises add back up
 * to the session clock — pauses, the bar loading before set one, and a set
 * walked away from by a checklist jump all included, charged to the set that
 * closed next.
 */
export type SetClock = {
  sessionId: string
  /** When the span now running began (epoch ms). */
  markAt: number
  /** The set whose rest is on screen, still running up its span. */
  restingKey: string | null
  spentSec: Record<string, number>
}

export function startSetClock(sessionId: string, atMs: number): SetClock {
  return { sessionId, markAt: atMs, restingKey: null, spentSec: {} }
}

/** Charge the span up to now to `key` and start the next one. */
export function closeSet(clock: SetClock, key: string, now: number): SetClock {
  const sec = Math.max(0, (now - clock.markAt) / 1000)
  return {
    ...clock,
    markAt: Math.max(clock.markAt, now),
    restingKey: null,
    spentSec: { ...clock.spentSec, [key]: (clock.spentSec[key] ?? 0) + sec },
  }
}

/** A set was logged and its rest opened: the span stays open until the rest ends. */
export function restAfter(clock: SetClock, key: string): SetClock {
  return { ...clock, restingKey: key }
}

/** The rest closed, however it closed. A no-op when no set's rest was running. */
export function endRest(clock: SetClock, now: number): SetClock {
  return clock.restingKey ? closeSet(clock, clock.restingKey, now) : clock
}

/** Seconds per exercise so far, counting a rest still running toward its set. */
export function spentByExercise(clock: SetClock, now: number, exerciseOf: (key: string) => string | undefined): Map<string, number> {
  const spent = clock.restingKey ? closeSet(clock, clock.restingKey, now).spentSec : clock.spentSec
  const totals = new Map<string, number>()
  Object.entries(spent).forEach(([key, sec]) => {
    const exercise = exerciseOf(key)
    if (exercise != null) totals.set(exercise, (totals.get(exercise) ?? 0) + sec)
  })
  return totals
}

/** A saved clock, if it belongs to this session; otherwise a fresh one from its start. */
export function resumeSetClock(saved: SetClock | null, sessionId: string, startedAt: string | undefined, now: number): SetClock {
  if (saved?.sessionId === sessionId) return saved
  const start = startedAt ? Date.parse(startedAt) : NaN
  return startSetClock(sessionId, Number.isFinite(start) ? start : now)
}

/** Minutes:seconds, or hours:minutes:seconds past the hour. */
export function clockText(sec: number): string {
  const total = Math.max(0, Math.round(sec))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}
