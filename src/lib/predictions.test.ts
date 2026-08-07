import { describe, it, expect } from 'vitest'
import {
  isPaceCapped,
  paceFloorFraction,
  project,
  trendPoints,
  weeklyTarget,
  weeksToClose,
  PACE_FLOOR,
  TREND_WINDOW,
} from './predictions'

describe('project', () => {
  it('increasing bodyweight trending toward a higher target is on track', () => {
    const points = [
      { date: '2026-01-05', value: 165 },
      { date: '2026-01-12', value: 166.5 },
      { date: '2026-01-19', value: 168 },
      { date: '2026-01-26', value: 170 },
    ]
    const today = new Date(2026, 0, 26)
    const p = project(points, 180, today)

    expect(p.slopePerWeek).toBeGreaterThan(0)
    expect(p.current).toBe(170)
    expect(p.onTrack).toBe(true)
    expect(p.etaWeeks).not.toBeNull()
    expect(p.etaWeeks as number).toBeGreaterThan(0)
    expect(p.etaDate).not.toBeNull()
    // ETA date must be in the future relative to today.
    expect((p.etaDate as string) > '2026-01-26').toBe(true)
  })

  it('series moving away from a higher target is not on track', () => {
    const points = [
      { date: '2026-01-05', value: 175 },
      { date: '2026-01-12', value: 173 },
      { date: '2026-01-19', value: 171 },
      { date: '2026-01-26', value: 169 },
    ]
    const p = project(points, 180, new Date(2026, 0, 26))

    expect(p.slopePerWeek).toBeLessThan(0)
    expect(p.etaWeeks).toBeNull()
    expect(p.etaDate).toBeNull()
    expect(p.onTrack).toBe(false)
  })

  it('already at or above target reports etaWeeks 0 and onTrack true', () => {
    const points = [
      { date: '2026-01-05', value: 178 },
      { date: '2026-01-12', value: 180 },
    ]
    const today = new Date(2026, 0, 12)
    const p = project(points, 180, today)

    expect(p.etaWeeks).toBe(0)
    expect(p.onTrack).toBe(true)
    expect(p.etaDate).toBe('2026-01-12')
  })

  it('fewer than two points yields a null ETA', () => {
    const one = project([{ date: '2026-01-05', value: 165 }], 180, new Date(2026, 0, 5))
    expect(one.current).toBe(165)
    expect(one.slopePerWeek).toBe(0)
    expect(one.etaWeeks).toBeNull()
    expect(one.etaDate).toBeNull()
    expect(one.onTrack).toBe(false)

    const none = project([], 180, new Date(2026, 0, 5))
    expect(none.etaWeeks).toBeNull()
    expect(none.onTrack).toBe(false)
    expect(Number.isNaN(none.current)).toBe(true)
  })
})

describe('project fits the recent window, not all of history', () => {
  /**
   * A month of illness (175 → 165) followed by two weeks of putting it back on.
   * Over the whole series the slope is negative; over the last two weeks it's
   * clearly positive, which is what "when do I hit 180?" is actually asking.
   */
  const sickThenRegaining = [
    { date: '2026-01-01', value: 175 },
    { date: '2026-01-08', value: 172 },
    { date: '2026-01-15', value: 169 },
    { date: '2026-01-22', value: 166 },
    { date: '2026-01-31', value: 165 },
    { date: '2026-02-04', value: 166 },
    { date: '2026-02-07', value: 167 },
    { date: '2026-02-11', value: 168 },
    { date: '2026-02-14', value: 169 },
  ]

  it('projects a rebound as gaining even when the whole series trends down', () => {
    const p = project(sickThenRegaining, 180, new Date(2026, 1, 14))

    expect(p.slopePerWeek).toBeGreaterThan(0)
    expect(p.current).toBe(169)
    expect(p.onTrack).toBe(true)
    expect(p.etaDate! > '2026-02-14').toBe(true)
  })

  it('reads the pace off the last two weeks only', () => {
    const p = project(sickThenRegaining, 180, new Date(2026, 1, 14))

    // 2026-01-31 onward — the illness weigh-ins are out of the window.
    expect(p.basis.points).toBe(5)
    expect(p.basis.spanDays).toBe(14)
    expect(p.basis.thin).toBe(false)
  })

  it('ignores an old plateau that has since been broken', () => {
    // Six months stuck at 200, then 15 lbs added over the last fortnight.
    const stalledThenMoving = [
      { date: '2025-08-01', value: 200 },
      { date: '2025-10-01', value: 200 },
      { date: '2025-12-01', value: 200 },
      { date: '2026-02-01', value: 200 },
      { date: '2026-02-08', value: 208 },
      { date: '2026-02-15', value: 215 },
    ]
    const p = project(stalledThenMoving, 250, new Date(2026, 1, 15))

    expect(p.basis.points).toBe(3)
    expect(p.slopePerWeek).toBeGreaterThan(6)
    expect(p.onTrack).toBe(true)
  })
})

