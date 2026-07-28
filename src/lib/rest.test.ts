import { describe, it, expect } from 'vitest'
import { restBeforeNextSet, TRANSITION_REST_CAP_SEC } from './rest'

describe('restBeforeNextSet', () => {
  it('uses the exercise rest between sets of the same exercise', () => {
    expect(
      restBeforeNextSet({ currentRestSec: 180, sameExercise: true, nextRestSec: 60 }),
    ).toBe(180)
  })

  it('uses the next exercise rest when transitioning to a different exercise', () => {
    // Squat (180s inter-set) → hamstring curl (90s): only need the curl rest.
    expect(
      restBeforeNextSet({ currentRestSec: 180, sameExercise: false, nextRestSec: 90 }),
    ).toBe(90)
  })

  it('caps the transition rest at TRANSITION_REST_CAP_SEC', () => {
    // Next exercise also wants a long rest, but a transition is capped.
    expect(
      restBeforeNextSet({ currentRestSec: 180, sameExercise: false, nextRestSec: 150 }),
    ).toBe(TRANSITION_REST_CAP_SEC)
  })

  it('does not lengthen a short transition rest', () => {
    expect(
      restBeforeNextSet({ currentRestSec: 120, sameExercise: false, nextRestSec: 60 }),
    ).toBe(60)
  })

  it('returns 0 when there is no next set (workout finished)', () => {
    expect(
      restBeforeNextSet({ currentRestSec: 120, sameExercise: false, nextRestSec: null }),
    ).toBe(0)
  })
})
