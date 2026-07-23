/**
 * Build stamp, baked in at build time by Vite `define` (see vite.config.ts).
 * Shown in Settings so you can confirm which build a device is actually running
 * — the fastest way to spot a phone stuck on a stale, service-worker-cached copy.
 */
export const APP_COMMIT = __APP_COMMIT__
export const APP_BUILD_TIME = __BUILD_TIME__

/** Force the service worker to check for a newer build, then hard-reload. */
export async function checkForUpdate(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.update()))
    }
  } finally {
    // Reload regardless — a fresh load lets the auto-update worker swap in the
    // new assets even if the update() check above isn't supported.
    window.location.reload()
  }
}
