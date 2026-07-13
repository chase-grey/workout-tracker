// The chat + OpenAI settings can't reach the proxy from a deployed phone
// (internal-only + CORS + cert), so we only surface them on desktop, and in
// local dev (which includes `dev:host` viewed from a phone, where the dev
// proxy makes it work).
const isTouchDevice =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

export const IS_DESKTOP = import.meta.env.DEV || !isTouchDevice
