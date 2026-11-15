import { describe, expect, it } from 'vitest'
import {
  LEGACY_FLEX_SKILLS,
  flexSkillsOf,
  logsStretchOnly,
  sameSkills,
  stretchRotationFor,
  stretchRoutinesFor,
  toggleFlexSkill,
} from './flexSkills'
import { FLEX_ROUTINES, FLEX_ROUTINE_KEYS } from '../config/flexRoutines'
import type { Profile } from './profile'

const profile = (over: Partial<Profile> = {}): Profile => ({
  name: 'a',
  pillars: ['flexibility'],
  weeklyGoals: [],
  calorieGoals: [],
  createdAt: '2026-11-15T00:00:00Z',
  ...over,
})

describe('flexSkillsOf', () => {
  it('keeps the original two for a device with no profile', () => {
    expect(flexSkillsOf(null)).toEqual(LEGACY_FLEX_SKILLS)
  })

  it('keeps the original two for a profile that never answered', () => {
    expect(flexSkillsOf(profile())).toEqual(['side_split', 'head_to_toe'])
  })

  it('reads the chosen skills in the order Today offers them', () => {
    expect(flexSkillsOf(profile({ flexSkills: ['shoulders', 'front_split'] }))).toEqual([
      'front_split',
      'shoulders',
    ])
  })

  it('drops a stored key no routine answers to', () => {
    expect(flexSkillsOf(profile({ flexSkills: ['pancake', 'nope' as never] }))).toEqual(['pancake'])
  })
})

describe('stretchRoutinesFor', () => {
  it('offers nothing when flexibility is off', () => {
    expect(stretchRoutinesFor(profile({ pillars: ['strength'], flexSkills: ['pancake'] }))).toEqual([])
  })

  it('offers nothing to a profile that only logs', () => {
    expect(stretchRoutinesFor(profile({ flexSkills: [] }))).toEqual([])
  })
})

describe('logsStretchOnly', () => {
  it('is the empty answer, with flexibility on', () => {
    expect(logsStretchOnly(profile({ flexSkills: [] }))).toBe(true)
    expect(logsStretchOnly(profile({ pillars: ['cardio'], flexSkills: [] }))).toBe(false)
    expect(logsStretchOnly(profile())).toBe(false)
    expect(logsStretchOnly(null)).toBe(false)
  })
})

describe('toggleFlexSkill', () => {
  it('adds and removes, kept in offer order', () => {
    expect(toggleFlexSkill(['bridge'], 'side_split')).toEqual(['side_split', 'bridge'])
    expect(toggleFlexSkill(['side_split', 'bridge'], 'side_split')).toEqual(['bridge'])
  })

  it('starts from nothing when unanswered', () => {
    expect(toggleFlexSkill(null, 'pancake')).toEqual(['pancake'])
  })

  it('treats sessions-only as clearing every skill', () => {
    expect(toggleFlexSkill(['pancake', 'bridge'], null)).toEqual([])
  })

  it('leaves sessions-only when a skill is picked', () => {
    expect(toggleFlexSkill([], 'front_split')).toEqual(['front_split'])
  })
})

describe('stretchRotationFor', () => {
  it('starts on the routine after the last one done', () => {
    expect(stretchRotationFor(['side_split', 'head_to_toe'], 'side_split')).toEqual(['head_to_toe', 'side_split'])
    expect(stretchRotationFor(['side_split', 'pancake', 'bridge'], 'pancake')).toEqual(['bridge', 'side_split', 'pancake'])
  })

  it('runs in order with nothing done, or a last routine no longer trained', () => {
    expect(stretchRotationFor(['side_split', 'head_to_toe'], null)).toEqual(['side_split', 'head_to_toe'])
    expect(stretchRotationFor(['pancake', 'bridge'], 'side_split')).toEqual(['pancake', 'bridge'])
  })

  it('is empty for someone who only counts sessions', () => {
    expect(stretchRotationFor([], 'side_split')).toEqual([])
  })
})

describe('sameSkills', () => {
  it('ignores order', () => {
    expect(sameSkills(['pancake', 'bridge'], ['bridge', 'pancake'])).toBe(true)
    expect(sameSkills(['pancake'], ['pancake', 'bridge'])).toBe(false)
  })
})

describe('every skill', () => {
  it('has a routine with work in it', () => {
    for (const k of FLEX_ROUTINE_KEYS) {
      expect(FLEX_ROUTINES[k].key).toBe(k)
      expect(FLEX_ROUTINES[k].blocks.flatMap((b) => b.exercises).length).toBeGreaterThan(0)
    }
  })
})
