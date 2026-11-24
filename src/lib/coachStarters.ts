import { hasPillar, type Profile } from './profile'

/**
 * Questions to start an empty coach thread with: one for each thing the person
 * tracks, three at most, ending on the one that fits anybody.
 *
 * Pure module — no React/DOM.
 */
export function coachStarters(profile: Profile | null | undefined): string[] {
  const out: string[] = []
  if (hasPillar(profile, 'strength')) out.push('how is my strength progressing?')
  if (hasPillar(profile, 'diet')) out.push('am i eating enough to hit my goal?')
  if (hasPillar(profile, 'flexibility')) out.push('how is my flexibility coming along?')
  if (hasPillar(profile, 'cardio')) out.push('how is my cardio going?')
  return [...out.slice(0, 2), 'what should i focus on this week?']
}
