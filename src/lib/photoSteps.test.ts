import { describe, expect, it } from 'vitest'
import { buildSessionSteps } from './flexSteps'
import { COLD_GATE, gateAfterStep } from './photoSteps'
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

describe('COLD_GATE', () => {
  it('opens the session with both cold shots', () => {
    expect(COLD_GATE.shots).toEqual(['cold-split', 'cold-tailors'])
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
