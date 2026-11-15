import { addUse, minusUses, type UseCounts } from '../lib/usage'
import { APP_COMMIT } from '../lib/version'
import { api } from './api'

const KEY = 'wt.usage.pending'
// Long enough that a run of taps goes out as one post, short enough that
// closing the app soon after rarely leaves a tally behind.
const FLUSH_MS = 20_000

function load(): UseCounts {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as UseCounts
  } catch {
    return {}
  }
}

function save(c: UseCounts) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    /* a lost tally only blurs a ranking */
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
let sending = false

/**
 * Count one use of a feature toward the backend's usage tab, which is what
 * says which settings earn the top of the page (`npm run usage`). Kept on the
 * device until a post lands, so offline use and an older backend without the
 * route only delay the count.
 */
export function trackUse(feature: string) {
  save(addUse(load(), feature))
  if (timer === undefined) timer = setTimeout(() => void flushUsage(), FLUSH_MS)
}

export async function flushUsage(): Promise<void> {
  timer = undefined
  const sent = load()
  if (sending || Object.keys(sent).length === 0 || !api.isConfigured()) return
  sending = true
  try {
    await api.postUsage({ build: APP_COMMIT, counts: sent })
    save(minusUses(load(), sent))
  } catch {
    /* offline or an older backend; the tally waits for the next flush */
  } finally {
    sending = false
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushUsage()
  })
}
