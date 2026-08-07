/**
 * The Apps Script deployment the app talks to when Settings doesn't override it.
 *
 * Lives on its own because vite.config.ts needs it too: the dev server publishes
 * its tunnel address to this same backend so the installed phone app can find the
 * chat coach (see shareLink in vite.config.ts, and BACKEND.md).
 *
 * This endpoint is already public — the web app is deployed "Anyone" — so baking
 * it in just lets every device auto-connect without pasting it into Settings.
 */
export const DEFAULT_API_URL =
  'https://script.google.com/macros/s/AKfycbxKDeDE9cRmW8eA5TjShq9dmRvJoVxVE4nsx0l43WLpyXBv_TvheDsYLpBCVuZHLL89xA/exec'
