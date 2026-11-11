/**
 * How a device decides whether it may talk to the backend, and as whom.
 *
 * The backend's address ships inside the public bundle, and until accounts
 * existed a request with no key was simply the owner's. That is still how the
 * owner's own phones work (`legacy`), so the rule for everyone else has to be
 * enforced here: a device that has not signed in sends nothing at all.
 */

import type { AccountMode, Settings } from '../services/storage'

/** What a device has cached, as far as telling an old install from a new one goes. */
export type DeviceEvidence = {
  workouts: number
  bodyWeights: number
  calories: number
  flex: number
}

/**
 * Whether this device was in use before accounts shipped. Such a device never
 * chose a mode, and it must keep syncing exactly as it did; a device with
 * nothing on it is a new person's, and goes through the welcome flow.
 */
export function isLegacyDevice(settings: Settings, evidence: DeviceEvidence): boolean {
  return (
    !!settings.updatedAt ||
    settings.setupComplete === true ||
    settings.heightIn != null ||
    Object.keys(settings.lockedGoals ?? {}).length > 0 ||
    evidence.workouts + evidence.bodyWeights + evidence.calories + evidence.flex > 0
  )
}

/** The mode a device is in, settling an old install as `legacy` the first time it's asked. */
export function accountModeOf(settings: Settings, evidence: DeviceEvidence): AccountMode | null {
  if (settings.accountMode) return settings.accountMode
  return isLegacyDevice(settings, evidence) ? 'legacy' : null
}

/**
 * Whether requests may leave this device. A backend address typed into Settings
 * is somebody's own deployment, where they are the owner, so it always may.
 */
export function mayReachBackend(settings: Settings): boolean {
  if (settings.apiUrl.trim()) return true
  if (settings.accountMode === 'legacy') return true
  return settings.accountMode === 'hosted' && !!settings.accountToken?.trim()
}

/** The key to send as `user`, or '' for a request that goes as the owner. */
export function accountKey(settings: Settings): string {
  return settings.accountToken?.trim() ?? ''
}
