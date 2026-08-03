import { describe, it, expect } from 'vitest'
import { project } from './predictions'
import {
  expectedAt,
  lockProjection,
  maybeLock,
  paceAgainstLock,
  projectedSeries,
  withinHorizon,
  type LockedProjection,
} from './goalLock'

const TODAY = new Date(2026, 0, 1)

/** A lock that climbs 100 → 200 over exactly 100 days. */
const CLIMB: LockedProjection = {
  goalId: 'squat',
  lockedAt: '2026-01-01',
  startValue: 100,
  target: 200,
  etaDate: '2026-04-11', // 100 days later
  slopePerWeek: 7,
}

/** A lock that falls 20 → 10 over 100 days (body fat). */
const FALL: LockedProjection = {
  goalId: 'bf',
  lockedAt: '2026-01-01',
  startValue: 20,
  target: 10,
  etaDate: '2026-04-11',
  slopePerWeek: -0.7,
}

describe('withinHorizon', () => {
  it('is true for an eta inside six months', () => {
    const proj = project(
      [
        { date: '2025-12-01', value: 100 },
        { date: '2026-01-01', value: 120 },
      ],
      140,
      TODAY,
    )
    expect(withinHorizon(proj, TODAY)).toBe(true)
  })

  it('is false for an eta years out', () => {
    const proj = project(
      [
        { date: '2025-12-01', value: 100 },
        { date: '2026-01-01', value: 101 },
      ],
      500,
      TODAY,
    )
    expect(withinHorizon(proj, TODAY)).toBe(false)
  })

  it('is false when nothing is trending toward the target', () => {
    const proj = project([{ date: '2026-01-01', value: 100 }], 200)
    expect(withinHorizon(proj, TODAY)).toBe(false)
  })
})

describe('lockProjection', () => {
  it('snapshots the current value, target and eta', () => {
    const proj = project(
      [
        { date: '2025-12-01', value: 100 },
        { date: '2026-01-01', value: 120 },
      ],
      140,
      TODAY,
    )
    const lock = lockProjection('squat', proj, TODAY)
    expect(lock).toMatchObject({ goalId: 'squat', lockedAt: '2026-01-01', startValue: 120, target: 140 })
    expect(lock?.etaDate).toBe(proj.etaDate)
  })

  it('refuses to lock a projection going nowhere', () => {
    expect(lockProjection('squat', project([], 200), TODAY)).toBeNull()
  })
})

describe('maybeLock', () => {
  it('keeps an existing lock even once the eta drifts back out', () => {
    const drifted = project(
      [
        { date: '2025-12-01', value: 100 },
        { date: '2026-01-01', value: 101 },
      ],
      500,
      TODAY,
    )
    expect(maybeLock(CLIMB, 'squat', drifted, TODAY)).toBe(CLIMB)
  })

  it('leaves a far-off goal unlocked', () => {
    const far = project(
      [
        { date: '2025-12-01', value: 100 },
        { date: '2026-01-01', value: 101 },
      ],
      500,
      TODAY,
    )
    expect(maybeLock(undefined, 'squat', far, TODAY)).toBeUndefined()
  })
})

describe('expectedAt', () => {
  it('reads the start value on the lock date and the target at the eta', () => {
    expect(expectedAt(CLIMB, '2026-01-01')).toBe(100)
    expect(expectedAt(CLIMB, '2026-04-11')).toBe(200)
  })

  it('interpolates linearly in between', () => {
    // 50 of 100 days elapsed → halfway from 100 to 200.
    expect(expectedAt(CLIMB, '2026-02-20')).toBe(150)
  })

  it('clamps outside the locked window', () => {
    expect(expectedAt(CLIMB, '2025-06-01')).toBe(100)
    expect(expectedAt(CLIMB, '2027-01-01')).toBe(200)
  })
})

describe('projectedSeries', () => {
  it('starts at the lock and ends exactly on target at the eta', () => {
    const s = projectedSeries(CLIMB)
    expect(s[0]).toEqual({ date: '2026-01-01', value: 100 })
    expect(s[s.length - 1]).toEqual({ date: '2026-04-11', value: 200 })
  })

  it('rises monotonically', () => {
    const s = projectedSeries(CLIMB)
    for (let i = 1; i < s.length; i++) expect(s[i].value).toBeGreaterThanOrEqual(s[i - 1].value)
  })
})

describe('paceAgainstLock', () => {
  const halfway = new Date(2026, 1, 20) // 50 days in; the line expects 150

  it('calls beating the line ahead', () => {
    const pace = paceAgainstLock(CLIMB, 160, halfway)
    expect(pace.status).toBe('ahead')
    expect(pace.aheadBy).toBe(10)
  })

  it('calls trailing the line behind', () => {
    const pace = paceAgainstLock(CLIMB, 140, halfway)
    expect(pace.status).toBe('behind')
    expect(pace.aheadBy).toBe(-10)
  })

  it('treats sitting on the line as on', () => {
    expect(paceAgainstLock(CLIMB, 150, halfway).status).toBe('on')
  })

  it('counts falling faster as ahead for a downward goal', () => {
    // The line expects 15% body fat halfway; 14% is better, so ahead.
    const pace = paceAgainstLock(FALL, 14, halfway)
    expect(pace.status).toBe('ahead')
    expect(pace.aheadBy).toBe(1)
  })

  it('revises the eta earlier when running ahead', () => {
    const pace = paceAgainstLock(CLIMB, 160, halfway)
    expect(pace.revisedEta).not.toBeNull()
    expect(pace.revisedEta! < CLIMB.etaDate).toBe(true)
  })

  it('revises the eta later when running behind', () => {
    const pace = paceAgainstLock(CLIMB, 140, halfway)
    expect(pace.revisedEta! > CLIMB.etaDate).toBe(true)
  })

  it('has no revised eta when moving away from the target', () => {
    expect(paceAgainstLock(CLIMB, 90, halfway).revisedEta).toBeNull()
  })
})

describe('degenerate locks', () => {
  it('will not lock a goal already sitting on its target', () => {
    // etaWeeks 0 would freeze a zero-length line, and every later reading would
    // then report as "behind" forever with no way to clear it.
    const atTarget = project(
      [
        { date: '2025-12-01', value: 178 },
        { date: '2026-01-01', value: 180 },
      ],
      180,
      TODAY,
    )
    expect(atTarget.etaWeeks).toBe(0)
    expect(withinHorizon(atTarget, TODAY)).toBe(false)
    expect(lockProjection('bw', atTarget, TODAY)).toBeNull()
    expect(maybeLock(undefined, 'bw', atTarget, TODAY)).toBeUndefined()
  })

  it('caps an absurd revised eta rather than reporting a date decades out', () => {
    // Effectively stalled: 0.1 gained in 100 days with 100 still to go.
    const stalled = new Date(2026, 3, 11)
    expect(paceAgainstLock(CLIMB, 100.1, stalled).revisedEta).toBeNull()
  })
})
