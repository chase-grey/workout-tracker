/**
 * The Apps Script deployment the app talks to when Settings doesn't override it.
 *
 * This endpoint is already public — the web app is deployed "Anyone" — so baking
 * it in just lets every device auto-connect without pasting it into Settings.
 */
export const DEFAULT_API_URL =
  'https://script.google.com/macros/s/AKfycbxKDeDE9cRmW8eA5TjShq9dmRvJoVxVE4nsx0l43WLpyXBv_TvheDsYLpBCVuZHLL89xA/exec'
