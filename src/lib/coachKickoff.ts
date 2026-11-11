/**
 * A first message handed to the coach by the welcome flow.
 *
 * Someone who gave the app an AI key during setup is better served by a
 * conversation than by a template, so setup ends by opening the coach with the
 * request already in the composer. It rides in sessionStorage because the two
 * screens never share a render: the welcome flow unmounts as the app mounts.
 *
 * Read and cleared in two steps so a double-invoked initialiser (StrictMode)
 * still sees it; cleared from an effect once the coach has it.
 */

const KEY = 'wt.coachKickoff'

export function stashCoachKickoff(text: string): void {
  try {
    sessionStorage.setItem(KEY, text)
  } catch {
    // Storage can be blocked; the coach just opens empty.
  }
}

export function peekCoachKickoff(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearCoachKickoff(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}
