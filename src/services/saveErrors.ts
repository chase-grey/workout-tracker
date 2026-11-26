import type { QueuedWrite } from '../lib/outbox'
import { dueReports, type ReportLog, type SaveErrorReport } from '../lib/saveErrorReport'
import { APP_COMMIT } from '../lib/version'
import { api } from './api'

const LOG_KEY = 'wt.saveErrorReports'

function loadLog(): ReportLog {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    return raw ? (JSON.parse(raw) as ReportLog) : {}
  } catch {
    return {}
  }
}

/**
 * Tell the backend about writes the outbox couldn't deliver, so the failure can
 * be read off the save_errors tab rather than off the phone (see
 * SimpleBackend.gs appendSaveError). Best-effort and never throws: a report
 * that can't be sent changes nothing about the write, which stays queued.
 *
 * The route is posted to directly, not queued — it's the outbox that's failing.
 * When the backend can't be reached at all, nothing lands, but that case can be
 * seen from anywhere by asking the backend directly.
 */
export async function reportSaveFailures(
  failures: { write: QueuedWrite; message: string }[],
  pending: number,
): Promise<void> {
  if (failures.length === 0 || !api.isConfigured()) return
  const reports: SaveErrorReport[] = failures.map(({ write, message }) => ({
    build: APP_COMMIT,
    route: write.type,
    writeId: write.id,
    message,
    pending,
    payload: write,
  }))
  const { due, log } = dueReports(reports, loadLog(), Date.now())
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log))
  } catch {
    /* storage full is itself worth reporting; go ahead and send */
  }
  for (const r of due) {
    try {
      await api.reportSaveError(r)
    } catch {
      /* an older backend without the route, or none reachable */
    }
  }
}

/**
 * Tell the backend the pose detector wouldn't load, on the same save_errors tab
 * — the phone has no console, and the stored error in Settings is only seen by
 * someone who goes looking.
 */
export function reportPoseFailure(detail: unknown): Promise<void> {
  const err = detail as { message?: string } | null
  return reportDeviceFailure('pose_model', err?.message ?? 'pose model failed to load', {
    error: detail,
    userAgent: navigator.userAgent,
  })
}

/**
 * A render threw and took the whole screen with it (see CrashScreen). The stack,
 * and how this page was reached, are what make it fixable from this side.
 */
export function reportCrash(error: unknown, componentStack?: string | null): Promise<void> {
  const err = error instanceof Error ? error : new Error(String(error))
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  return reportDeviceFailure('crash', err.message || err.name, {
    stack: err.stack,
    componentStack,
    navigation: nav?.type,
    historyLength: history.length,
    historyState: history.state,
    userAgent: navigator.userAgent,
  })
}

/**
 * A failure the phone can't show anyone, onto the save_errors tab. Throttled
 * like a stuck write: once per distinct error per window.
 */
/**
 * The coach tried to file a report and couldn't. The chat is the only other
 * place the error and the report are written down, and it is on the phone, so
 * both go to save_errors: `npm run save-errors` says why it failed and what
 * was being filed (2026-11-25, when neither could be read from here).
 *
 * Not throttled like the reports below: a filing is asked for once, and the
 * next one that fails the same way is a different report worth keeping.
 */
export async function reportFilingFailure(
  route: 'report_issue' | 'send_feedback',
  message: string,
  filing: { title: string; body?: string; area?: string },
): Promise<void> {
  try {
    if (!api.isConfigured()) return
    await api.reportSaveError({
      build: APP_COMMIT,
      route,
      writeId: route,
      message,
      pending: 0,
      payload: filing,
    })
  } catch {
    /* nothing reachable: the chat still says what went wrong */
  }
}

export async function reportDeviceFailure(route: string, message: string, payload: unknown): Promise<void> {
  try {
    if (!api.isConfigured()) return
  } catch {
    return
  }
  const report: SaveErrorReport = {
    build: APP_COMMIT,
    route,
    writeId: route,
    message,
    pending: 0,
    payload,
  }
  const { due, log } = dueReports([report], loadLog(), Date.now())
  if (due.length === 0) return
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log))
  } catch {
    /* send it anyway */
  }
  try {
    await api.reportSaveError(report)
  } catch {
    /* an older backend without the route, or none reachable */
  }
}