describe('project holds off until there is enough recent data', () => {
  it('will not read a trend from a few days of readings', () => {
    const p = project(
      [
        { date: '2026-02-12', value: 167 },
        { date: '2026-02-13', value: 169 },
        { date: '2026-02-14', value: 170 },
      ],
      180,
      new Date(2026, 1, 14),
    )

    // Three straight days of water weight would extrapolate to +4.7 lbs/week.
    expect(p.basis.thin).toBe(true)
    expect(p.slopePerWeek).toBe(0)
    expect(p.current).toBe(170)
    expect(p.etaDate).toBeNull()
    expect(p.onTrack).toBe(false)
  })

  it('still reports a goal already reached', () => {
    const p = project(
      [
        { date: '2026-02-13', value: 179 },
        { date: '2026-02-14', value: 180 },
      ],
      180,
      new Date(2026, 1, 14),
    )
    expect(p.basis.thin).toBe(true)
    expect(p.etaWeeks).toBe(0)
    expect(p.onTrack).toBe(true)
  })
})

describe('trendPoints', () => {
  it('keeps the readings within the window of the newest one', () => {
    const kept = trendPoints([
      { date: '2026-01-01', value: 1 },
      { date: '2026-01-25', value: 2 },
      { date: '2026-02-01', value: 3 },
      { date: '2026-02-08', value: 4 },
      { date: '2026-02-14', value: 5 },
    ])
    expect(kept.map((p) => p.date)).toEqual(['2026-02-01', '2026-02-08', '2026-02-14'])
  })

  it('widens past the window for sparse readings, so weekly lifts still project', () => {
    // One 1RM a week: two weeks holds only two sessions, so reach back a third.
    const kept = trendPoints([
      { date: '2026-01-10', value: 1 },
      { date: '2026-01-24', value: 2 },
      { date: '2026-01-31', value: 3 },
      { date: '2026-02-07', value: 4 },
    ])
    expect(kept).toHaveLength(TREND_WINDOW.minPoints)
    expect(kept[0].date).toBe('2026-01-24')
  })

  it('sorts by date and survives an empty series', () => {
    const kept = trendPoints([
      { date: '2026-02-14', value: 2 },
      { date: '2026-02-01', value: 1 },
      { date: '2026-02-08', value: 3 },
    ])
    expect(kept.map((p) => p.date)).toEqual(['2026-02-01', '2026-02-08', '2026-02-14'])
    expect(trendPoints([])).toEqual([])
  })
})

describe('weeksToClose', () => {
  it('is a straight line when the pace does not decay', () => {
    expect(weeksToClose(25, 5, 1)).toBe(5)
    expect(weeksToClose(25, 5)).toBe(5)
  })

  it('takes longer once the pace is allowed to decay', () => {
    expect(weeksToClose(25, 5, 0.9)!).toBeGreaterThan(5)
  })

  it('still dates a gap past everything the taper alone could buy', () => {
    // 5/wk decaying 10%/wk spends its taper on slope·(1 - floor)/(1 - decay) = 40
    // over the first ~15 weeks, then holds at a fifth of the pace — so a gap of
    // 60 is another 20 at 1/wk rather than the blank the bare taper reported.
    const taper = weeksToClose(40, 5, 0.9)!
    expect(taper).toBeCloseTo(15.3, 1)
    expect(weeksToClose(60, 5, 0.9)).toBeCloseTo(taper + 20, 1)
    // Far out is far out, not impossible.
    expect(weeksToClose(500, 5, 0.9)).toBeGreaterThan(90)
  })

  it('projects the taper unchanged for gaps it can close on its own', () => {
    // The floor only binds after the taper has run out, so every goal near
    // enough to commit to reads exactly as it did before.
    expect(weeksToClose(25, 5, 0.9)).toBeCloseTo(Math.log(0.5) / Math.log(0.9), 6)
  })

  it('returns null when flat or pointed away from the gap', () => {
    expect(weeksToClose(25, 0, 0.9)).toBeNull()
    expect(weeksToClose(25, -5, 0.9)).toBeNull()
  })

  it('projects straight once there is no taper left to spend', () => {
    // A floor of 1 is a pace already at the bottom of its curve: nothing left to
    // decay, so the gap closes at the pace measured.
    expect(weeksToClose(60, 5, 0.9, 1)).toBe(12)
    expect(weeksToClose(500, 5, 0.9, 1)).toBe(100)
  })

  it('tapers only the remainder for a pace partway down its curve', () => {
    // Between the two: further out than a straight line, nearer than a full taper.
    const partway = weeksToClose(60, 5, 0.9, 0.5)!
    expect(partway).toBeGreaterThan(weeksToClose(60, 5, 0.9, 1)!)
    expect(partway).toBeLessThan(weeksToClose(60, 5, 0.9)!)
  })
})

