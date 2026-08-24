import { describe, expect, it } from 'vitest'
import { buildSessionSteps } from './flexSteps'
import { coldGate, gateAfterStep } from './photoSteps'
import type { FlexBlock } from '../config/flexPlan'

const ex = (key: string, maxSets: number): FlexBlock['exercises'][number] => ({
  key,
  name: key,
  sets: `${maxSets}`,
  maxSets,
  reps: 8,
  tempo: '2s down · 1s up',
  restSec: 90,
})

describe('coldGate', () => {
  it('opens the side-splits session with both of its cold shots', () => {
    expect(coldGate('side_split')).toEqual({
      id: 'cold',
      title: 'cold photos',
      shots: ['cold-split', 'cold-tailors'],
    })
  })

  // A distinct id, so a day that runs both routines doesn't have one routine's
  // cold screen suppress the other's.
  it('opens the head-to-toe session with its own three, under its own id', () => {
    expect(coldGate('head_to_toe')).toEqual({
      id: 'cold-h2t',
      title: 'cold photos',
      shots: ['cold-toe-touch', 'cold-leg-lift-left', 'cold-leg-lift-right'],
    })
  })
})

describe('gateAfterStep', () => {
  // Default-shaped routine: tailor's/horse superset (3 rounds) then a pancake,
  // giving the order tailors#0, horse#0, tailors#1, horse#1, tailors#2, horse#2,
  // pancake#0, followed by the core block.
  const plan: FlexBlock[] = [
    { label: 'Superset', superset: true, exercises: [ex('tailors_pose', 3), ex('horse_squat', 3)] },
    { label: 'Pancake', exercises: [ex('pancake_hang', 1)] },
  ]
  const steps = buildSessionSteps(plan)
  const gateAt = (exKey: string, round: number) =>
    gateAfterStep(
      steps,
      steps.findIndex((s) => s.kind === 'flex' && s.exKey === exKey && s.round === round),
    )

  it("offers the warm tailor's shot after the last tailor's set", () => {
    expect(gateAt('tailors_pose', 2)).toEqual({
      id: 'warm-tailors',
      title: "warm tailor's photo",
      shots: ['warm-tailors'],
    })
  })

  it('offers the warm split after the last stretch set, before core', () => {
    expect(gateAt('pancake_hang', 0)).toEqual({
      id: 'warm-split',
      title: 'warm split photo',
      shots: ['warm-split'],
    })
  })

  it('offers nothing after the opening set — the cold shots come before it', () => {
    expect(gateAt('tailors_pose', 0)).toBeNull()
  })

  it('offers nothing after the intermediate sets', () => {
    expect(gateAt('horse_squat', 0)).toBeNull()
    expect(gateAt('tailors_pose', 1)).toBeNull()
    expect(gateAt('horse_squat', 1)).toBeNull()
  })

  it('offers nothing on the core block', () => {
    const firstCore = steps.findIndex((s) => s.kind === 'core')
    expect(gateAfterStep(steps, firstCore)).toBeNull()
    expect(gateAfterStep(steps, steps.length - 1)).toBeNull()
  })

  it('shares one screen when the last stretch set is also the last tailor set', () => {
    const tinyPlan: FlexBlock[] = [{ label: 'B', exercises: [ex('horse_squat', 1), ex('tailors_pose', 1)] }]
    const tiny = buildSessionSteps(tinyPlan)
    expect(gateAfterStep(tiny, 1)).toEqual({
      id: 'warm-split',
      title: 'warm photos',
      shots: ['warm-tailors', 'warm-split'],
    })
  })
})

describe('gateAfterStep — head to toe', () => {
  // Two per-side exercises: the pike lift's second side is the routine's last
  // stretch set, and the only place a warm photo is owed.
  const plan: FlexBlock[] = [
    { label: 'calves', exercises: [{ ...ex('calf_stretch', 2), perSide: true }] },
    { label: 'pike', exercises: [{ ...ex('pike_lift', 2), perSide: true }] },
  ]
  const steps = buildSessionSteps(plan)
  const gateAt = (i: number) => gateAfterStep(steps, i, 'head_to_toe')
  const lastFlex = steps.map((s) => s.kind).lastIndexOf('flex')

  it('offers all three warm shots on one screen after the last stretch set', () => {
    expect(gateAt(lastFlex)).toEqual({
      id: 'warm-h2t',
      title: 'warm photos',
      shots: ['warm-toe-touch', 'warm-leg-lift-left', 'warm-leg-lift-right'],
    })
  })

  it('offers nothing anywhere earlier — both pike sides warm all three poses', () => {
    for (let i = 0; i < lastFlex; i++) expect(gateAt(i)).toBeNull()
  })

  it('offers nothing on the core block', () => {
    expect(gateAt(lastFlex + 1)).toBeNull()
    expect(gateAt(steps.length - 1)).toBeNull()
  })

  // A tailor's pose in the head-to-toe routine (a coach edit could put one there)
  // must not pull the side-splits gate in behind it.
  it('never offers a side-splits shot, even for a tailor’s stretch', () => {
    const odd = buildSessionSteps([
      { label: 'x', exercises: [ex('tailors_pose', 1), ex('pike_lift', 1)] },
    ])
    expect(gateAfterStep(odd, 0, 'head_to_toe')).toBeNull()
    expect(gateAfterStep(odd, 1, 'head_to_toe')?.shots).toEqual([
      'warm-toe-touch',
      'warm-leg-lift-left',
      'warm-leg-lift-right',
    ])
  })
})

describe('gateAfterStep — the routine it defaults to', () => {
  const steps = buildSessionSteps([{ label: 'B', exercises: [ex('pancake_hang', 1)] }])

  it('reads as the side split when no routine is named', () => {
    expect(gateAfterStep(steps, 0)).toEqual(gateAfterStep(steps, 0, 'side_split'))
  })
})
