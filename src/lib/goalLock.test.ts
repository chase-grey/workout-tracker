import { describe, it, expect } from 'vitest'
import { project } from './predictions'
import {
  addDays,
  adoptModel,
  clampToRange,
  commitRange,
  dateWithinHorizon,
  expectedAt,
  lockProjection,
  lockProjectionByDate,
  paceAgainstLock,
  projectedSeries,
  relaxToCap,
  soonestReachable,
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

/**
 * An uncapped projection, for the commit-window tests that are about the window's
 * own arithmetic rather than about a pace ceiling. Nothing bounds the pace, so
 * every date the window used to offer is still reachable (see soonestReachable).
 */
const UNCAPPED = project(CLIMBING, 140, TODAY)

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

describe('dateWithinHorizon', () => {
  it('takes a date six months out and refuses one past it', () => {
    expect(dateWithinHorizon('2026-07-01', TODAY)).toBe(true)
    expect(dateWithinHorizon('2026-07-02', TODAY)).toBe(false)
    expect(dateWithinHorizon('2028-01-14', TODAY)).toBe(false)
  })

  it('agrees with the projection-level test it backs', () => {
    const proj = project(CLIMBING, 140, TODAY)
    expect(dateWithinHorizon(proj.etaDate!, TODAY)).toBe(withinHorizon(proj, TODAY))
  })
})

describe('clampToRange', () => {
  it('holds a date inside the commit window', () => {
    const range = commitRange(UNCAPPED, '2026-04-11', TODAY)
    expect(clampToRange('2026-03-01', range)).toBe('2026-03-01')
    // A commitment made from further out than the window now reaches — the shape
    // the old one-tap re-lock left behind — comes back to the window's own edge
    // rather than being offered again as it stands.
    expect(clampToRange('2028-01-14', range)).toBe(range.latest)
    expect(clampToRange('2026-01-02', range)).toBe(range.soonest)
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

  it('carries the taper it was dated through, and only when it tapers', () => {
    // A tapering goal's line needs to know how far the pace was let fall; a
    // straight one isn't shaped by it, so it stores nothing rather than an inert
    // number (see floorFor).
    const tapered = lockProjection(
      'split',
      project(CLIMBING, 140, TODAY, { decayPerWeek: 0.9, taperSpentWeeks: 40 }),
      TODAY,
    )!
    expect(tapered.paceFloorFraction).toBe(1)

    const straight = lockProjection('squat', project(CLIMBING, 140, TODAY), TODAY)!
    expect(straight.paceFloorFraction).toBeUndefined()
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
    const { soonest, latest } = commitRange(UNCAPPED, '2026-04-11', TODAY)
    expect(soonest).toBe('2026-01-08')
    expect(latest).toBe('2026-07-20')
  })

  it('leaves room to give even when the projected date is close', () => {
    // Twice a fortnight is still inside the earliest date allowed, so the window
    // opens on the slack instead — a near goal can always be pushed back.
    const { soonest, latest } = commitRange(UNCAPPED, '2026-01-15', TODAY)
    expect(soonest).toBe('2026-01-08')
    expect(latest > soonest).toBe(true)
    expect(latest).toBe('2026-02-14')
  })
})

describe('soonestReachable', () => {
  it('closes the gap at the pace ceiling, not at the fit', () => {
    // 20 lbs left at a 1 lb/wk ceiling is 20 weeks, whatever the fit says — and
    // the fit here is 20 lbs a month, well over it.
    const proj = project(CLIMBING, 140, TODAY, { capPerWeek: 1 })
    expect(soonestReachable(proj, TODAY)).toBe('2026-05-21')
  })

  it('has nothing to say about a goal with no ceiling', () => {
    expect(soonestReachable(project(CLIMBING, 140, TODAY), TODAY)).toBeNull()
  })

  it('is the projected date itself once the fit is at the ceiling', () => {
    // A capped projection is already projected off the ceiling, so the soonest a
    // commitment may be set for is exactly the date it was offered.
    const proj = project(CLIMBING, 140, TODAY, { capPerWeek: 1 })
    expect(soonestReachable(proj, TODAY)).toBe(proj.etaDate)
  })
})

describe('commitRange with a pace ceiling', () => {
  it('refuses to open sooner than the ceiling can reach', () => {
    const proj = project(CLIMBING, 140, TODAY, { capPerWeek: 1 })
    const { soonest } = commitRange(proj, proj.etaDate!, TODAY)
    // Not the bare week out an uncapped goal offers: 20 weeks of ceiling.
    expect(soonest).toBe('2026-05-21')
    expect(soonest > '2026-01-08').toBe(true)
  })

  it('still opens a week out when the fit is under the ceiling', () => {
    // Committing to better than the pace you are holding is the whole point of
    // picking the date; the ceiling only bars what physiology bars.
    const slow = [
      { date: '2025-11-01', value: 130 },
      { date: '2025-12-01', value: 132 },
      { date: '2026-01-01', value: 134 },
    ]
    const proj = project(slow, 136, TODAY, { capPerWeek: 5 })
    expect(commitRange(proj, proj.etaDate!, TODAY).soonest).toBe('2026-01-08')
  })

  it('leaves a lock made through the window unable to contradict itself', () => {
    // The reported bug: ahead of the line and late for the date at once. With the
    // window holding the commitment to the ceiling, every reading ahead of the
    // line revises to a date on or before the one committed to.
    const proj = project(CLIMBING, 140, TODAY, { capPerWeek: 1 })
    const range = commitRange(proj, proj.etaDate!, TODAY)
    const lock = lockProjectionByDate('squat', proj, range.soonest, TODAY)!
    const read = '2026-03-12' // ten weeks in
    const expected = expectedAt(lock, read)
    const pace = paceAgainstLock(lock, expected + 3, read, 1, new Date(2026, 2, 12))
    expect(pace.status).toBe('ahead')
    expect(pace.revisedEta! <= lock.etaDate).toBe(true)
  })
})

describe('relaxToCap', () => {
  it('pushes a date the ceiling cannot reach out to the one it can', () => {
    // CLIMB asks 100 lbs in 100 days — 7 lbs/wk. At a 1 lb/wk ceiling that same
    // climb from the same origin takes 100 weeks.
    const relaxed = relaxToCap(CLIMB, 1)
    expect(relaxed.etaDate).toBe('2027-12-02')
    expect(relaxed.slopePerWeek).toBe(1)
    expect(relaxed.startValue).toBe(CLIMB.startValue)
    expect(relaxed.lockedAt).toBe(CLIMB.lockedAt)
  })

  it('keeps its sign on a falling goal', () => {
    const relaxed = relaxToCap(FALL, 0.5)
    expect(relaxed.slopePerWeek).toBe(-0.5)
    expect(relaxed.etaDate > FALL.etaDate).toBe(true)
  })

  it('leaves a commitment gentler than the ceiling alone', () => {
    expect(relaxToCap(CLIMB, 20)).toBe(CLIMB)
  })

  it('leaves a goal with no ceiling alone', () => {
    expect(relaxToCap(CLIMB, null)).toBe(CLIMB)
    expect(relaxToCap(CLIMB, undefined)).toBe(CLIMB)
  })

  it('is idempotent, so the effect that applies it can run every rebuild', () => {
    const once = relaxToCap(CLIMB, 1)
    expect(relaxToCap(once, 1)).toBe(once)
  })

  it('never pulls a date sooner, however far past the ceiling the pace is', () => {
    const relaxed = relaxToCap({ ...CLIMB, etaDate: '2030-01-01' }, 1)
    expect(relaxed.etaDate).toBe('2030-01-01')
  })

  it('leaves the relaxed commitment unable to contradict itself', () => {
    // The whole point: after relaxing, ahead of the line implies on or before the
    // date, at the ceiling pace.
    const relaxed = relaxToCap(CLIMB, 1)
    const read = '2026-07-01'
    const pace = paceAgainstLock(relaxed, expectedAt(relaxed, read) + 5, read, 1, new Date(2026, 6, 1))
    expect(pace.status).toBe('ahead')
    expect(pace.revisedEta! <= relaxed.etaDate).toBe(true)
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

describe('adoptModel', () => {
  it('bends a pre-decay lock without moving its start, target or eta', () => {
    const bent = adoptModel(CLIMB, 0.95)
    expect(bent.decayPerWeek).toBe(0.95)
    expect(bent.startValue).toBe(CLIMB.startValue)
    expect(bent.target).toBe(CLIMB.target)
    expect(bent.etaDate).toBe(CLIMB.etaDate)
    // The commitment is untouched; only the line between its ends has moved.
    expect(expectedAt(bent, '2026-02-20')).not.toBe(expectedAt(CLIMB, '2026-02-20'))
  })

  it('re-bends a lock frozen at an older decay to the goal\'s current one', () => {
    const already: LockedProjection = { ...CLIMB, decayPerWeek: 0.99 }
    const bent = adoptModel(already, 0.95)
    expect(bent.decayPerWeek).toBe(0.95)
    expect(bent.startValue).toBe(already.startValue)
    expect(bent.target).toBe(already.target)
    expect(bent.etaDate).toBe(already.etaDate)
  })

  it('leaves a lock alone when it already matches the goal', () => {
    const already: LockedProjection = { ...CLIMB, decayPerWeek: 0.95 }
    expect(adoptModel(already, 0.95)).toBe(already)
    // Straight goal, straight lock: nothing to adopt.
    expect(adoptModel(CLIMB, undefined)).toBe(CLIMB)
  })

  it('straightens a lock whose goal has since given up its taper', () => {
    // What a locked flexibility rung looks like: frozen while the ladders still
    // tapered, and now on a goal that projects straight at a capped pace (see
    // goals.SPLIT_GAIN_CAP). The stored decay has to go, floor and all, or the
    // line keeps front-loading a climb the ETA beside it no longer promises.
    const bent: LockedProjection = { ...CLIMB, decayPerWeek: 0.9, paceFloorFraction: 0.34 }
    const straightened = adoptModel(bent, undefined)

    expect(straightened.decayPerWeek).toBeUndefined()
    expect(straightened.paceFloorFraction).toBeUndefined()
    expect(straightened.etaDate).toBe(bent.etaDate)
    expect(straightened.target).toBe(bent.target)
    // Straight means exactly half the climb at half the span.
    const midway = addDays('2026-01-01', 50)
    expect(expectedAt(straightened, midway)).toBeCloseTo((CLIMB.startValue + CLIMB.target) / 2, 1)
    expect(expectedAt(bent, midway)).toBeGreaterThan(expectedAt(straightened, midway))
  })

  it('straightens a lock whose goal has since spent its taper on training age', () => {
    // A lock frozen when the taper still ran full bends down to a fifth of its
    // pace. Once the goal reads that taper as already spent, the same commitment
    // has to be drawn straight — otherwise the line asks for a front-loaded climb
    // the date it's drawn to was never computed from.
    const tapered: LockedProjection = { ...CLIMB, etaDate: addDays('2026-01-01', 500), decayPerWeek: 0.9 }
    const straightened = adoptModel(tapered, 0.9, 1)
    expect(straightened.paceFloorFraction).toBe(1)
    expect(straightened.etaDate).toBe(tapered.etaDate)
    const midway = addDays('2026-01-01', 250)
    expect(expectedAt(straightened, midway)).toBeLessThan(expectedAt(tapered, midway))
    // Straight means exactly half the climb at half the span.
    expect(expectedAt(straightened, midway)).toBeCloseTo(
      (CLIMB.startValue + CLIMB.target) / 2,
      1,
    )
  })
})