describe('paceFloorFraction', () => {
  it('takes the full taper for a series with no history behind it', () => {
    expect(paceFloorFraction(0.9, 0)).toBe(PACE_FLOOR)
    expect(paceFloorFraction(0.9)).toBe(PACE_FLOOR)
  })

  it('leaves no taper for a series already past the bend', () => {
    // 0.9^15.3 is the floor, so a log that deep has worked through the whole
    // taper: its measured pace *is* the floor pace and projects straight.
    expect(paceFloorFraction(0.9, 16)).toBe(1)
    expect(paceFloorFraction(0.9, 60)).toBe(1)
  })

  it('leaves the remainder for a series partway through', () => {
    const half = paceFloorFraction(0.9, 7.6)
    expect(half).toBeGreaterThan(PACE_FLOOR)
    expect(half).toBeLessThan(1)
  })

  it('is the full floor for a model that does not taper at all', () => {
    expect(paceFloorFraction(1, 40)).toBe(PACE_FLOOR)
  })
})

describe('project with a decaying gain rate', () => {
  const gaining = [
    { date: '2026-01-05', value: 100 },
    { date: '2026-01-12', value: 105 },
    { date: '2026-01-19', value: 110 },
    { date: '2026-01-26', value: 115 },
  ]
  const today = new Date(2026, 0, 26)

  it('projects a later eta than a straight line off the same pace', () => {
    const straight = project(gaining, 140, today)
    const decayed = project(gaining, 140, today, { decayPerWeek: 0.9 })
    expect(straight.onTrack).toBe(true)
    expect(decayed.onTrack).toBe(true)
    expect(decayed.decayPerWeek).toBe(0.9)
    expect((decayed.etaWeeks as number) > (straight.etaWeeks as number)).toBe(true)
    expect((decayed.etaDate as string) > (straight.etaDate as string)).toBe(true)
  })

  it('dates a goal a long way out rather than reporting nothing', () => {
    // 285 to go at +5/wk. The taper spends itself long before that, but the pace
    // floors instead of vanishing, so the answer is a distant date — years of it
    // — and not the blank the bare taper used to give.
    const straight = project(gaining, 400, today)
    const decayed = project(gaining, 400, today, { decayPerWeek: 0.9 })
    expect(straight.onTrack).toBe(true)
    expect(decayed.onTrack).toBe(true)
    expect(decayed.etaWeeks!).toBeGreaterThan(straight.etaWeeks!)
    expect(decayed.etaWeeks!).toBeGreaterThan(52 * 4)
    expect(decayed.etaDate).not.toBeNull()
  })
})

describe('project with a capped pace', () => {
  /** +3 lbs/week over a fortnight — a real fit, but not a rate anyone holds. */
  const hotFortnight = [
    { date: '2026-01-31', value: 164 },
    { date: '2026-02-07', value: 167 },
    { date: '2026-02-14', value: 170 },
  ]
  const today = new Date(2026, 1, 14)

  it('projects off the cap, while still reporting the pace measured', () => {
    const p = project(hotFortnight, 180, today, { capPerWeek: 1 })

    expect(p.observedSlopePerWeek).toBe(3)
    expect(p.slopePerWeek).toBe(1)
    expect(isPaceCapped(p)).toBe(true)
    // 10 lbs to go at a pound a week, not at three.
    expect(p.etaWeeks).toBe(10)
    expect(p.etaDate).toBe('2026-04-25')
  })

  it('pushes the eta out well past the uncapped one', () => {
    const uncapped = project(hotFortnight, 180, today)
    const capped = project(hotFortnight, 180, today, { capPerWeek: 1 })

    expect(uncapped.etaWeeks).toBeLessThan(4)
    expect((capped.etaWeeks as number) > (uncapped.etaWeeks as number)).toBe(true)
    expect(isPaceCapped(uncapped)).toBe(false)
  })

  it('leaves a pace already inside the cap alone', () => {
    const steady = [
      { date: '2026-01-31', value: 168.4 },
      { date: '2026-02-07', value: 169 },
      { date: '2026-02-14', value: 169.6 },
    ]
    const p = project(steady, 180, today, { capPerWeek: 1 })

    expect(p.slopePerWeek).toBe(p.observedSlopePerWeek)
    expect(p.slopePerWeek).toBeCloseTo(0.6, 5)
    expect(isPaceCapped(p)).toBe(false)
  })

  it('caps a fall as hard as a climb, keeping its direction', () => {
    const crashing = [
      { date: '2026-01-31', value: 176 },
      { date: '2026-02-07', value: 173 },
      { date: '2026-02-14', value: 170 },
    ]
    const p = project(crashing, 160, today, { capPerWeek: 1 })

    expect(p.observedSlopePerWeek).toBe(-3)
    expect(p.slopePerWeek).toBe(-1)
    expect(p.etaWeeks).toBe(10)
  })

  it('holds the cap against a target the raw pace would claim to reach soon', () => {
    // A decaying +3/wk buys 24 lbs off its taper alone and covers the 25 to go in
    // a few months; capped at +1 the same climb is bought a fifth of a pound a
    // week once the taper's spent, which is years — the cap moves the date, it
    // doesn't withhold it.
    const near = project(hotFortnight, 195, today, { decayPerWeek: 0.9 })
    const capped = project(hotFortnight, 195, today, { decayPerWeek: 0.9, capPerWeek: 1 })

    expect(near.onTrack).toBe(true)
    expect(capped.onTrack).toBe(true)
    expect(near.etaWeeks!).toBeLessThan(52)
    expect(capped.etaWeeks!).toBeGreaterThan(52 * 1.5)
  })

  it('reports no pace at all when the window is too thin to read', () => {
    const p = project(
      [
        { date: '2026-02-12', value: 167 },
        { date: '2026-02-13', value: 169 },
        { date: '2026-02-14', value: 170 },
      ],
      180,
      today,
      { capPerWeek: 1 },
    )

    // The cap is a ceiling on a pace, not a substitute for having one.
    expect(p.observedSlopePerWeek).toBe(0)
    expect(p.slopePerWeek).toBe(0)
    expect(isPaceCapped(p)).toBe(false)
    expect(p.onTrack).toBe(false)
  })
})

