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
