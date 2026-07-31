import { describe, it, expect } from 'vitest'
import { canResumeRest, restBeforeNextSet, RESUMABLE_REST_GRACE_SEC, TRANSITION_REST_CAP_SEC } from './rest'

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

describe('canResumeRest', () => {
  const now = 1_700_000_000_000
  const sec = (n: number) => n * 1000

  it('resumes a rest that is still counting down', () => {
    expect(canResumeRest(now + sec(45), now)).toBe(true)
  })

  it('resumes a rest that just went into overtime', () => {
    expect(canResumeRest(now - sec(20), now)).toBe(true)
  })

  it('resumes right up to the end of the grace period', () => {
    expect(canResumeRest(now - sec(RESUMABLE_REST_GRACE_SEC), now)).toBe(true)
  })

  it('drops a rest that elapsed beyond the grace period', () => {
    expect(canResumeRest(now - sec(RESUMABLE_REST_GRACE_SEC + 1), now)).toBe(false)
  })

  it('drops a rest left over from a much earlier session', () => {
    expect(canResumeRest(now - sec(8 * 60 * 60), now)).toBe(false)
  })
})
