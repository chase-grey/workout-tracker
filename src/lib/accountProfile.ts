/**
 * Keeping a device's profile from being mistaken for its account's.
 *
 * A profile is synced: it belongs to the account, not the phone. But the
 * settings merge only lets a side overwrite the fields it actually carries
 * (see settingsSync.mergeSettings), and the owner's account carries no profile
 * at all — no profile is what makes a device the owner's (see lib/profile). So
 * a phone that had been set up as someone new, with the welcome flow's profile
 * on it, kept that profile when it signed in to the owner's account, and the
 * next sync pushed it up as the account's. The welcome flow's diet direction
 * starts on "lose", so from then on every 4,500-calorie bulk day read as a miss.
 */

import type { Settings } from '../services/storage'
import { ownerProfile } from './ownerProfile'
import type { Profile } from './profile'

/**
 * This device's settings as they should stand the moment it takes up an
 * existing account, before the account's copy is fetched.
 *
 * Unstamped, so the account's copy wins the merge. Without a profile, because
 * the one on this device describes whoever set the phone up, and the account
 * either brings its own or has none. Without the owner flag, because that was
 * about whichever account this device was in before.
 */
export function settingsForSignIn(local: Settings, fields: Partial<Settings>): Settings {
  const next: Settings = { ...local }
  delete next.updatedAt
  delete next.profile
  delete next.accountOwner
  return { ...next, ...fields }
}

/**
 * Whether working out the repair below needs the backend's word on who owns
 * the account. Only a profile that isn't the owner's can need repairing, and
 * a `legacy` device is the owner's by definition, so most refreshes never ask.
 */
export function needsOwnerCheck(settings: Settings): boolean {
  return (
    settings.accountMode === 'hosted' &&
    !!settings.accountToken?.trim() &&
    settings.accountOwner === undefined &&
    !!settings.profile &&
    settings.profile.owner !== true
  )
}

/**
 * The profile to put in place of one that can't be the account's, or null
 * when the one there is fine.
 *
 * On the owner's account every legitimate profile is marked as the owner's:
 * Settings seeds its editor from {@link ownerProfile} and keeps the mark
 * through every edit. One without the mark was carried in from a phone set up
 * as someone else. The repair is the owner's profile rather than no profile,
 * because a profile that has been synced can't be cleared — the merge keeps a
 * field the newer copy doesn't carry — only replaced, and the owner's profile
 * behaves exactly as no profile does.
 */
export function repairedOwnerProfile(settings: Settings): Profile | null {
  const owner = settings.accountMode === 'legacy' || settings.accountOwner === true
  if (!owner || !settings.profile || settings.profile.owner === true) return null
  return ownerProfile()
}
