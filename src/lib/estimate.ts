/** Rough time estimates for the guided session UIs. */

/** Assumed working time per set when we have nothing better (lifting). */
export const WORK_PER_SET_SEC = 40

export type RemainingItem = { remainingSets: number; workSec: number; restSec: number }

/** Total estimated seconds left = Σ remainingSets × (workSec + restSec). */
export function estimateSecs(items: RemainingItem[]): number {
  return items.reduce((sum, i) => sum + Math.max(0, i.remainingSets) * (i.workSec + i.restSec), 0)
}

/** Human-friendly duration, e.g. "~12 min" / "<1 min" / "0 min". */
export function formatDuration(totalSec: number): string {
  if (totalSec <= 0) return '0 min'
  const min = Math.round(totalSec / 60)
  if (min < 1) return '<1 min'
  return `~${min} min`
}
