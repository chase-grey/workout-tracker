import { describe, it, expect } from 'vitest'
import { project } from './predictions'
import {
  addDays,
  adoptDecay,
  commitRange,
  expectedAt,
  lockProjection,
  lockProjectionByDate,
  paceAgainstLock,
  projectedSeries,
  withinHorizon,
  type LockedProjection,
} from './goalLock'

const TODAY = new Date(2026, 0, 1)

/**
 * A lock that climbs 100 → 200 over exactly 100 days. No goal decay of its own,
 * so it's the pace its ETA was projected from carried straight through: 150 at
 * the halfway mark. Most of the assertions below hang off that number.
 */
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

describe('lockProjectionByDate', () => {
  it('freezes the current value and target but commits to the chosen date', () => {
    const proj = project(CLIMBING, 140, TODAY)
    const lock = lockProjectionByDate('squat', proj, '2026-07-01', TODAY)
    expect(lock).toMatchObject({ goalId: 'squat', lockedAt: '2026-01-01', startValue: 120, target: 140 })
    expect(lock?.etaDate).toBe('2026-07-01')
  })

  it('re-derives the slope to span start → target over the chosen date', () => {
    // 20 to gain over ~26 weeks is well under a pound a week, whatever pace the
    // projection was actually read at.
    const proj = project(CLIMBING, 140, TODAY)
    const lock = lockProjectionByDate('squat', proj, '2026-07-01', TODAY)!
    expect(lock.slopePerWeek).toBeGreaterThan(0)
    expect(lock.slopePerWeek).toBeLessThan(proj.slopePerWeek)
    expect(expectedAt(lock, '2026-07-01')).toBe(140)
  })

  it('refuses a date that isn\'t in the future', () => {
    const proj = project(CLIMBING, 140, TODAY)
    expect(lockProjectionByDate('squat', proj, '2026-01-01', TODAY)).toBeNull()
    expect(lockProjectionByDate('squat', proj, '2025-12-01', TODAY)).toBeNull()
  })

  it('refuses when there is nothing to project from', () => {
    expect(lockProjectionByDate('squat', project([], 200), '2026-07-01', TODAY)).toBeNull()
  })
})

describe('commitRange', () => {
  it('opens a week out and reaches twice the projected span', () => {
    // 100 days projected → 200 days of room to push it out.
    const { soonest, latest } = commitRange('2026-04-11', TODAY)
    expect(soonest).toBe('2026-01-08')
    expect(latest).toBe('2026-07-20')
  })

  it('leaves room to give even when the projected date is close', () => {
    // Twice a fortnight is still inside the earliest date allowed, so the window
    // opens on the slack instead — a near goal can always be pushed back.
    const { soonest, latest } = commitRange('2026-01-15', TODAY)
    expect(soonest).toBe('2026-01-08')
    expect(latest > soonest).toBe(true)
    expect(latest).toBe('2026-02-14')
  })
})

describe('expectedAt', () => {
  it('reads the start value on the lock date and the target at the eta', () => {
    expect(expectedAt(CLIMB, '2026-01-01')).toBe(100)
    expect(expectedAt(CLIMB, '2026-04-11')).toBe(200)
  })

  it('spreads the distance evenly in between', () => {
    // 50 of 100 days elapsed, and nothing about the projection said the early
    // weeks owe more than the late ones — half the climb.
    expect(expectedAt(CLIMB, '2026-02-20')).toBe(150)
  })

  it('reads a falling goal the same way', () => {
    // Down 5 of the 10 by halfway, mirroring the climb.
    expect(expectedAt(FALL, '2026-02-20')).toBe(15)
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
    // The line expects 15% body fat halfway; 13% is better, so ahead.
    const pace = paceAgainstLock(FALL, 13, HALFWAY_ISO, undefined, halfway)
    expect(pace.status).toBe('ahead')
    expect(pace.aheadBy).toBe(2)
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
    const pace = paceAgainstLock(CLIMB, 170, HALFWAY_ISO, undefined, halfway)
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
    // A goal already on target can't be committed to a future line either.
    expect(lockProjectionByDate('bw', atTarget, '2026-07-01', TODAY)).toBeNull()
  })

  it('caps an absurd revised eta rather than reporting a date decades out', () => {
    // Effectively stalled: 0.1 gained in 100 days with 100 still to go.
    const stalled = new Date(2026, 3, 11)
    expect(paceAgainstLock(CLIMB, 100.1, '2026-04-11', undefined, stalled).revisedEta).toBeNull()
  })
})

