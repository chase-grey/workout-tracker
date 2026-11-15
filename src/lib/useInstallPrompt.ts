import { useSyncExternalStore } from 'react'
import { installOffer, isIOS, type InstallOffer } from './installPrompt'

/**
 * Chrome's install dialog, held until a tap asks for it. The event can fire
 * before React mounts, so {@link initInstallPrompt} listens from main.tsx.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'wt.installDismissed'

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
let version = 0
const listeners = new Set<() => void>()

function changed() {
  version++
  for (const l of listeners) l()
}

const standalone = () =>
  installed ||
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

export function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Hold it for our own banner instead of Chrome's mini-infobar.
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    changed()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    changed()
  })
}

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

let cached: { version: number; offer: InstallOffer } | null = null
function snapshot(): InstallOffer {
  if (cached?.version !== version) {
    cached = {
      version,
      offer: installOffer({
        standalone: standalone(),
        canPrompt: deferred != null,
        ios: isIOS(navigator.userAgent, navigator.maxTouchPoints),
        dismissedAt: readDismissed(),
        now: new Date(),
      }),
    }
  }
  return cached.offer
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISSED_KEY, new Date().toISOString())
  } catch {
    /* storage blocked: hidden for this visit only */
  }
  changed()
}

async function install() {
  const e = deferred
  if (!e) return
  // Chrome's dialog is single-use; a fresh one arrives on a later visit.
  deferred = null
  await e.prompt()
  const { outcome } = await e.userChoice
  if (outcome === 'dismissed') dismiss()
  else changed()
}

export function useInstallPrompt() {
  const offer = useSyncExternalStore(subscribe, snapshot)
  return { offer, install, dismiss }
}
