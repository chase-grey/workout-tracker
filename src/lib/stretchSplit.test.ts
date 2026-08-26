import { describe, expect, it } from 'vitest'
import { FLEX_ROUTINES } from '../config/flexRoutines'
import {
  buildSessionSteps,
  SEC_PER_REP,
  stepWorkSec,
  type FlexSetStep,
  type SessionStep,
} from './flexSteps'
import { CORE_ENTRY_GET_READY_SEC, settleInSec } from './settleIn'
import { stretchSplit } from './stretchSplit'

const reps = () => 12
const splitOf = (steps: SessionStep[], learned?: number | null) =>
  stretchSplit(steps, reps, learned)
/** The step at `i`, narrowed to a stretch set (which is what the fixtures hold). */
const flexAt = (steps: SessionStep[], i: number): FlexSetStep => {
  const s = steps[i]
  if (s.kind !== 'flex') throw new Error(`step ${i} is not a stretch set`)
  return s
}

describe('stretchSplit', () => {
  it('prices a single hold as its hold plus its settle-in, with no rest to serve', () => {
    const steps = buildSessionSteps(FLEX_ROUTINES.head_to_toe.blocks)
    const first = flexAt(steps, 0)
    const s = splitOf([first])
    expect(s.restSec).toBe(0)
    expect(s.activeSec).toBe(settleInSec(first) + stepWorkSec(first))
    expect(s.totalSec).toBe(s.activeSec)
  })

  it('leaves the closing set with no rest — it finishes instead of resting', () => {
    const steps = buildSessionSteps(FLEX_ROUTINES.side_split.blocks, { core: true })
    const last = steps[steps.length - 1]
    expect(last.restSec).toBeGreaterThan(0)
    const with_ = splitOf(steps)
    const without = splitOf(steps.slice(0, -1))
    // Dropping the closing set takes its work and its settle-in off the total but
    // no rest, because the rest it prescribes was never going to run.
    expect(with_.restSec - without.restSec).toBe(steps[steps.length - 2].restSec)
  })

  it('counts a core set as its reps at the assumed pace', () => {
    const steps = buildSessionSteps(FLEX_ROUTINES.side_split.blocks, { core: true })
    const core = steps.filter((s) => s.kind === 'core')
    expect(core.length).toBeGreaterThan(1)
    const one = splitOf([core[0]])
    expect(one.activeSec).toBe(CORE_ENTRY_GET_READY_SEC + reps() * SEC_PER_REP)
  })

  it('skips the rest on the crossing from the mobility routine into the core', () => {
    const steps = buildSessionSteps(FLEX_ROUTINES.side_split.blocks, { core: true })
    const cross = steps.findIndex((s) => s.kind === 'core')
    const lastFlex = steps[cross - 1]
    const pair = splitOf([lastFlex, steps[cross]])
    // Only the core set's own settle-in stands between the two — the stretch's
    // rest is not served.
    expect(pair.restSec).toBe(0)
  })

  it('charges a leg swap rather than the settle-in it replaces', () => {
    const steps = buildSessionSteps(FLEX_ROUTINES.head_to_toe.blocks)
    const i = steps.findIndex((s) => s.kind === 'flex' && s.sideSwitchSec != null)
    expect(i).toBeGreaterThanOrEqual(0)
    const first = flexAt(steps, i)
    const second = flexAt(steps, i + 1)
    const pair = splitOf([first, second])
    expect(pair.activeSec).toBe(
      settleInSec(first) + stepWorkSec(first) + (first.sideSwitchSec ?? 0) + stepWorkSec(second),
    )
    // The swap is a reposition, so none of it reads as rest.
    expect(pair.restSec).toBe(0)
  })

  it('scales both halves to a learned median without changing their proportion', () => {
    const steps = buildSessionSteps(FLEX_ROUTINES.head_to_toe.blocks, { core: true })
    const raw = splitOf(steps)
    const learned = raw.totalSec * 1.4
    const scaled = splitOf(steps, learned)
    expect(scaled.totalSec).toBe(learned)
    expect(scaled.activeSec + scaled.restSec).toBeCloseTo(learned, 6)
    expect(scaled.restSec / scaled.activeSec).toBeCloseTo(raw.restSec / raw.activeSec, 6)
  })

  it('falls back to the structural price when there is no median to trust', () => {
    const steps = buildSessionSteps(FLEX_ROUTINES.side_split.blocks, { core: true })
    const raw = splitOf(steps)
    expect(splitOf(steps, null)).toEqual(raw)
    expect(splitOf(steps, 0)).toEqual(raw)
  })

  it('prices nothing as nothing', () => {
    expect(splitOf([], 900)).toEqual({ activeSec: 0, restSec: 0, totalSec: 0 })
  })
})
