import { describe, it, expect } from 'vitest'
import { project } from './predictions'
import {
  adoptDecay,
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

/** A climbing series with enough readings for `project` to fit a pace on. */
const CLIMBING = [
  { date: '2025-11-01', value: 80 },
  { date: '2025-12-01', value: 100 },
  { date: '2026-01-01', value: 120 },
]

/** Effectively stalled: 2 lbs over two months. */
const STALLED = [
  { date: '2025-11-01', value: 99 },
  { date: '2025-12-01', value: 100 },
  { date: '2026-01-01', value: 101 },
]

describe('withinHorizon', () => {
  it('is true for an eta inside six months', () => {
    const proj = project(CLIMBING, 140, TODAY)
    expect(withinHorizon(proj, TODAY)).toBe(true)
  })

  it('is false for an eta years out', () => {
    const proj = project(STALLED, 500, TODAY)
    expect(withinHorizon(proj, TODAY)).toBe(false)
  })

  it('is false when nothing is trending toward the target', () => {
    const proj = project([{ date: '2026-01-01', value: 100 }], 200)
    expect(withinHorizon(proj, TODAY)).toBe(false)
  })
})

describe('lockProjection', () => {
  it('snapshots the current value, target and eta', () => {
    const proj = project(CLIMBING, 140, TODAY)
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
    const drifted = project(STALLED, 500, TODAY)
    expect(maybeLock(CLIMB, 'squat', drifted, TODAY)).toBe(CLIMB)
  })

  it('leaves a far-off goal unlocked', () => {
    const far = project(STALLED, 500, TODAY)
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
  const HALFWAY_ISO = '2026-02-20' // 50 days in; the line expects 150
  const halfway = new Date(2026, 1, 20)

  it('calls beating the line ahead', () => {
    const pace = paceAgainstLock(CLIMB, 160, HALFWAY_ISO, undefined, halfway)
    expect(pace.status).toBe('ahead')
    expect(pace.aheadBy).toBe(10)
  })

  it('calls trailing the line behind', () => {
    const pace = paceAgainstLock(CLIMB, 140, HALFWAY_ISO, undefined, halfway)
    expect(pace.status).toBe('behind')
    expect(pace.aheadBy).toBe(-10)
  })

  it('treats sitting on the line as on', () => {
    expect(paceAgainstLock(CLIMB, 150, HALFWAY_ISO, undefined, halfway).status).toBe('on')
  })

  it('counts falling faster as ahead for a downward goal', () => {
    // The line expects 15% body fat halfway; 14% is better, so ahead.
    const pace = paceAgainstLock(FALL, 14, HALFWAY_ISO, undefined, halfway)
    expect(pace.status).toBe('ahead')
    expect(pace.aheadBy).toBe(1)
  })

  it('measures the reading against the line on the reading date, not against today', () => {
    // Right on the line at the halfway session, then three idle weeks pass. The
    // reading hasn't changed, so the standing must not — the calendar advancing
    // while the line kept climbing can't push a real result "behind".
    const onTheLine = paceAgainstLock(CLIMB, 150, HALFWAY_ISO, undefined, halfway)
    expect(onTheLine.status).toBe('on')
    const threeWeeksLater = new Date(2026, 2, 13)
    const stillOn = paceAgainstLock(CLIMB, 150, HALFWAY_ISO, undefined, threeWeeksLater)
    expect(stillOn.status).toBe('on')
    expect(stillOn.aheadBy).toBe(onTheLine.aheadBy)
  })

  it('revises the eta earlier when running ahead', () => {
    const pace = paceAgainstLock(CLIMB, 160, HALFWAY_ISO, undefined, halfway)
    expect(pace.revisedEta).not.toBeNull()
    expect(pace.revisedEta! < CLIMB.etaDate).toBe(true)
  })

  it('revises the eta later when running behind', () => {
    const pace = paceAgainstLock(CLIMB, 140, HALFWAY_ISO, undefined, halfway)
    expect(pace.revisedEta! > CLIMB.etaDate).toBe(true)
  })

  it('has no revised eta when moving away from the target', () => {
    expect(paceAgainstLock(CLIMB, 90, HALFWAY_ISO, undefined, halfway).revisedEta).toBeNull()
  })

  it('revises from the recent pace when one is given, not the average since the lock', () => {
    // 40 gained in 50 days averages 0.8/day, which lands past the locked eta —
    // but the recent pace is 14/wk (2/day), which lands well before it.
    expect(paceAgainstLock(CLIMB, 140, HALFWAY_ISO, undefined, halfway).revisedEta! > CLIMB.etaDate).toBe(true)
    const recent = paceAgainstLock(CLIMB, 140, HALFWAY_ISO, 14, halfway)
    expect(recent.revisedEta).toBe('2026-03-22') // 60 left at 2/day, no decay on CLIMB
    // The ahead/behind reading still measures against the locked line.
    expect(recent.status).toBe('behind')
  })

  it('reports no revised eta when the recent pace is flat', () => {
    expect(paceAgainstLock(CLIMB, 140, HALFWAY_ISO, 0, halfway).revisedEta).toBeNull()
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
    expect(paceAgainstLock(CLIMB, 100.1, '2026-04-11', undefined, stalled).revisedEta).toBeNull()
  })
})

describe('decayed locks', () => {
  /** Same 100 → 200 over 100 days, but with the gain rate easing 5%/week. */
  const DECAYED: LockedProjection = { ...CLIMB, decayPerWeek: 0.95 }

  it('draws a concave line: ahead of the straight line early, target at the eta', () => {
    // Start and end pinned to the same points as the straight line...
    expect(expectedAt(DECAYED, '2026-01-01')).toBe(100)
    expect(expectedAt(DECAYED, '2026-04-11')).toBe(200)
    // ...but partway through it has already climbed past the straight-line value,
    // because a decaying pace front-loads the gains.
    expect(expectedAt(DECAYED, '2026-02-20')).toBeGreaterThan(expectedAt(CLIMB, '2026-02-20'))
  })

  it('holds a reading that beats the straight line to the steeper decayed line', () => {
    // 160 is ahead of the straight line's 150 halfway, but the decayed line
    // expects more than that by now, so the same reading reads behind.
    const straight = paceAgainstLock(CLIMB, 160, '2026-02-20', undefined, new Date(2026, 1, 20))
    const decayed = paceAgainstLock(DECAYED, 160, '2026-02-20', undefined, new Date(2026, 1, 20))
    expect(straight.status).toBe('ahead')
    expect(decayed.aheadBy).toBeLessThan(straight.aheadBy)
  })
})

describe('adoptDecay', () => {
  it('bends a pre-decay lock without moving its start, target or eta', () => {
    const bent = adoptDecay(CLIMB, 0.95)
    expect(bent.decayPerWeek).toBe(0.95)
    expect(bent.startValue).toBe(CLIMB.startValue)
    expect(bent.target).toBe(CLIMB.target)
    expect(bent.etaDate).toBe(CLIMB.etaDate)
    expect(expectedAt(bent, '2026-02-20')).toBeGreaterThan(expectedAt(CLIMB, '2026-02-20'))
  })

  it('leaves a lock alone when it already has a decay, or the goal projects straight', () => {
    const already: LockedProjection = { ...CLIMB, decayPerWeek: 0.99 }
    expect(adoptDecay(already, 0.95)).toBe(already)
    expect(adoptDecay(CLIMB, undefined)).toBe(CLIMB)
  })
})
