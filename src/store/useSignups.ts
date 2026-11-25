/**
 * The owner's notices of new accounts, read once for the whole app.
 *
 * Two places show them, as with the filed issues (useTrackedIssues): Settings
 * lists them and the bottom nav dots the settings tab while there is one. The
 * list is read when the app opens, when it comes back to the front, when
 * Settings shows it, and now and then while it stays open.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { api } from '../services/api'
import { storage } from '../services/storage'
import { createSignupStore, shownSignups, type Signup } from '../lib/signups'

// A new account is not urgent, and each read is a request to a free-tier backend.
const REFRESH_MS = 10 * 60_000

const store = createSignupStore({
  list: api.signups,
  keep: api.keepSignup,
  decline: api.declineSignup,
  load: storage.loadSignups,
  save: storage.saveSignups,
})

let enabled = false
let listeners = 0
let timer: ReturnType<typeof setInterval> | undefined

function refresh() {
  if (enabled && !document.hidden) void store.refresh()
}

function subscribe(notify: () => void): () => void {
  const stop = store.subscribe(notify)
  if (++listeners === 1) {
    timer = setInterval(refresh, REFRESH_MS)
    document.addEventListener('visibilitychange', refresh)
  }
  return () => {
    stop()
    if (--listeners === 0) {
      clearInterval(timer)
      timer = undefined
      document.removeEventListener('visibilitychange', refresh)
    }
  }
}

/**
 * The accounts waiting on the owner, newest first. `owner` gates it: on anyone
 * else's device nothing is asked for and nothing is shown.
 */
export function useSignups(owner: boolean): Signup[] {
  const list = useSyncExternalStore(subscribe, store.get, store.get)
  const on = owner && api.isConfigured()
  useEffect(() => {
    enabled = on
    refresh()
  }, [on])
  return shownSignups(on, list)
}

export const keepSignup = store.keep
export const declineSignup = store.decline
