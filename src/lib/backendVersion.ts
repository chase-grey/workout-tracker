/**
 * Is the deployed backend old enough to be the problem?
 *
 * The app and SimpleBackend.gs ship from one repo but deploy separately: Pages
 * takes the app in two minutes, the backend waits for someone to redeploy it by
 * hand. In between, a write the new app makes can be one the old backend
 * rejects, and the client rightly keeps it queued — but all anyone saw of that
 * was "Couldn't save", for a month (2026-10-29). So the backend now says its
 * version at ?route=version, the app carries the one it needs, and when the
 * live number is lower the home screen says so by name, until it isn't.
 */

/**
 * The version a backend's answer at ?route=version declares. A backend too old
 * to have the route answers `{error: 'Unknown route'}`, which is version 0:
 * older than anything that knows to say.
 */
export function liveBackendVersion(payload: unknown): number {
  const v = (payload as { version?: unknown } | null)?.version
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0
}

/** True once a live version is known and it is older than this build needs. */
export function backendBehind(live: number | null, required: number): boolean {
  return live !== null && live < required
}

/** The banner's one line: both numbers, then what to do. */
export function backendBehindText(live: number, required: number): string {
  return `Deployed backend is version ${live}; this app needs ${required}. Redeploy SimpleBackend.gs.`
}
