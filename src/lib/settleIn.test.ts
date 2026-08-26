import { describe, expect, it } from 'vitest'
import { FLEX_ROUTINES } from '../config/flexRoutines'
import { buildSessionSteps, type SessionStep } from './flexSteps'
import { CORE_ENTRY_GET_READY_SEC, GET_READY_SEC, settleInSec } from './settleIn'

const steps = buildSessionSteps(FLEX_ROUTINES.head_to_toe.blocks)
const at = (i: number) => settleInSec(steps[i], steps[i - 1])
const find = (pred: (s: SessionStep) => boolean) => {
  const i = steps.findIndex(pred)
  if (i < 0) throw new Error('no such step')
  return i
}
const isFlex = (key: string, round: number, side: string) => (s: SessionStep) =>
  s.kind === 'flex' && s.exKey === key && s.round === round && s.side === side

describe('settleInSec', () => {
  it('builds the calf stretch once and then only changes the angle', () => {
    const first = find(isFlex('calf_stretch', 0, 'left'))
    expect(at(first)).toBe(20)
    // Every other set of it — the other foot, and each of the two remaining
    // angles — is a reposition off the position already built.
    for (const round of [0, 1, 2]) {
      for (const side of ['left', 'right']) {
        if (round === 0 && side === 'left') continue
        expect(at(find(isFlex('calf_stretch', round, side)))).toBe(5)
      }
    }
  })

  it('builds the nerve floss once and then gives ten seconds to change legs', () => {
    expect(at(find(isFlex('sciatic_floss', 0, 'left')))).toBe(20)
    expect(at(find(isFlex('sciatic_floss', 0, 'right')))).toBe(10)
    expect(at(find(isFlex('sciatic_floss', 2, 'left')))).toBe(10)
  })

  it('charges the full setup when a stretch is the one arriving', () => {
    // The first calf set follows the last of the feet — a different position, so
    // there is nothing built to reposition within.
    const first = find(isFlex('calf_stretch', 0, 'left'))
    expect(steps[first - 1].exKey).toBe('rolling_feet')
    expect(at(first)).toBe(20)
    expect(settleInSec(steps[first])).toBe(20)
  })

  it('falls back to the plain count for a stretch with nothing to set up', () => {
    const [tailors] = buildSessionSteps(FLEX_ROUTINES.side_split.blocks)
    expect(settleInSec(tailors)).toBe(15)
    expect(settleInSec({ ...tailors, exKey: 'made_up' } as SessionStep)).toBe(GET_READY_SEC)
  })

  it('repositions into the core block and then rests between its sets instead', () => {
    const core = steps.filter((s) => s.kind === 'core')
    expect(core.length).toBeGreaterThan(1)
    expect(settleInSec(core[0], steps[steps.indexOf(core[0]) - 1])).toBe(CORE_ENTRY_GET_READY_SEC)
    expect(settleInSec(core[1], core[0])).toBe(0)
  })
})