describe('project anchored on the best of the window', () => {
  const today = new Date(2026, 1, 14)
  /**
   * A fortnight of warm side splits climbing about a degree a week, with the last
   * session coming in tight — 127° was reached three days before the 123° that
   * happens to be the newest reading.
   */
  const tightLastSession = [
    { date: '2026-02-01', value: 118 },
    { date: '2026-02-04', value: 124 },
    { date: '2026-02-08', value: 121 },
    { date: '2026-02-11', value: 127 },
    { date: '2026-02-14', value: 123 },
  ]

  it('measures the gap from the best reading, not the newest one', () => {
    const latest = project(tightLastSession, 135, today)
    const best = project(tightLastSession, 135, today, { bestOf: 'max' })

    expect(latest.current).toBe(123)
    expect(best.current).toBe(127)
    // Same fitted pace either way — only where the gap is measured from changes.
    expect(best.slopePerWeek).toBe(latest.slopePerWeek)
    expect(best.etaWeeks!).toBeLessThan(latest.etaWeeks!)
  })

  it('does not reopen a gap the log had already closed', () => {
    // Before the tight session, 127° was the newest reading and the gap was 8°.
    // The tight session honestly slows the fitted pace, but it should not also
    // hand back four of those degrees — the anchored gap stays where it was.
    const before = project(tightLastSession.slice(0, -1), 135, new Date(2026, 1, 11))
    const after = project(tightLastSession, 135, today, { bestOf: 'max' })
    const unanchored = project(tightLastSession, 135, today)

    expect(before.current).toBe(127)
    expect(after.current).toBe(before.current)
    expect(unanchored.current).toBeLessThan(before.current)
  })

  it('takes the lowest reading for a metric that has to come down', () => {
    const bodyFat = [
      { date: '2026-02-01', value: 19 },
      { date: '2026-02-08', value: 17.5 },
      { date: '2026-02-14', value: 18.2 },
    ]
    expect(project(bodyFat, 12, today, { bestOf: 'min' }).current).toBe(17.5)
    expect(project(bodyFat, 12, today, { bestOf: 'max' }).current).toBe(19)
  })

  it('reads the best off the fitted window, so an old peak cannot resurrect it', () => {
    const fadedPeak = [
      { date: '2025-06-01', value: 150 },
      { date: '2026-02-01', value: 118 },
      { date: '2026-02-08', value: 121 },
      { date: '2026-02-14', value: 120 },
    ]
    expect(project(fadedPeak, 135, today, { bestOf: 'max' }).current).toBe(121)
  })

  it('leaves the newest reading as the anchor when no best is asked for', () => {
    expect(project(tightLastSession, 135, today).current).toBe(123)
  })
})

describe('weeklyTarget', () => {
  it('returns the one-week required step toward the target', () => {
    expect(weeklyTarget(170, 180, 10)).toBe(171)
  })

  it('returns target when weeksOut <= 0', () => {
    expect(weeklyTarget(170, 180, 0)).toBe(180)
    expect(weeklyTarget(170, 180, -5)).toBe(180)
  })
})
