import { useSyncExternalStore } from 'react'
import { stashResumeTab } from './resumeTab'
import type { Tab } from '../components/BottomNav'

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

/** After this long with no touch or key, an open app counts as left alone. */
export const IDLE_MS = 5 * 60_000

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

/**
 * Before any reload onto an update, ask once more and let anything newer take
 * over first.
 *
 * A build found an hour ago is not the newest by the time the reload comes:
 * the page is served by whichever worker owns it, so reloading onto the found
 * one landed a build behind, and the launch check then turned up the next.
 * Several deploys arrived one restart at a time. Asking here lands them all in
 * one. The wait is bounded as a whole, since on a bad connection `update()`
 * itself can hang, and the reload must still happen.
 */
export async function settleOnNewest(
  sw: ServiceWorkerContainerLike,
  timeoutMs = CONTROLLER_SWAP_TIMEOUT_MS,
): Promise<void> {
  await Promise.race([
    pullNewWorker(sw, timeoutMs).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ])
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

// --- when a reload would not be noticed --------------------------------------

export type Moment = {
  /** The app is not on screen. */
  hidden: boolean
  /** Something half-done is open: a workout, a sheet, a draft, or anything that asked to be left alone. */
  held: boolean
  /** A touch or key has landed since the app last came on screen. */
  touchedSinceShown: boolean
  /** How long since the last touch or key. */
  idleMs: number
}

/**
 * A reload now would not interrupt anything: nothing half-done, and nobody is
 * using the app. This is the whole rule for the app updating itself; anything
 * else waits for the Settings button.
 */
export function isQuietMoment(moment: Moment): boolean {
  if (moment.held) return false
  return moment.hidden || !moment.touchedSinceShown || moment.idleMs >= IDLE_MS
}

const holds = new Set<symbol>()

/**
 * Keep the app from reloading itself while something a reload would disturb is
 * on screen (a workout, a recap). Returns the release.
 */
export function holdUpdates(): () => void {
  const hold = Symbol('hold')
  holds.add(hold)
  return () => {
    holds.delete(hold)
  }
}

/** A sheet is open or something written is on screen: held with no hold needed. */
function midEdit(): boolean {
  if (document.querySelector('dialog[open]')) return true
  // A draft counts whether or not the cursor is still in it.
  for (const area of document.querySelectorAll('textarea')) if (area.value.trim()) return true
  if (document.querySelector('[contenteditable="true"]')?.textContent?.trim()) return true
  const active = document.activeElement
  return active instanceof HTMLInputElement && active.value !== ''
}

let place: Tab = 'today'

/** Say which tab is showing, so a reload the app does on its own comes back to it. */
export function notePlace(tab: Tab) {
  place = tab
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

/** Reload onto the newest build without being asked: same tab, nothing said. */
function reloadQuietly() {
  stashResumeTab(place)
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
 * The Settings button. With a newer build already waiting it restarts onto the
 * newest there is (see settleOnNewest). Otherwise it asks the server: a newer
 * build is pulled in and the page reloads onto it; nothing newer, or no answer,
 * stays put and says so — a reload that changes nothing is only a flash and a
 * lost scroll position.
 */
export async function checkForUpdate(): Promise<void> {
  if (!('serviceWorker' in navigator)) return reloadForUpdate()
  const sw = navigator.serviceWorker as unknown as ServiceWorkerContainerLike
  set({ checking: true })
  if (state.ready) {
    await settleOnNewest(sw)
    return reloadForUpdate()
  }
  const outcome = await pullNewWorker(sw).catch((): PullOutcome => 'failed')
  if (outcome === 'swapped') return reloadForUpdate()
  set({ checking: false })
  showUpdateToast(
    outcome === 'current' ? 'you’re on the latest version' : 'couldn’t check — are you offline?',
  )
}

/**
 * Keep an eye out for new builds while the app is open. A newer build is
 * reloaded onto at the first quiet moment (see isQuietMoment); until one comes,
 * Settings wears a dot and its button restarts onto the build.
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
  let touched = false
  let lastTouch = Date.now()
  // After the reload the new worker already owns the page, so `ready` is not
  // set again for the same build and this cannot loop.
  const quietNow = () =>
    state.ready &&
    isQuietMoment({
      hidden: document.visibilityState === 'hidden',
      held: holds.size > 0 || midEdit(),
      touchedSinceShown: touched,
      idleMs: Date.now() - lastTouch,
    })
  // Checks stop once a build is ready, so the one in hand may be builds old.
  // Catch up first, then look again: the wait is long enough to be touched in.
  let settling = false
  const reloadIfQuiet = async () => {
    if (settling || !quietNow()) return
    settling = true
    await settleOnNewest(sw as unknown as ServiceWorkerContainerLike)
    settling = false
    if (quietNow()) reloadQuietly()
  }
  const onTouch = () => {
    touched = true
    lastTouch = Date.now()
  }
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchmove']) {
    window.addEventListener(type, onTouch, { capture: true, passive: true })
  }
  sw.addEventListener('controllerchange', () => {
    if (!wasControlled) return
    set({ ready: true })
    void reloadIfQuiet()
  })
  const check = () => {
    if (state.ready) return
    void sw.getRegistrations().then((regs) => regs.forEach((r) => r.update().catch(() => {})))
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      touched = false
      check()
    }
    void reloadIfQuiet()
  })
  setInterval(check, BACKGROUND_CHECK_MS)
  // The idle clock: a build that arrived mid-use goes in once the app is left alone.
  setInterval(() => void reloadIfQuiet(), 60_000)
}
