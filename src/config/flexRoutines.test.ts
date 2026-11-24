import { buildFlexSteps, buildSessionSteps, carriedWeight, heldSets, loadedExerciseOf, stepWorkSec } from '../lib/flexSteps'
import { settleInSec } from '../lib/settleIn'
import { describe, expect, it } from 'vitest'
import { FLEX_ROUTINES, FLEX_ROUTINE_KEYS, flexRoutineOf } from './flexRoutines'
import { DEFAULT_FLEX_ROUTINE } from './flexPlan'
import { parseTempo } from '../lib/tempo'
import {
  cycleCloses,
  motionForPhases,
  phaseDepths,
  phaseDrives,
  phaseEfforts,
} from '../lib/rhythmMotion'
import { PHOTO_SHOT, coldGate } from '../lib/photoSteps'

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
      // Posture doesn't warm up: a plain shot is taken once, at the top.
      expect(r.warmShots.map((s) => PHOTO_SHOT[s].mode).sort()).toEqual(
        r.coldShots.filter((s) => !PHOTO_SHOT[s].plain).map((s) => PHOTO_SHOT[s].mode).sort(),
      )
    }
  })

  it('ships the pelvic tilt corrective as posted: six moves, the thrust the one that is loaded', () => {
    const r = FLEX_ROUTINES.pelvic_tilt
    expect(r.weeklyDays).toBe(6)
    const moves = r.blocks.flatMap((b) => b.exercises)
    expect(moves.map((e) => [e.key, e.maxSets, e.holdSec ?? e.reps, !!e.perSide])).toEqual([
      ['lying_pelvic_tilt', 1, 10, false],
      ['standing_pelvic_tilt', 1, 10, false],
      ['hip_thrust', 3, 10, false],
      ['rkc_plank', 2, 30, false],
      ['lunge_stretch', 2, 30, true],
      // The one departure from the post: a single minute a side.
      ['rectus_femoris_stretch', 1, 60, true],
    ])
    expect(moves.filter((e) => e.load).map((e) => e.key)).toEqual(['hip_thrust'])
    expect(r.coldShots).toEqual(['pelvic-tilt'])
    expect(coldGate('pelvic_tilt')).toMatchObject({ id: 'posture', title: 'posture photo' })
  })
})

describe('a loaded exercise in a routine', () => {
  const steps = buildSessionSteps(FLEX_ROUTINES.pelvic_tilt.blocks, { core: false })

  it('stands where the plan put it, as typed-in sets', () => {
    expect(steps.map((s) => `${s.kind}:${s.exKey}`).filter((k, i, all) => k !== all[i - 1])).toEqual([
      'flex:lying_pelvic_tilt',
      'flex:standing_pelvic_tilt',
      'core:hip_thrust',
      'flex:rkc_plank',
      'flex:lunge_stretch',
      'flex:rectus_femoris_stretch',
    ])
    const thrusts = steps.filter((s) => s.kind === 'core')
    expect(thrusts).toHaveLength(3)
    expect(thrusts[0]).toMatchObject({ repMin: 10, repMax: 20, restSec: 45, round: 0 })
    expect(new Set(steps.map((s) => s.stepKey)).size).toBe(steps.length)
  })

  it('names the exercise the session logs its sets under', () => {
    expect(loadedExerciseOf(steps)).toMatchObject({ key: 'hip_thrust', repMin: 10, repMax: 20 })
    expect(loadedExerciseOf(buildSessionSteps(FLEX_ROUTINES.head_to_toe.blocks, { core: false }))).toBeNull()
  })

  it('runs the plank as an open hold, and logs what each one ran to', () => {
    const planks = steps.filter((s) => s.exKey === 'rkc_plank')
    expect(planks.map((s) => s.kind === 'flex' && s.openHold)).toEqual([true, true])
    const [a, b] = planks.map((s) => s.stepKey)
    expect(heldSets(steps, new Set([a, b]), { [a]: 34, [b]: 29 })).toEqual([
      { exercise: 'rkc_plank', sets: [{ reps: 34, weightLbs: null }, { reps: 29, weightLbs: null }] },
    ])
    // One not finished, or with no time on its clock, isn't logged.
    expect(heldSets(steps, new Set([a]), { [a]: 34, [b]: 29 })[0].sets).toHaveLength(1)
    expect(heldSets(steps, new Set([a, b]), { [a]: 0 })).toEqual([])
    expect(steps.filter((s) => s.kind === 'flex' && s.openHold && s.exKey !== 'rkc_plank')).toEqual([])
  })

  it('is left out of the stretch-only steps', () => {
    expect(buildFlexSteps(FLEX_ROUTINES.pelvic_tilt.blocks).some((s) => s.exKey === 'hip_thrust')).toBe(false)
  })

  it('carries the weight forward from the last set it was changed on', () => {
    // Untouched: the progression's target.
    expect(carriedWeight({}, 0, 45)).toBe(45)
    expect(carriedWeight({}, 2, null)).toBeNull()
    // Cleared on the first set of a day with no plate: the rest follow.
    expect(carriedWeight({ 0: null }, 1, 45)).toBeNull()
    expect(carriedWeight({ 0: null }, 2, 45)).toBeNull()
    // Changed again later: from there on.
    expect(carriedWeight({ 0: 25, 2: 35 }, 1, 45)).toBe(25)
    expect(carriedWeight({ 0: 25, 2: 35 }, 2, 45)).toBe(35)
  })
})

