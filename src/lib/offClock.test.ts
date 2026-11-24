import { describe, expect, it } from 'vitest'
import { expectedProgress } from './sessionPace'
import { bankRest, emptyRestTally } from './rest'
import { closeSet, endRest, restAfter, skipSpan, startSetClock } from './setClock'
import {
  ON_THE_CLOCK,
  offSecAt,
  resumeOffClock,
  runningOffSec,
  runningOffSecSince,
  sessionElapsedSec,
  stepOff,
  stepOn,
} from './offClock'

describe('off the clock', () => {
  it('banks each stretch when the session picks up again', () => {
    let clock = stepOff(ON_THE_CLOCK, 10_000)
    clock = stepOn(clock, 70_000)
    clock = stepOn(stepOff(clock, 200_000), 230_000)
    expect(clock).toEqual({ takenSec: 90, since: 0 })
  })

  it('counts a stretch still running', () => {
    const clock = stepOff({ takenSec: 30, since: 0 }, 100_000)
    expect(runningOffSec(clock, 145_000)).toBe(45)
    expect(offSecAt(clock, 145_000)).toBe(75)
  })

  it('keeps the start of a stretch already running, and picking up with none adds nothing', () => {
    const open = stepOff(stepOff(ON_THE_CLOCK, 5_000), 50_000)
    expect(open.since).toBe(5_000)
    expect(stepOn({ takenSec: 12, since: 0 }, 99_000)).toEqual({ takenSec: 12, since: 0 })
  })

  it('stands the session clock still through a pause or a photo screen', () => {
    // Two minutes in, then paused.
    const clock = stepOff(ON_THE_CLOCK, 120_000)
    expect(sessionElapsedSec(0, 120_000, clock)).toBe(120)
    expect(sessionElapsedSec(0, 300_000, clock)).toBe(120)
    // Three minutes away, then one more of the session.
    expect(sessionElapsedSec(0, 360_000, stepOn(clock, 300_000))).toBe(180)
  })

  it('leaves the mark on the progress bar where it was when the session stopped', () => {
    const flow = Array.from({ length: 4 }, () => ({ activeSec: 60, restSec: 30 }))
    const clock = stepOff(ON_THE_CLOCK, 70_000)
    const before = expectedProgress(flow, sessionElapsedSec(0, 70_000, clock))
    // Five minutes paused: on the wall clock the whole flow is over.
    expect(expectedProgress(flow, 370)).toBe(1)
    expect(expectedProgress(flow, sessionElapsedSec(0, 370_000, clock))).toBe(before)
    expect(before).toBe(0.25)
  })

  it('comes back from a reload still off the clock, from the same start', () => {
    const saved = { takenSec: 20, since: 40_000 }
    expect(resumeOffClock(saved, false, 100_000)).toEqual(saved)
    expect(resumeOffClock(saved, true, 100_000)).toEqual(saved)
    expect(resumeOffClock({ takenSec: 20, since: 0 }, false, 100_000)).toEqual({ takenSec: 20, since: 0 })
    expect(resumeOffClock(undefined, true, 100_000)).toEqual({ takenSec: 0, since: 100_000 })
    expect(resumeOffClock(null, false, 100_000)).toEqual(ON_THE_CLOCK)
    // A start in the future is a clock that was changed, not a pause.
    expect(resumeOffClock({ takenSec: 5, since: 200_000 }, false, 100_000)).toEqual({ takenSec: 5, since: 0 })
  })

  it('keeps the time off the set whose span it fell in', () => {
    let clock = startSetClock('s', 0)
    // The set took 40s, then 90s of photos before its span was closed.
    clock = skipSpan(clock, 90, 130_000)
    clock = closeSet(clock, 'fold:0', 130_000)
    expect(clock.spentSec).toEqual({ 'fold:0': 40 })
  })

  it('keeps a pause taken during a rest off that set, and out of the rest tally', () => {
    // Set done at 40s, rest opens; paused from 60s to 360s; rest tapped away at 400s.
    let sets = restAfter(startSetClock('s', 0), 'bench:0')
    const paused = stepOff(ON_THE_CLOCK, 60_000)
    const restStart = 40_000 + runningOffSecSince(paused, 40_000, 360_000) * 1000
    sets = skipSpan(sets, runningOffSec(paused, 360_000), 360_000)
    sets = endRest(sets, 400_000)
    expect(sets.spentSec).toEqual({ 'bench:0': 100 })
    expect(bankRest(emptyRestTally('s'), restStart, 400_000).takenSec).toBe(60)
  })

  it('counts only the part of a pause that falls inside the rest', () => {
    // Paused at 10s, a rest that began at 30s: twenty of the pause came before it.
    const paused = stepOff(ON_THE_CLOCK, 10_000)
    expect(runningOffSecSince(paused, 30_000, 90_000)).toBe(60)
    expect(runningOffSecSince(paused, 5_000, 90_000)).toBe(80)
    expect(runningOffSecSince(ON_THE_CLOCK, 5_000, 90_000)).toBe(0)
  })

  it('never skips more of a span than has run', () => {
    // The rest rolled on under the curtain and closed the set at 100s; the pause
    // ending at 130s has only the thirty seconds since to take out.
    let clock = closeSet(startSetClock('s', 0), 'a:0', 100_000)
    clock = skipSpan(clock, 120, 130_000)
    expect(clock.markAt).toBe(130_000)
  })
})
