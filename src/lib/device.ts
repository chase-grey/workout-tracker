// The chat + OpenAI settings need the dev server's /api/chat proxy, which holds
// the Epic key and can reach Epic's internal LLM host — so the deployed site can
// never have them. DEV is what actually decides it: on a phone that means the
// phone loaded the dev server itself over Epic wifi (`npm run dev:phone`), where
// the proxy is same-origin and everything works.
const isTouchDevice =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

export const IS_DESKTOP = import.meta.env.DEV || !isTouchDevice
