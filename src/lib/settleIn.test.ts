import { describe, expect, it } from 'vitest'
import { FLEX_ROUTINES } from '../config/flexRoutines'
import { buildSessionSteps } from './flexSteps'
import { CORE_ENTRY_GET_READY_SEC, POST_PHOTO_GET_READY_SEC, settleInSec } from './settleIn'

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
