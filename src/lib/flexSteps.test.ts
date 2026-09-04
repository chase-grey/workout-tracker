import { describe, expect, it } from 'vitest'
import {
  SEC_PER_REP,
  buildCoreSteps,
  buildFlexSteps,
  buildSessionSteps,
  flexRoundKey,
  stepWorkSec,
} from './flexSteps'
import type { FlexBlock } from '../config/flexPlan'
import { STRETCH_CORE } from '../config/plan'

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

describe('buildCoreSteps', () => {
  it('produces one core step per configured core set', () => {
    const steps = buildCoreSteps()
    expect(steps).toHaveLength(STRETCH_CORE.sets)
    expect(steps.every((s) => s.kind === 'core' && s.exKey === STRETCH_CORE.key)).toBe(true)
    expect(steps.map((s) => s.round)).toEqual([0, 1, 2, 3])
  })

  it("carries the core movement's own rep range and rest", () => {
    const [first] = buildCoreSteps()
    expect(first.repMin).toBe(STRETCH_CORE.repMin)
    expect(first.repMax).toBe(STRETCH_CORE.repMax)
    expect(first.restSec).toBe(STRETCH_CORE.restSec)
  })
})

describe('buildSessionSteps', () => {
  it('appends the core block after the mobility flow', () => {
    const plan: FlexBlock[] = [{ label: 'B', exercises: [ex('a', 2)] }]
    const steps = buildSessionSteps(plan)
    expect(steps).toHaveLength(2 + STRETCH_CORE.sets)
    expect(steps.slice(0, 2).every((s) => s.kind === 'flex')).toBe(true)
    expect(steps.slice(2).every((s) => s.kind === 'core')).toBe(true)
  })
})

describe('buildFlexSteps — per-side stretches', () => {
  const perSide = (over: Partial<FlexBlock['exercises'][number]> = {}) => ({
    ...ex('floss', 3),
    perSide: true,
    ...over,
  })

  it('expands each round into a left step then a right one', () => {
    const steps = buildFlexSteps([{ label: 'B', exercises: [perSide()] }])
    expect(steps.map((s) => `${s.round}:${s.side}`)).toEqual([
      '0:left',
      '0:right',
      '1:left',
      '1:right',
      '2:left',
      '2:right',
    ])
  })

  // Every round leads with the same leg: the second side is done in the shape the
  // first one just set, and swapping the lead makes the two legs' logs harder to
  // read against each other.
  it('leads with the left leg every round rather than trading', () => {
    const steps = buildFlexSteps([{ label: 'B', exercises: [perSide()] }])
    expect(steps.filter((s) => s.round === 2)[0].side).toBe('left')
  })

  it('gives the two sides of a round separate step keys', () => {
    const steps = buildFlexSteps([{ label: 'B', exercises: [perSide()] }])
    expect(new Set(steps.map((s) => s.stepKey)).size).toBe(steps.length)
    expect(steps[0].stepKey).toBe('0:floss:0:left')
    expect(steps[1].stepKey).toBe('0:floss:0:right')
  })

  it('groups both sides for one animation, but not the next round', () => {
    const steps = buildFlexSteps([{ label: 'B', exercises: [perSide()] }])
    expect(flexRoundKey(steps[0])).toBe(flexRoundKey(steps[1]))
    expect(flexRoundKey(steps[2])).not.toBe(flexRoundKey(steps[0]))
  })

  it('leaves a two-sided stretch as one step per round, with no side', () => {
    const steps = buildFlexSteps([{ label: 'B', exercises: [ex('pancake', 2)] }])
    expect(steps.map((s) => s.side)).toEqual([undefined, undefined])
    expect(steps[0].stepKey).toBe('0:pancake:0')
  })

  describe('where the rest lands', () => {
    it('puts it on the second side when the round rests after both', () => {
      const steps = buildFlexSteps([
        { label: 'B', exercises: [perSide({ restSec: 60, restAfterSides: true })] },
      ])
      expect(steps.map((s) => s.restSec)).toEqual([0, 60, 0, 60, 0, 60])
    })

    it('puts it on each side when the stretch rests after every one', () => {
      const steps = buildFlexSteps([{ label: 'B', exercises: [perSide({ restSec: 60 })] }])
      expect(steps.map((s) => s.restSec)).toEqual([60, 60, 60, 60, 60, 60])
    })
  })

  describe('the side switch', () => {
    it('sits on the side a switch follows, when no real rest already does', () => {
      const steps = buildFlexSteps([
        { label: 'B', exercises: [perSide({ restSec: 60, restAfterSides: true })] },
      ])
      expect(steps.map((s) => s.sideSwitchSec)).toEqual([5, undefined, 5, undefined, 5, undefined])
    })

    it('takes the stretch’s own switch time over the default', () => {
      const steps = buildFlexSteps([
        { label: 'B', exercises: [perSide({ restSec: 0, sideSwitchSec: 12 })] },
      ])
      expect(steps[0].sideSwitchSec).toBe(12)
    })

    // The feet and calf holds prescribe no rest at all, so the switch is the only
    // thing between the two sides.
    it('is there for a stretch that never rests', () => {
      const steps = buildFlexSteps([{ label: 'B', exercises: [perSide({ restSec: 0 })] }])
      expect(steps.map((s) => s.sideSwitchSec)).toEqual([5, undefined, 5, undefined, 5, undefined])
    })

    // A real rest between the sides is time enough to switch legs in.
    it('is absent when a rest already sits between the sides', () => {
      const steps = buildFlexSteps([{ label: 'B', exercises: [perSide({ restSec: 60 })] }])
      expect(steps.every((s) => s.sideSwitchSec === undefined)).toBe(true)
    })
  })

  it('interleaves a per-side superset round-robin, both sides together', () => {
    const steps = buildFlexSteps([
      {
        label: 'S',
        superset: true,
        exercises: [perSide({ key: 'a', maxSets: 2 }), perSide({ key: 'b', maxSets: 2 })],
      },
    ])
    expect(steps.map((s) => `${s.exKey}#${s.round}:${s.side}`)).toEqual([
      'a#0:left',
      'a#0:right',
      'b#0:left',
      'b#0:right',
      'a#1:left',
      'a#1:right',
      'b#1:left',
      'b#1:right',
    ])
  })
})

