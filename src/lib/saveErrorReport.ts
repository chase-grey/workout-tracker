/**
 * Which failed saves to report to the backend's save_errors tab, and when.
 *
 * The outbox retries a stuck write on every flush, and a flush runs on every
 * refresh, so reporting each failure as it happens would post the same error
 * dozens of times a session. One report per write per distinct error is enough
 * to diagnose it; a fresh one after REPORT_EVERY_MS shows it is still stuck.
 */

/** A report as the backend's `save_error` route takes it. */
export type SaveErrorReport = {
  build: string
  route: string
  writeId: string
  message: string
  pending: number
  payload: unknown
}

/** When each write+error pair was last reported, epoch ms, keyed by {@link reportKey}. */
export type ReportLog = Record<string, number>

export const REPORT_EVERY_MS = 6 * 60 * 60 * 1000

export function reportKey(r: Pick<SaveErrorReport, 'writeId' | 'message'>): string {
  return `${r.writeId}|${r.message}`
}

/**
 * The reports that are due, and the log to keep once they've been sent.
 * Entries past their window are dropped, so the log only ever holds the
 * handful of writes currently stuck.
 */
export function dueReports(
  reports: SaveErrorReport[],
  log: ReportLog,
  now: number,
): { due: SaveErrorReport[]; log: ReportLog } {
  const next: ReportLog = {}
  for (const [k, at] of Object.entries(log)) if (now - at < REPORT_EVERY_MS) next[k] = at
  const due: SaveErrorReport[] = []
  for (const r of reports) {
    const k = reportKey(r)
    if (k in next) continue
    next[k] = now
    due.push(r)
  }
  return { due, log: next }
}
