import { describe, it, expect } from 'vitest'
import {
  bankRest,
  canResumeRest,
  emptyRestTally,
  openRest,
  restBeforeNextSet,
  resumeRestTally,
  upNextTargetLabel,
  CIRCUIT_STATION_REST_SEC,
  RESUMABLE_REST_GRACE_SEC,
  TRANSITION_REST_CAP_SEC,
} from './rest'

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

  it('uses the brief station rest when a circuit station prescribes none of its own', () => {
    expect(
      restBeforeNextSet({
        currentRestSec: 60,
        sameExercise: false,
        nextRestSec: 60,
        sameCircuit: true,
      }),
    ).toBe(CIRCUIT_STATION_REST_SEC)
  })

  it("uses the station's own rest when it prescribes one", () => {
    // Rest only after the lateral raise: it asks for 60s, longer than the default
    // station change would give.
    expect(
      restBeforeNextSet({
        currentRestSec: 60,
        sameExercise: false,
        nextRestSec: 60,
        sameCircuit: true,
        circuitRestSec: 60,
      }),
    ).toBe(60)
  })

  it('rolls straight on from a station that prescribes no rest', () => {
    expect(
      restBeforeNextSet({
        currentRestSec: 60,
        sameExercise: false,
        nextRestSec: 60,
        sameCircuit: true,
        circuitRestSec: 0,
      }),
    ).toBe(0)
  })

  it("honours the station's rest at a round boundary too", () => {
    // The last station wrapping into the next round would otherwise take the next
    // exercise's capped rest — which is exactly what "no rest after this move"
    // has to be able to overrule.
    expect(
      restBeforeNextSet({
        currentRestSec: 60,
        sameExercise: false,
        nextRestSec: 60,
        sameCircuit: true,
        newCircuitRound: true,
        circuitRestSec: 0,
      }),
    ).toBe(0)
  })

  it('leaves the round boundary on the next exercise rest when no station rest is set', () => {
    expect(
      restBeforeNextSet({
        currentRestSec: 60,
        sameExercise: false,
        nextRestSec: 45,
        sameCircuit: true,
        newCircuitRound: true,
      }),
    ).toBe(45)
  })

  it('ignores a station rest when the next set is outside the circuit', () => {
    // Leaving the circuit for an ordinary exercise is a transition, sized to what
    // is coming up rather than to the station being left behind.
    expect(
      restBeforeNextSet({
        currentRestSec: 60,
        sameExercise: false,
        nextRestSec: 90,
        sameCircuit: false,
        circuitRestSec: 0,
      }),
    ).toBe(90)
  })

  it('still gives a full inter-set rest to back-to-back sets of one station', () => {
    // A station left with sets after the others have finished runs them
    // consecutively — nothing recovers in between, so its own rest applies.
    expect(
      restBeforeNextSet({
        currentRestSec: 60,
        sameExercise: true,
        nextRestSec: 60,
        sameCircuit: true,
        circuitRestSec: 0,
      }),
    ).toBe(60)
  })
})

describe('upNextTargetLabel', () => {
  it('shows the numbers on the rest leading into an exercise first set', () => {
    expect(upNextTargetLabel(0, '135 × 8')).toBe('135 × 8')
  })

  it('shows a reps-only target the same way', () => {
    expect(upNextTargetLabel(0, '12 reps')).toBe('12 reps')
  })

  it('stays quiet between sets of an exercise already under way', () => {
    expect(upNextTargetLabel(1, '65 × 12')).toBeNull()
    expect(upNextTargetLabel(3, '65 × 12')).toBeNull()
  })

  it('shows nothing when the coming set has no target', () => {
    expect(upNextTargetLabel(0, null)).toBeNull()
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

describe('rest tally', () => {
  const t0 = 1_700_000_000_000

  it('counts an interval as it opens and its seconds as it closes', () => {
    let tally = emptyRestTally('s1')
    tally = openRest(tally, 90)
    expect(tally).toEqual({ sessionId: 's1', takenSec: 0, prescribedSec: 90, count: 1 })
    tally = bankRest(tally, t0, t0 + 95_000)
    expect(tally.takenSec).toBe(95)
    expect(tally.count).toBe(1)
  })

  it('banks nothing when no rest is on the clock', () => {
    const tally = openRest(emptyRestTally('s1'), 60)
    expect(bankRest(tally, 0, t0)).toEqual(tally)
  })

  it('accumulates across intervals', () => {
    let tally = emptyRestTally('s1')
    tally = bankRest(openRest(tally, 120), t0, t0 + 120_000)
    tally = bankRest(openRest(tally, 60), t0 + 200_000, t0 + 275_000)
    expect(tally).toEqual({ sessionId: 's1', takenSec: 195, prescribedSec: 180, count: 2 })
  })

  it('resumes the tally saved by the same session', () => {
    // Why this is persisted at all: a session's total length comes from its stored
    // startedAt, so rest banked before a reload has to survive alongside it or an
    // hour of gym time reads as an hour of working out with three minutes of rest.
    const saved = { sessionId: 's1', takenSec: 1800, prescribedSec: 2000, count: 20 }
    expect(resumeRestTally(saved, 's1')).toEqual(saved)
  })

  it('ignores a tally left behind by another session', () => {
    const saved = { sessionId: 's1', takenSec: 1800, prescribedSec: 2000, count: 20 }
    expect(resumeRestTally(saved, 's2')).toEqual(emptyRestTally('s2'))
    expect(resumeRestTally(null, 's2')).toEqual(emptyRestTally('s2'))
  })
})
