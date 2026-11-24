/**
 * Which flexibility a profile trains, or that it only counts stretch sessions.
 *
 * A profile tracking flexibility picks skills to train (the routines in
 * config/flexRoutines), or picks none and just logs that it stretched, the way
 * cardio is logged: a day, after the fact, with no guided session behind it.
 *
 * `flexSkills` absent is a profile from before the question was asked — the
 * owner's, or anyone's saved since — and they keep the two routines they had.
 * An empty list is the deliberate "just track sessions" answer.
 */

import { FLEX_ROUTINE_KEYS, type FlexRoutineKey } from '../config/flexRoutines'
import { hasPillar, ownerFlavour, type Profile } from './profile'

/** What a profile that never answered trains: the two routines the app shipped with. */
export const LEGACY_FLEX_SKILLS: FlexRoutineKey[] = ['side_split', 'head_to_toe']

/**
 * What the owner trains without having been asked: those two, and the pelvic
 * tilt corrective he added after them. Anyone else picks it like any skill.
 */
export const OWNER_FLEX_SKILLS: FlexRoutineKey[] = [...LEGACY_FLEX_SKILLS, 'pelvic_tilt']

/** The skills a profile trains, in the order Today offers them; [] when it only logs. */
export function flexSkillsOf(profile: Profile | null | undefined): FlexRoutineKey[] {
  const chosen = profile?.flexSkills ?? (ownerFlavour(profile) ? OWNER_FLEX_SKILLS : LEGACY_FLEX_SKILLS)
  return FLEX_ROUTINE_KEYS.filter((k) => chosen.includes(k))
}

/** The routines Today offers: none when flexibility is off or only logged. */
export function stretchRoutinesFor(profile: Profile | null | undefined): FlexRoutineKey[] {
  return hasPillar(profile, 'flexibility') ? flexSkillsOf(profile) : []
}

/** Whether flexibility is tracked as a count of sessions rather than trained. */
export function logsStretchOnly(profile: Profile | null | undefined): boolean {
  return hasPillar(profile, 'flexibility') && flexSkillsOf(profile).length === 0
}

/**
 * A skill picked or unpicked. `null` is "track sessions only"; choosing it
 * clears the skills, and choosing a skill leaves it.
 */
export function toggleFlexSkill(
  current: FlexRoutineKey[] | null | undefined,
  skill: FlexRoutineKey | null,
): FlexRoutineKey[] {
  if (skill === null) return []
  const cur = current ?? []
  const next = cur.includes(skill) ? cur.filter((k) => k !== skill) : [...cur, skill]
  return FLEX_ROUTINE_KEYS.filter((k) => next.includes(k))
}

/**
 * The routines planned stretch sessions cycle through, the one after the last
 * done first. With nothing done, or a last routine no longer trained, they run
 * in their own order.
 */
export function stretchRotationFor(skills: FlexRoutineKey[], last: FlexRoutineKey | null): FlexRoutineKey[] {
  const i = last ? skills.indexOf(last) : -1
  return [...skills.slice(i + 1), ...skills.slice(0, i + 1)]
}

/** Same skills, order aside. */
export function sameSkills(a: FlexRoutineKey[], b: FlexRoutineKey[]): boolean {
  return a.length === b.length && a.every((k) => b.includes(k))
}
