import { describe, expect, it } from 'vitest'
import { buildDeadBugSteps, buildFlexSteps, buildSessionSteps } from './flexSteps'
import type { FlexBlock } from '../config/flexPlan'
import { DEAD_BUG } from '../config/plan'

const ex = (key: string, maxSets: number): FlexBlock['exercises'][number] => ({
  key,
  name: key,
  sets: `${maxSets}`,
  maxSets,
  reps: 8,
  tempo: '2s down · 1s up',
  restSec: 90,
})

describe('buildFlexSteps', () => {
  it('interleaves a superset round-robin', () => {
    const plan: FlexBlock[] = [
      { label: 'Superset', superset: true, exercises: [ex('tailors', 3), ex('horse', 3)] },
      { label: 'Pancake', exercises: [ex('pancake', 2)] },
    ]
    const steps = buildFlexSteps(plan)
    expect(steps.map((s) => `${s.exKey}#${s.round}`)).toEqual([
      'tailors#0',
      'horse#0',
      'tailors#1',
      'horse#1',
      'tailors#2',
      'horse#2',
      'pancake#0',
      'pancake#1',
    ])
  })

  it('handles uneven superset set counts', () => {
    const plan: FlexBlock[] = [
      { label: 'S', superset: true, exercises: [ex('a', 3), ex('b', 1)] },
    ]
    expect(buildFlexSteps(plan).map((s) => `${s.exKey}#${s.round}`)).toEqual([
      'a#0',
      'b#0',
      'a#1',
      'a#2',
    ])
  })

  it('runs a non-superset block sequentially', () => {
    const plan: FlexBlock[] = [{ label: 'B', exercises: [ex('a', 2), ex('b', 2)] }]
    expect(buildFlexSteps(plan).map((s) => `${s.exKey}#${s.round}`)).toEqual([
      'a#0',
      'a#1',
      'b#0',
      'b#1',
    ])
  })
})

describe('buildDeadBugSteps', () => {
  it('produces one core step per configured dead-bug set', () => {
    const steps = buildDeadBugSteps()
    expect(steps).toHaveLength(DEAD_BUG.sets)
    expect(steps.every((s) => s.kind === 'core' && s.exKey === DEAD_BUG.key)).toBe(true)
    expect(steps.map((s) => s.round)).toEqual([0, 1, 2, 3])
  })
})

describe('buildSessionSteps', () => {
  it('appends the dead-bug core block after the mobility flow', () => {
    const plan: FlexBlock[] = [{ label: 'B', exercises: [ex('a', 2)] }]
    const steps = buildSessionSteps(plan)
    expect(steps).toHaveLength(2 + DEAD_BUG.sets)
    expect(steps.slice(0, 2).every((s) => s.kind === 'flex')).toBe(true)
    expect(steps.slice(2).every((s) => s.kind === 'core')).toBe(true)
  })
})
