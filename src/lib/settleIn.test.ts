import { describe, expect, it } from 'vitest'
import { FLEX_ROUTINES } from '../config/flexRoutines'
import { buildSessionSteps } from './flexSteps'
import { CORE_ENTRY_GET_READY_SEC, POST_PHOTO_GET_READY_SEC, settleInSec, settleInTapStartsCount, settleInWaitsForTap } from './settleIn'

describe('settleInSec', () => {
  it('gives tailor’s pose fifteen seconds and other stretches five, including repeat sets and side changes', () => {
    for (const routine of Object.values(FLEX_ROUTINES)) {
      const steps = buildSessionSteps(routine.blocks)
      steps.forEach((step, index) => {
        if (step.kind !== 'flex') return
        const expected = step.exKey === 'tailors_pose' ? 15 : 5
        expect(settleInSec(step, steps[index - 1])).toBe(expected)
        expect(settleInSec(step)).toBe(expected)
      })
    }
  })

  it('gives core entry and post-photo positioning five seconds', () => {
    expect(CORE_ENTRY_GET_READY_SEC).toBe(5)
    expect(POST_PHOTO_GET_READY_SEC).toBe(5)
    const core = buildSessionSteps(FLEX_ROUTINES.head_to_toe.blocks)
      .filter((step) => step.kind === 'core')
    expect(core.length).toBeGreaterThan(1)
    expect(settleInSec(core[0])).toBe(5)
    expect(settleInSec(core[1], core[0])).toBe(0)
  })
})

describe('settleInWaitsForTap', () => {
  const steps = buildSessionSteps(FLEX_ROUTINES.head_to_toe.blocks)

  it('waits on the way from rolling feet into the sciatic floss, and nowhere else', () => {
    const waiting = steps.filter((step, index) => settleInWaitsForTap(step, steps[index - 1]))
    expect(waiting).toHaveLength(1)
    expect(waiting[0]).toMatchObject({ exKey: 'sciatic_floss', round: 0 })
    const index = steps.indexOf(waiting[0])
    expect(steps[index - 1].exKey).toBe('rolling_feet')
  })

  it('never waits in the side split', () => {
    const side = buildSessionSteps(FLEX_ROUTINES.side_split.blocks)
    side.forEach((step, index) => expect(settleInWaitsForTap(step, side[index - 1])).toBe(false))
  })

  it('waits at every new exercise of the pelvic tilt routine, the typed-in one included, and at none of its side switches or later sets', () => {
    // Built the way the session builds it: with no sit-up block on the end.
    const tilt = buildSessionSteps(FLEX_ROUTINES.pelvic_tilt.blocks, { core: false })
    const waiting = tilt.filter((step, index) => settleInWaitsForTap(step, tilt[index - 1], 'pelvic_tilt'))
    expect(waiting.map((step) => step.exKey)).toEqual([
      'standing_pelvic_tilt',
      'hip_thrust',
      'rkc_plank',
      'lunge_stretch',
      'rectus_femoris_stretch',
    ])
    // The first exercise opens on the routine's preview, which is its own tap.
    expect(settleInWaitsForTap(tilt[0], undefined, 'pelvic_tilt')).toBe(false)
    // The thrust asks once, on the way in. Its later sets come off a rest.
    expect(tilt.filter((step) => step.exKey === 'hip_thrust').length).toBeGreaterThan(1)
    // The tap says you're in position: the set starts on it, with no count after.
    tilt.forEach((step, index) => expect(settleInTapStartsCount(step, tilt[index - 1])).toBe(false))
  })

  it('leaves the other routines their counts when told which routine it is', () => {
    const waiting = steps.filter((step, index) => settleInWaitsForTap(step, steps[index - 1], 'head_to_toe'))
    expect(waiting.map((step) => step.exKey)).toEqual(['sciatic_floss'])
    expect(settleInTapStartsCount(waiting[0], steps[steps.indexOf(waiting[0]) - 1])).toBe(true)
  })
})
