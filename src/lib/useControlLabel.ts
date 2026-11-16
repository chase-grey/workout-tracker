import { useCallback, useSyncExternalStore } from 'react'
import { storage, type Settings } from '../services/storage'
import { useData } from '../store/DataContext'
import {
  CONTROL_IDS,
  CONTROL_WORDS,
  LABEL_USES,
  anyRetired,
  bump,
  labelModeFor,
  retiredNotice,
  retires,
  showLabel,
  type ControlId,
  type ControlUses,
} from './controlLabels'
import { ownerFlavour } from './profile'
import { showUpdateToast } from './version'

// Uses counted but not yet written. A use is a tap, and a settings write is a
// sync to the sheet, so they're gathered for a moment and written together —
// and since every counter stops at LABEL_USES, the writes stop with it.
let pending: ControlUses = {}
let version = 0
let timer: number | undefined
let write: ((s: Settings) => void) | null = null
const listeners = new Set<() => void>()
const FLUSH_MS = 1500
/** Long enough for the label's own fade to be the first thing you see go. */
const NOTICE_DELAY_MS = 400

function notify() {
  version++
  listeners.forEach((l) => l())
}

function withPending(uses: ControlUses | undefined): ControlUses {
  const out: ControlUses = { ...uses }
  for (const id of CONTROL_IDS) {
    const n = pending[id]
    if (n != null && n > (out[id] ?? 0)) out[id] = n
  }
  return out
}

function flush() {
  window.clearTimeout(timer)
  timer = undefined
  if (!write || Object.keys(pending).length === 0) return
  // Off what's in storage now, not the settings the tap rendered with: anything
  // else written in the meantime (an animation hidden from the kebab) survives.
  const base = storage.loadSettings()
  const controlUses = withPending(base.controlUses)
  pending = {}
  write({ ...base, controlUses })
  notify()
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}

/** Drop uses still waiting to be written; Settings' reset calls this before clearing the counters. */
export function discardPendingUses() {
  window.clearTimeout(timer)
  timer = undefined
  pending = {}
  notify()
}

/**
 * Whether control `id` wears its starter word, the word, and `used` to call
 * from its press. The use that retires the label fades it out and floats a toast
 * saying so — the app's own, which takes no taps, so it can't land on a set
 * screen's tap-anywhere as anything but a glance.
 */
export function useControlLabel(id: ControlId): { show: boolean; word: string; used: () => void } {
  const { settings, updateSettings } = useData()
  write = updateSettings
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
  )
  const uses = withPending(settings.controlUses)
  const owner = ownerFlavour(settings.profile)
  const show = showLabel(id, settings.labelMode, uses, owner)
  const counting = labelModeFor(settings.labelMode, owner) === 'auto' && (uses[id] ?? 0) < LABEL_USES

  const used = useCallback(() => {
    if (!counting) return
    const before = withPending(storage.loadSettings().controlUses)
    const after = bump(before, id)
    if (after === before) return
    pending = { ...pending, [id]: after[id] }
    notify()
    window.clearTimeout(timer)
    timer = window.setTimeout(flush, FLUSH_MS)
    if (retires(before, after, id)) {
      const first = !anyRetired(before)
      window.setTimeout(() => showUpdateToast(retiredNotice(id, first)), NOTICE_DELAY_MS)
    }
  }, [counting, id])

  return { show, word: CONTROL_WORDS[id], used }
}
