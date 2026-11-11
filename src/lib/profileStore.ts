/**
 * The profile in force on this device, held where pure logic can read it.
 *
 * `weeklyGoalsFor` and `calorieGoalOn` are called from a dozen modules that
 * take dates, not settings, and threading a profile through every one of them
 * would touch most of lib. They read it here instead, the way the chart colours
 * read lib/themeStore. DataContext keeps this in step with Settings.
 *
 * Null is the original owner's device: no profile, the shipped constants.
 */

import { hasPillar, ownerFlavour, type DietDirection, type Pillar, type Profile } from './profile'

let active: Profile | null = null

export function setActiveProfile(profile: Profile | null | undefined): void {
  active = profile ?? null
}

export function activeProfile(): Profile | null {
  return active
}

export function pillarOn(pillar: Pillar): boolean {
  return hasPillar(active, pillar)
}

/** Whether the owner's own goals and charts apply on this device (see profile.ownerFlavour). */
export function activeOwnerFlavour(): boolean {
  return ownerFlavour(active)
}

export function activeDietDirection(): DietDirection {
  return active?.dietDirection ?? 'gain'
}
