/**
 * Syncing settings to the backend so they survive losing this device's storage.
 *
 * Settings used to be device-only, which was fine while they held nothing but an
 * API URL — and then stopped being fine, because committed goals moved in (see
 * goalLock). A commitment is the one thing in the app you can't re-derive from
 * the log: reinstalling the PWA drops localStorage and every locked projection
 * with it, and no amount of synced weigh-ins brings back the date you promised
 * yourself. So settings ride to the sheet too.
 *
 * Two devices both hold a full copy, so a fetch has to merge rather than replace
 * — same reason the calorie and duration caches do (see DataContext.refresh).
 * The merge rules are here, and are pure so they can be tested: no React, no
 * storage, no network.
 */

import type { Settings } from '../services/storage'
import type { LockedProjections } from './goalLock'

/**
 * Settings that stay on the device they were entered on.
 *
 * `apiUrl` is how this device reaches the backend, so syncing it is circular —
 * and a bad value arriving from the sheet would cut a device off from the very
 * place it would have to fetch the fix from.
 *
 * The other two are credentials, and the settings route is unauthenticated like
 * `plan` is. The /exec URL ships inside the public web bundle (see
 * services/chatEndpoint.ts, and the chat routes' shared secret, which exists for
 * exactly this reason), so anything stored here is readable by anyone holding
 * that URL. A synced key would be a published key.
 */
export const DEVICE_LOCAL_KEYS = ['apiUrl', 'openAiKey', 'chatToken'] as const

type DeviceLocalKey = (typeof DEVICE_LOCAL_KEYS)[number]

/** The part of Settings that belongs to the account rather than the device. */
export type SyncedSettings = Omit<Settings, DeviceLocalKey>

/** `settings` with the device-local fields removed, ready to send. */
export function syncablePart(settings: Settings): SyncedSettings {
  const out = { ...settings } as Partial<Settings>
  for (const k of DEVICE_LOCAL_KEYS) delete out[k]
  return out as SyncedSettings
}

/**
 * Whether two synced copies hold the same values, key order aside.
 *
 * A merged copy is assembled by spreading two objects; the account's arrives
 * parsed from JSON. Those agree on values while disagreeing on key order, so a
 * plain stringify comparison would call every refresh a change and push settings
 * back to the sheet forever.
 */
export function sameSyncedSettings(a: SyncedSettings | null, b: SyncedSettings | null): boolean {
  return canonical(a) === canonical(b)
}

/** Stable JSON: object keys sorted, undefined-valued keys dropped. */
function canonical(v: unknown): string {
  if (v === undefined) return 'null'
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  const entries = Object.entries(v as Record<string, unknown>)
    .filter(([, val]) => val !== undefined)
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
  return `{${entries.map(([k, val]) => `${JSON.stringify(k)}:${canonical(val)}`).join(',')}}`
}

/** `o` without the keys whose value is undefined. */
function definedOnly<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v
  }
  return out
}

/**
 * Merge the account's locked goals into this device's, goal by goal.
 *
 * Whole-copy last-write-wins is wrong here: each lock is an independent
 * commitment, so a device that hasn't opened the app since you committed the
 * squat goal would push its stale copy and erase it. Newest `lockedAt` per goal
 * wins instead, and a goal only one side knows about is kept. Ties keep this
 * device's, matching the rest of the merges.
 *
 * A device that has never synced (no `updatedAt`) unions the two, with the
 * account winning: it has no commitments of its own to defend, and no deletions
 * of its own to honour. That's the reinstall this module exists for — and also
 * the first run after this shipped, where the local locks are real and the sheet
 * holds nothing yet, so neither side may be dropped.
 *
 * Known gap: with no tombstones, un-committing a goal on one device (see
 * GoalsPanel.recalculate, which drops a lock the pace can no longer reach) can
 * be undone by the other device pushing the lock back. Recalculating again
 * clears it. Worth it to keep the merge this simple, and a resurrected
 * commitment is recoverable in a way a deleted one isn't.
 */
function mergeLockedGoals(local: Settings, remote: SyncedSettings): LockedProjections {
  const mine = local.lockedGoals ?? {}
  const theirs = remote.lockedGoals ?? {}
  if (!local.updatedAt) return { ...mine, ...theirs }

  const out: LockedProjections = { ...mine }
  for (const [goalId, lock] of Object.entries(theirs)) {
    const held = out[goalId]
    if (!held || lock.lockedAt > held.lockedAt) out[goalId] = lock
  }
  return out
}

/**
 * This device's settings with the account's copy folded in.
 *
 * Plain fields go last-write-wins on the settings-level `updatedAt`, but only
 * where the winning side actually carries a value — a copy saved before a field
 * existed shouldn't blank it. The cost is that deliberately clearing a field
 * doesn't propagate; none of these fields are cleared as a user action, and
 * blanking real data would be the worse failure. Locked goals merge per goal
 * (see {@link mergeLockedGoals}) and the device-local fields are always this
 * device's (see {@link DEVICE_LOCAL_KEYS}).
 */
export function mergeSettings(local: Settings, remote: SyncedSettings | null): Settings {
  if (!remote || typeof remote !== 'object') return local

  const remoteIsNewer = (remote.updatedAt ?? '') > (local.updatedAt ?? '')
  const newer = remoteIsNewer ? remote : local
  const older = remoteIsNewer ? local : remote

  const merged = { ...older, ...definedOnly(newer) } as Settings
  for (const k of DEVICE_LOCAL_KEYS) merged[k] = local[k]
  merged.lockedGoals = mergeLockedGoals(local, remote)
  return merged
}
