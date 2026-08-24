import { describe, expect, it } from 'vitest'
import { FLEX_ROUTINES, FLEX_ROUTINE_KEYS, flexRoutineOf } from './flexRoutines'
import { DEFAULT_FLEX_ROUTINE } from './flexPlan'
import { parseTempo } from '../lib/tempo'
import { motionForPhases, phaseDepths } from '../lib/rhythmMotion'
import { PHOTO_SHOT } from '../lib/photoSteps'

const HEAD_TO_TOE = FLEX_ROUTINES.head_to_toe
const exercises = HEAD_TO_TOE.blocks.flatMap((b) => b.exercises)
const byKey = (key: string) => {
  const ex = exercises.find((e) => e.key === key)
  if (!ex) throw new Error(`no exercise ${key}`)
  return ex
}

describe('the routine registry', () => {
  it('covers every key, keyed by itself', () => {
    for (const key of FLEX_ROUTINE_KEYS) expect(FLEX_ROUTINES[key].key).toBe(key)
  })

  it('keeps the side split pointed at the shipped default blocks', () => {
    expect(FLEX_ROUTINES.side_split.blocks).toBe(DEFAULT_FLEX_ROUTINE)
  })

  it('falls back to the side split for an unset key', () => {
    expect(flexRoutineOf(undefined)).toBe(FLEX_ROUTINES.side_split)
    expect(flexRoutineOf('head_to_toe')).toBe(HEAD_TO_TOE)
  })

  it('offers only shots that exist, and no shot to both routines', () => {
    const seen = new Set<string>()
    for (const key of FLEX_ROUTINE_KEYS) {
      const r = FLEX_ROUTINES[key]
      for (const shot of [...r.coldShots, ...r.warmShots]) {
        expect(PHOTO_SHOT[shot]).toBeDefined()
        expect(seen.has(shot)).toBe(false)
        seen.add(shot)
      }
    }
  })

  it('offers each routine its cold shots warm as well', () => {
    for (const key of FLEX_ROUTINE_KEYS) {
      const r = FLEX_ROUTINES[key]
      expect(r.coldShots.every((s) => PHOTO_SHOT[s].cold)).toBe(true)
      expect(r.warmShots.some((s) => PHOTO_SHOT[s].cold)).toBe(false)
      expect(r.warmShots.map((s) => PHOTO_SHOT[s].mode).sort()).toEqual(
        r.coldShots.map((s) => PHOTO_SHOT[s].mode).sort(),
      )
    }
  })
})

describe('the head-to-toe routine', () => {
  it('runs its five exercises, every one of them a side at a time', () => {
    expect(exercises.map((e) => e.key)).toEqual([
      'rolling_feet',
      'calf_stretch',
      'sciatic_floss',
      'pike_block_crush',
      'pike_lift',
    ])
    expect(exercises.every((e) => e.perSide)).toBe(true)
  })

  it('holds the feet and the calves, and paces the rest', () => {
    expect(byKey('rolling_feet').holdSec).toBe(90)
    expect(byKey('calf_stretch').holdSec).toBe(90)
    for (const key of ['sciatic_floss', 'pike_block_crush', 'pike_lift']) {
      expect(byKey(key).holdSec).toBeUndefined()
      expect(byKey(key).tempo).not.toBe('')
    }
  })

  // A hold has nothing for the rhythm guide to animate, so the two must not both
  // be set on one exercise — see FlexExercise.holdSec.
  it('never sets a hold and a tempo on the same stretch', () => {
    for (const e of exercises) expect(e.holdSec && e.tempo).toBeFalsy()
  })

  it('names the calf stretch’s three sets as the variations they are', () => {
    const calf = byKey('calf_stretch')
    expect(calf.maxSets).toBe(3)
    expect(calf.setLabels).toEqual(['straight on', 'feet out', 'feet in'])
    expect(calf.setLabels).toHaveLength(calf.maxSets)
  })

  it('gives every set-labelled stretch a label per set', () => {
    for (const e of exercises) {
      if (e.setLabels) expect(e.setLabels).toHaveLength(e.maxSets)
    }
  })

  it('rests only after both sides, and only where there is a rest at all', () => {
    expect(byKey('rolling_feet').restSec).toBe(0)
    expect(byKey('calf_stretch').restSec).toBe(0)
    for (const key of ['sciatic_floss', 'pike_block_crush', 'pike_lift']) {
      expect(byKey(key).restSec).toBe(60)
      expect(byKey(key).restAfterSides).toBe(true)
    }
  })

  it('gives the block crush one set and the pike lift three', () => {
    expect(byKey('pike_block_crush').maxSets).toBe(1)
    expect(byKey('pike_lift').maxSets).toBe(3)
  })
})

// The tempo strings are read by word-boundary regexes, so a rename would change
// the animation silently. These pin the shape each one is meant to produce.
describe('the head-to-toe tempos, as lib/rhythmMotion reads them', () => {
  const phasesOf = (key: string) => parseTempo(byKey(key).tempo)

  it('gives the nerve floss a breath — it rises and returns', () => {
    const phases = phasesOf('sciatic_floss')
    expect(phases.map((p) => p.seconds)).toEqual([3, 3])
    expect(motionForPhases(phases)).toBe('breathe')
  })

  it('gives the block crush a descent that never comes back up', () => {
    const phases = phasesOf('pike_block_crush')
    expect(phases.map((p) => p.seconds)).toEqual([10])
    expect(motionForPhases(phases)).toBe('descent')
    expect(phaseDepths(phases)).toEqual([1])
  })

  it('gives the pike lift work, release, lift, release', () => {
    const phases = phasesOf('pike_lift')
    expect(phases.map((p) => p.seconds)).toEqual([5, 5, 5, 5])
    expect(motionForPhases(phases)).toBe('breathe')
    expect(phaseDepths(phases)).toEqual([1, 0.3, 0, 0])
  })

  it('leaves the held stretches with nothing to parse', () => {
    expect(phasesOf('rolling_feet')).toEqual([])
    expect(phasesOf('calf_stretch')).toEqual([])
  })
})
