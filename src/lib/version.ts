/**
 * Build stamp, baked in at build time by Vite `define` (see vite.config.ts).
 * Shown in Settings so you can confirm which build a device is actually running
 * — the fastest way to spot a phone stuck on a stale, service-worker-cached copy.
 */
export const APP_COMMIT = __APP_COMMIT__
export const APP_BUILD_TIME = __BUILD_TIME__

/** How long to wait for the new worker to take over before reloading anyway. */
const CONTROLLER_SWAP_TIMEOUT_MS = 10_000

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
 */
export async function pullNewWorker(
  sw: ServiceWorkerContainerLike,
  timeoutMs = CONTROLLER_SWAP_TIMEOUT_MS,
): Promise<void> {
  const tookOver = new Promise<void>((resolve) => {
    sw.addEventListener('controllerchange', () => resolve(), { once: true })
  })
  const regs = await sw.getRegistrations()
  // A failed check (offline, say) still gets a reload — it just won't find a
  // worker to wait for.
  await Promise.all(regs.map((r) => r.update().catch(() => undefined)))
  // Nothing installing or waiting means this build is already the newest; don't
  // sit on the timeout for a no-op check.
  if (!regs.some((r) => r.installing || r.waiting)) return
  await Promise.race([tookOver, new Promise((resolve) => setTimeout(resolve, timeoutMs))])
}

/** Force the service worker to check for a newer build, then hard-reload. */
export async function checkForUpdate(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      await pullNewWorker(navigator.serviceWorker as unknown as ServiceWorkerContainerLike)
    }
  } finally {
    // Reload regardless — a fresh load lets the auto-update worker swap in the
    // new assets even if the update() check above isn't supported.
    window.location.reload()
  }
}