describe('buildFlexSteps — holds and set labels', () => {
  it('carries the hold onto every step of a held stretch', () => {
    const steps = buildFlexSteps([
      { label: 'B', exercises: [{ ...ex('calf', 2), tempo: '', holdSec: 90, perSide: true }] },
    ])
    expect(steps.every((s) => s.holdSec === 90)).toBe(true)
  })

  it('leaves holdSec off a rep-paced stretch entirely', () => {
    const steps = buildFlexSteps([{ label: 'B', exercises: [ex('pancake', 1)] }])
    expect('holdSec' in steps[0]).toBe(false)
  })

  it('labels each round from setLabels, and both its sides alike', () => {
    const steps = buildFlexSteps([
      {
        label: 'B',
        exercises: [
          { ...ex('calf', 3), perSide: true, setLabels: ['straight on', 'feet out', 'feet in'] },
        ],
      },
    ])
    expect(steps.map((s) => s.setLabel)).toEqual([
      'straight on',
      'straight on',
      'feet out',
      'feet out',
      'feet in',
      'feet in',
    ])
  })

  it('leaves the label off rounds the list does not reach', () => {
    const steps = buildFlexSteps([
      { label: 'B', exercises: [{ ...ex('calf', 3), setLabels: ['only one'] }] },
    ])
    expect(steps.map((s) => s.setLabel)).toEqual(['only one', undefined, undefined])
  })
})

describe('stepWorkSec', () => {
  const workOf = (over: Partial<FlexBlock['exercises'][number]>) =>
    stepWorkSec(buildFlexSteps([{ label: 'B', exercises: [{ ...ex('x', 1), ...over }] }])[0])

  it('counts a hold as its seconds, not its reps', () => {
    expect(workOf({ tempo: '', holdSec: 90 })).toBe(90)
  })

  it('prices a rep at the pace its tempo states', () => {
    // 2s down + 1s up = 3s a rep, so eight reps is 24 seconds, not 40.
    expect(workOf({ tempo: '2s down · 1s up', reps: 8 })).toBe(24)
  })

  // The pike lift: five reps of twenty seconds is a hundred, and the flat
  // five-a-rep assumption would have called it twenty-five.
  it('prices a long tempo at its real length', () => {
    expect(workOf({ tempo: '5s contract down · 5s rest · 5s lift · 5s rest', reps: 5 })).toBe(100)
  })

  it('falls back to the flat assumption when the tempo says nothing usable', () => {
    expect(workOf({ tempo: '', reps: 8 })).toBe(8 * SEC_PER_REP)
    expect(workOf({ tempo: 'nice and slow', reps: 8 })).toBe(8 * SEC_PER_REP)
  })

  it('takes the hold over the tempo when a stretch somehow has both', () => {
    expect(workOf({ tempo: '2s down · 1s up', holdSec: 90 })).toBe(90)
  })
})

describe('buildSessionSteps — the core block', () => {
  const plan: FlexBlock[] = [{ label: 'B', exercises: [ex('pancake', 2)] }]

  it('appends core by default', () => {
    const steps = buildSessionSteps(plan)
    expect(steps.filter((s) => s.kind === 'core')).toHaveLength(STRETCH_CORE.sets)
  })

  // The second stretch of a day: the first one already did the sit-ups.
  it('leaves it off when asked, closing the session on a stretch', () => {
    const steps = buildSessionSteps(plan, { core: false })
    expect(steps.every((s) => s.kind === 'flex')).toBe(true)
    expect(steps).toHaveLength(2)
    expect(steps[steps.length - 1].kind).toBe('flex')
  })

  it('appends it when the flag says so outright', () => {
    expect(buildSessionSteps(plan, { core: true })).toEqual(buildSessionSteps(plan))
  })
})
