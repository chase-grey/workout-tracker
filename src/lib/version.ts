import { useSyncExternalStore } from 'react'
import { stashResumeTab } from './resumeTab'

/**
 * Build stamp, baked in at build time by Vite `define` (see vite.config.ts).
 * Shown in Settings so you can confirm which build a device is actually running
 * — the fastest way to spot a phone stuck on a stale, service-worker-cached copy.
 */
export const APP_COMMIT = __APP_COMMIT__
export const APP_BUILD_TIME = __BUILD_TIME__

/** How long to wait for the new worker to take over before reloading anyway. */
const CONTROLLER_SWAP_TIMEOUT_MS = 10_000

/** How often an open app asks whether a newer build has been deployed. */
const BACKGROUND_CHECK_MS = 30 * 60_000

/** The slice of navigator.serviceWorker this needs, so it can be tested. */
type WorkerRegistrationLike = {
  installing: unknown
  waiting: unknown
  update(): Promise<unknown>
}
type ServiceWorkerContainerLike = {
  addEventListener(
    type: 'controllerchange',
    listener: () => void,
    options?: { once?: boolean },
  ): void
  getRegistrations(): Promise<readonly WorkerRegistrationLike[]>
}

/**
 * What a check turned up: a newer worker that now owns the page (`swapped`),
 * nothing newer (`current`), or no answer from the server (`failed`).
 */
export type PullOutcome = 'swapped' | 'current' | 'failed'

/**
 * Pull down any newer worker and wait until it owns the page.
 *
 * The waiting is the point. `update()` resolves as soon as the new worker starts
 * installing, so reloading right after it is still served by the OLD worker's
 * caches — which is why one tap of "check for updates" appeared to do nothing and
 * only a second tap landed the new build. The auto-update worker calls
 * skipWaiting/clientsClaim (registerType: 'autoUpdate'), so it fires
 * `controllerchange` the moment it takes over; reload after that and the new
 * assets are what get served.
 *
 * The listener goes on before `update()` so a fast swap can't fire in the gap.
 * A swap that never lands inside the timeout still counts as `swapped`: there is
 * a newer build, and the reload that follows is the best remaining way onto it.
 */
export async function pullNewWorker(
  sw: ServiceWorkerContainerLike,
  timeoutMs = CONTROLLER_SWAP_TIMEOUT_MS,
): Promise<PullOutcome> {
  const tookOver = new Promise<void>((resolve) => {
    sw.addEventListener('controllerchange', () => resolve(), { once: true })
  })
  const regs = await sw.getRegistrations()
  const checked = await Promise.all(
    regs.map((r) =>
      r.update().then(
        () => true,
        () => false,
      ),
    ),
  )
  if (!regs.some((r) => r.installing || r.waiting)) {
    // Nothing newer on the way. Only call it "current" if a check actually
    // reached the server — offline, every update() rejects and we know nothing.
    return checked.some(Boolean) ? 'current' : 'failed'
  }
  await Promise.race([tookOver, new Promise((resolve) => setTimeout(resolve, timeoutMs))])
  return 'swapped'
}

// --- the update store: is a newer build ready, and what to tell you ----------

type UpdateState = {
  /** A newer build has taken over the worker; this page is still the old one. */
  ready: boolean
  /** A check is in flight from the Settings button. */
  checking: boolean
  /** The one-line answer to show, keyed so the same text twice re-shows. */
  toast: Toast | null
}

/**
 * A toast, and optionally the one thing it lets you do about what it reports
 * ("undo" after an AI's plan change). Only a toast with an action takes taps.
 */
export type Toast = { id: number; text: string; action?: { label: string; run: () => void } }

let state: UpdateState = { ready: false, checking: false, toast: null }
const listeners = new Set<() => void>()
function set(patch: Partial<UpdateState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
let toastId = 0
export function showUpdateToast(text: string, action?: Toast['action']) {
  set({ toast: { id: ++toastId, text, ...(action ? { action } : {}) } })
}
export function dismissUpdateToast(id: number) {
  if (state.toast?.id === id) set({ toast: null })
}

export function useAppUpdate(): UpdateState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

// --- reloads the app triggers itself, and what to say after them ------------

const FROM_KEY = 'wt:update-from'

/**
 * The toast for the load after an update reload: which build we left, against
 * the one now running. Null when this load wasn't one of ours.
 */
export function afterReloadToast(from: string | null, now: string): string | null {
  if (from == null) return null
  return from === now ? 'you’re on the latest version' : `updated to ${now}`
}

/** Reload onto the newest build, back to Settings, with the answer waiting. */
function reloadForUpdate() {
  try {
    sessionStorage.setItem(FROM_KEY, APP_COMMIT)
  } catch {
    // Blocked storage costs only the toast.
  }
  // Come back to Settings rather than Today — that's where you asked.
  stashResumeTab('settings')
  window.location.reload()
}

/** Say how the last self-triggered reload went, once. Call at startup. */
function announceReload() {
  let from: string | null = null
  try {
    from = sessionStorage.getItem(FROM_KEY)
    sessionStorage.removeItem(FROM_KEY)
  } catch {
    return
  }
  const text = afterReloadToast(from, APP_COMMIT)
  if (text) showUpdateToast(text)
}

/**
 * The Settings button. With a newer build already waiting it just restarts onto
 * it. Otherwise it asks the server: a newer build is pulled in and the page
 * reloads onto it; nothing newer, or no answer, stays put and says so — a reload
 * that changes nothing is only a flash and a lost scroll position.
 */
export async function checkForUpdate(): Promise<void> {
  if (state.ready || !('serviceWorker' in navigator)) return reloadForUpdate()
  set({ checking: true })
  const outcome = await pullNewWorker(
    navigator.serviceWorker as unknown as ServiceWorkerContainerLike,
  ).catch((): PullOutcome => 'failed')
  if (outcome === 'swapped') return reloadForUpdate()
  set({ checking: false })
  showUpdateToast(
    outcome === 'current' ? 'you’re on the latest version' : 'couldn’t check — are you offline?',
  )
}

/**
 * Keep an eye out for new builds while the app is open, so Settings can wear a
 * dot the moment one is ready rather than when you think to look.
 *
 * The browser checks for a new worker on each launch; this adds a check when the
 * app comes back to the foreground — a phone PWA is resumed far more often than
 * launched — and on a slow timer while it stays open. The auto-update worker
 * takes over as soon as it installs, and that takeover (`controllerchange`) is
 * the signal that this page is now a build behind. The very first install also
 * fires it, with no build before it to be behind, hence the controller check.
 */
export function watchForUpdates() {
  announceReload()
  if (!('serviceWorker' in navigator)) return
  const sw = navigator.serviceWorker
  const wasControlled = sw.controller != null
  sw.addEventListener('controllerchange', () => {
    if (wasControlled) set({ ready: true })
  })
  const check = () => {
    if (state.ready) return
    void sw.getRegistrations().then((regs) => regs.forEach((r) => r.update().catch(() => {})))
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  setInterval(check, BACKGROUND_CHECK_MS)
}
