/**
 * One shared poll of the app-filed GitHub issues.
 *
 * Two places need this list — Settings paints it, and the bottom nav dots the
 * settings tab when the auto-fixer is waiting on an answer — and the read is a
 * slow one: the app goes to Apps Script, which goes to the GitHub API. A hook
 * with its own interval per component would double that traffic and let the two
 * views disagree, so the state lives here and both subscribe to it.
 *
 * Polling stops while the tab is hidden. This runs app-wide now rather than only
 * while Settings is open, and an installed PWA spends most of its life in the
 * background — a timer that kept firing there would spend the whole day fetching
 * a list nobody is looking at.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { cachedIssues, listIssues, type TrackedIssue } from '../services/issues'

export type IssuesState = {
  /** The tracked issues, or null if a list has never been read on this device. */
  issues: TrackedIssue[] | null
  /** True when the last refresh failed — what's here is the previous read. */
  failed: boolean
}

// Long enough not to hammer a free-tier backend, short enough that the fixer
// claiming an issue and then closing it both show up while you watch.
const REFRESH_MS = 30_000

let state: IssuesState = { issues: null, failed: false }
let seeded = false
let enabled = false
let inFlight = false
let timer: ReturnType<typeof setInterval> | undefined
const subs = new Set<() => void>()

/**
 * Seeded on first read rather than at import: reading the cache touches
 * localStorage, and this module gets imported in places (tests, tooling) that
 * have no DOM.
 */
function snapshot(): IssuesState {
  if (!seeded) {
    seeded = true
    state = { issues: cachedIssues(), failed: false }
  }
  return state
}

function set(next: IssuesState) {
  state = next
  for (const notify of subs) notify()
}

/** Re-read the list now. No-op without an issue token, or if one is in flight. */
export function refreshIssues(): void {
  if (!enabled || inFlight) return
  inFlight = true
  listIssues()
    .then((issues) => set({ issues, failed: false }))
    // A failed refresh keeps the last list — Settings says so rather than
    // blanking a history that hasn't changed in weeks.
    .catch(() => set({ issues: snapshot().issues, failed: true }))
    .finally(() => {
      inFlight = false
    })
}

function onVisibilityChange() {
  if (!document.hidden) refreshIssues()
}

function subscribe(notify: () => void): () => void {
  subs.add(notify)
  if (subs.size === 1) {
    timer = setInterval(() => {
      if (!document.hidden) refreshIssues()
    }, REFRESH_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
  return () => {
    subs.delete(notify)
    if (subs.size === 0) {
      clearInterval(timer)
      timer = undefined
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }
}

/** The shared issue list. `hasToken` gates it: the read needs the issue token. */
export function useTrackedIssues(hasToken: boolean): IssuesState {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot)
  useEffect(() => {
    enabled = hasToken
    if (hasToken) refreshIssues()
  }, [hasToken])
  return current
}