describe('the head-to-toe routine', () => {
  it('runs its five exercises, every one of them a side at a time', () => {
    expect(exercises.map((e) => e.key)).toEqual([
      'rolling_feet',
      'sciatic_floss',
      'pike_block_crush',
      'pike_lift',
      'calf_stretch',
    ])
    expect(exercises.every((e) => e.perSide)).toBe(true)
  })

  it('holds the feet and the calves, and paces the rest', () => {
    expect(byKey('rolling_feet').holdSec).toBe(90)
    expect(byKey('calf_stretch').holdSec).toBe(30)
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

  it('alternates feet for three 30-second angles with only positioning time', () => {
    for (const startSide of ['left', 'right'] as const) {
      const steps = buildFlexSteps(HEAD_TO_TOE.blocks, startSide).filter(s => s.exKey === 'calf_stretch')
      const other = startSide === 'left' ? 'right' : 'left'
      expect(steps.map(s => [s.side, s.setLabel])).toEqual([
        [startSide, 'foot straight'], [other, 'foot straight'],
        [startSide, 'foot in'], [other, 'foot in'],
        [startSide, 'foot out'], [other, 'foot out'],
      ])
      expect(steps.every(s => s.holdSec === 30 && s.restSec === 0 && settleInSec(s) === 5)).toBe(true)
      expect(steps.filter(s => s.side === startSide).reduce((sum, s) => sum + stepWorkSec(s), 0)).toBe(90)
    }
  })

  it('gives every set-labelled stretch a label per set', () => {
    for (const e of exercises) {
      if (e.setLabels) expect(e.setLabels).toHaveLength(e.maxSets)
    }
  })

  // The rests are scaled to what the set actually costs rather than set to one
  // number: a nerve glide barely earns thirty, three press-and-release reps earn
  // forty-five, and only the pike lift still earns a full minute.
  it('rests only after both sides, and only as long as the set is worth', () => {
    expect(byKey('rolling_feet').restSec).toBe(0)
    expect(byKey('calf_stretch').restSec).toBe(0)
    expect(byKey('sciatic_floss').restSec).toBe(30)
    expect(byKey('pike_block_crush').restSec).toBe(45)
    expect(byKey('pike_lift').restSec).toBe(60)
    for (const key of ['sciatic_floss', 'pike_block_crush', 'pike_lift']) {
      expect(byKey(key).restAfterSides).toBe(true)
    }
  })

  // The measured work goes before the calves, and the calves close the routine
  // out warm — see the ordering note in flexRoutines. Pinned because the warm
  // photo gate anchors to the last pike set on the strength of it (see
  // lib/photoSteps.gateAfterStep).
  it('ends on the calves, with the pike work ahead of them', () => {
    expect(HEAD_TO_TOE.blocks.map((b) => b.label)).toEqual([
      'feet',
      'nerve floss',
      'pike',
      'calves',
    ])
  })

  it('gives the nerve floss ten seconds to change legs, the rest the default', () => {
    expect(byKey('sciatic_floss').sideSwitchSec).toBe(10)
    for (const key of ['rolling_feet', 'calf_stretch', 'pike_block_crush', 'pike_lift']) {
      expect(byKey(key).sideSwitchSec).toBeUndefined()
    }
  })

  it('gives the floss two sets, the block crush one, and the pike lift three', () => {
    expect(byKey('sciatic_floss').maxSets).toBe(2)
    expect(byKey('pike_block_crush').maxSets).toBe(1)
    expect(byKey('pike_lift').maxSets).toBe(3)
  })
})

// The tempo strings are read by word-boundary regexes, so a rename would change
// the animation silently. These pin the shape each one is meant to produce.
describe('the head-to-toe tempos, as lib/rhythmMotion reads them', () => {
  const phasesOf = (key: string) => parseTempo(byKey(key).tempo)

  it('paces the nerve floss forward and back for three seconds each', () => {
    const phases = phasesOf('sciatic_floss')
    expect(phases.map((p) => p.seconds)).toEqual([3, 3])
    expect(phases.map((p) => p.label)).toEqual(['forward', 'back'])
  })

  // Ten seconds of hard press and five of rest, three times through: the rest half
  // is what gives the descent something to loop back from, instead of a lone press
  // phase that freezes deep and has to be faded back to the top.
  it('gives the block crush a hard press and a rest that keeps the pose', () => {
    const phases = phasesOf('pike_block_crush')
    expect(phases.map((p) => p.seconds)).toEqual([10, 5])
    expect(motionForPhases(phases)).toBe('descent')
    expect(phaseDepths(phases)).toEqual([1, 0.3])
    expect(phaseEfforts(phases)).toEqual([1, 0])
    expect(cycleCloses(phases)).toBe(true)
    expect(byKey('pike_block_crush').reps).toBe(3)
  })

  // Press, rest, pull, rest — two opposite efforts, not one trip down and back.
  // Reading it as a breath is what made the four phases blur into each other: a
  // breath's depth puts pulling up at neutral, the same place as resting.
  it('gives the pike lift a push down, a pull up, and a rest after each', () => {
    const phases = phasesOf('pike_lift')
    expect(phases.map((p) => p.seconds)).toEqual([5, 5, 5, 5])
    expect(motionForPhases(phases)).toBe('pushpull')
    expect(phaseDrives(phases)).toEqual([1, 0, -1, 0])
    expect(phaseEfforts(phases)).toEqual([1, 0, 1, 0])
  })

  it('leaves the held stretches with nothing to parse', () => {
    expect(phasesOf('rolling_feet')).toEqual([])
    expect(phasesOf('calf_stretch')).toEqual([])
  })
})
