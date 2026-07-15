/**
 * Shared helpers for time-scaled chart axes. Charts key off a `date`
 * (YYYY-MM-DD) string, but a categorical axis spaces points evenly regardless
 * of the real gap between them. Converting each point to a numeric timestamp and
 * using a `scale="time"` X axis makes the horizontal spacing proportional to the
 * actual elapsed time.
 */
import { parseISODate } from './dates'

/** Add a numeric `t` (local-midnight ms) to each date-keyed row. */
export function withTime<T extends { date: string }>(rows: T[]): (T & { t: number })[] {
  return rows.map((r) => ({ ...r, t: parseISODate(r.date).getTime() }))
}

/** Short M/D label for axis ticks. */
export function fmtTick(ms: number): string {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** Fuller M/D/YY label for tooltip headers. */
export function fmtDateLabel(ms: number): string {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`
}

/** Props for a time-scaled X axis over a numeric `t` timestamp key. */
export const timeXAxis = {
  dataKey: 't',
  type: 'number' as const,
  scale: 'time' as const,
  domain: ['dataMin', 'dataMax'] as [string, string],
  tickFormatter: fmtTick,
}