describe('two targets on one metric', () => {
  // Both bodyweight goals committed the same day off the same weigh-in and the
  // same default projection: 172 lbs climbing a pound a week, so 8 weeks to 180
  // and 18 to 190. 180 is a waypoint on the road to 190, and the two lines have
  // to say so — a plan that reaches 180 sooner on the way to 190 than the 180
  // goal itself asks for is asking for two different bulks at once.
  const NEAR: LockedProjection = {
    goalId: 'bodyweight_180',
    lockedAt: '2026-01-01',
    startValue: 172,
    target: 180,
    etaDate: addDays('2026-01-01', 56),
    slopePerWeek: 1,
  }
  const FAR: LockedProjection = {
    ...NEAR,
    goalId: 'bodyweight_190',
    target: 190,
    etaDate: addDays('2026-01-01', 126),
  }

  it('has the further line cross the nearer target on the nearer date', () => {
    expect(expectedAt(FAR, NEAR.etaDate)).toBe(180)
  })

  it('draws one line for both up to the nearer target', () => {
    for (const day of [7, 21, 35, 49, 56]) {
      const iso = addDays(NEAR.lockedAt, day)
      expect(expectedAt(FAR, iso)).toBe(expectedAt(NEAR, iso))
    }
  })

  it('lands each one exactly on its own target', () => {
    expect(expectedAt(NEAR, NEAR.etaDate)).toBe(180)
    expect(expectedAt(FAR, FAR.etaDate)).toBe(190)
  })
})

describe('decayed locks', () => {
  /** Same 100 → 200 over 100 days, but with the gain rate easing 5%/week. */
  const DECAYED: LockedProjection = { ...CLIMB, decayPerWeek: 0.95 }
  /** …and one that barely eases at all, so its line runs close to straight. */
  const GENTLE: LockedProjection = { ...CLIMB, decayPerWeek: 0.99 }

  it('draws the steeper decay further along early, both landing on the eta', () => {
    // Start and end pinned to the same points...
    expect(expectedAt(DECAYED, '2026-01-01')).toBe(100)
    expect(expectedAt(DECAYED, '2026-04-11')).toBe(200)
    // ...but a faster-decaying pace has more of the climb behind it by halfway.
    expect(expectedAt(DECAYED, '2026-02-20')).toBeGreaterThan(expectedAt(GENTLE, '2026-02-20'))
  })

  it('bends only the goals whose own projection bends', () => {
    // A goal projected with a taper is judged with it — more of the climb behind
    // it by halfway than the straight commitment expects, because that's the pace
    // its ETA was read at.
    expect(expectedAt(DECAYED, '2026-02-20')).toBeGreaterThan(expectedAt(CLIMB, '2026-02-20'))
  })

  it('holds a reading to whichever line it is actually committed to', () => {
    // 160 is well clear of the gentle line but only a hair over the steeper one,
    // so the same reading is worth far less against the decayed commitment.
    const gentle = paceAgainstLock(GENTLE, 160, '2026-02-20', undefined, new Date(2026, 1, 20))
    const decayed = paceAgainstLock(DECAYED, 160, '2026-02-20', undefined, new Date(2026, 1, 20))
    expect(gentle.status).toBe('ahead')
    expect(decayed.aheadBy).toBeLessThan(gentle.aheadBy)
  })

  it('keeps a long commitment climbing through its back half', () => {
    // A two-year line drawn off a taper that decays to nothing puts four fifths
    // of the climb in its first four months and then asks for almost nothing for
    // the next twenty. With the pace floored (see predictions.PACE_FLOOR) the
    // early months still carry more than their share, but the rest is a real
    // grind rather than a flat line.
    const LONG: LockedProjection = {
      ...CLIMB,
      etaDate: addDays('2026-01-01', 730),
      decayPerWeek: 0.9,
    }
    const atFourMonths = expectedAt(LONG, addDays('2026-01-01', 120))
    expect(atFourMonths).toBeGreaterThan(130) // ahead of a straight line's 116…
    expect(atFourMonths).toBeLessThan(150) // …but nowhere near the old 180
    // Every later stretch still has ground to make up.
    expect(expectedAt(LONG, addDays('2026-01-01', 500))).toBeGreaterThan(atFourMonths + 20)
    expect(expectedAt(LONG, LONG.etaDate)).toBe(200)
  })
})

describe('adoptDecay', () => {
  it('bends a pre-decay lock without moving its start, target or eta', () => {
    const bent = adoptDecay(CLIMB, 0.95)
    expect(bent.decayPerWeek).toBe(0.95)
    expect(bent.startValue).toBe(CLIMB.startValue)
    expect(bent.target).toBe(CLIMB.target)
    expect(bent.etaDate).toBe(CLIMB.etaDate)
    // The commitment is untouched; only the line between its ends has moved.
    expect(expectedAt(bent, '2026-02-20')).not.toBe(expectedAt(CLIMB, '2026-02-20'))
  })

  it('re-bends a lock frozen at an older decay to the goal\'s current one', () => {
    const already: LockedProjection = { ...CLIMB, decayPerWeek: 0.99 }
    const bent = adoptDecay(already, 0.95)
    expect(bent.decayPerWeek).toBe(0.95)
    expect(bent.startValue).toBe(already.startValue)
    expect(bent.target).toBe(already.target)
    expect(bent.etaDate).toBe(already.etaDate)
  })

  it('leaves a lock alone when it already matches, or the goal projects straight', () => {
    const already: LockedProjection = { ...CLIMB, decayPerWeek: 0.95 }
    expect(adoptDecay(already, 0.95)).toBe(already)
    expect(adoptDecay(CLIMB, undefined)).toBe(CLIMB)
  })
})
