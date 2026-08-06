import { describe, it, expect } from 'vitest'
import { isPaceCapped, project, trendPoints, weeklyTarget, weeksToClose, TREND_WINDOW } from './predictions'

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

  it('returns null for a gap past the ceiling a decaying pace can reach', () => {
    // 5/wk decaying 10%/wk can only ever add slope/(1 - decay) = 50.
    expect(weeksToClose(49, 5, 0.9)).not.toBeNull()
    expect(weeksToClose(51, 5, 0.9)).toBeNull()
  })

  it('returns null when flat or pointed away from the gap', () => {
    expect(weeksToClose(25, 0, 0.9)).toBeNull()
    expect(weeksToClose(25, -5, 0.9)).toBeNull()
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

  it('reports a goal beyond the decaying ceiling as not on track', () => {
    // A straight line always reaches it; a decaying pace tops out first.
    const straight = project(gaining, 400, today)
    const decayed = project(gaining, 400, today, { decayPerWeek: 0.9 })
    expect(straight.onTrack).toBe(true)
    expect(decayed.onTrack).toBe(false)
    expect(decayed.etaWeeks).toBeNull()
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

  it('holds the cap against a target the raw pace would claim to reach', () => {
    // A decaying +3/wk tops out 30 lbs up; capped at +1 it only ever adds 10.
    const near = project(hotFortnight, 195, today, { decayPerWeek: 0.9 })
    const capped = project(hotFortnight, 195, today, { decayPerWeek: 0.9, capPerWeek: 1 })

    expect(near.onTrack).toBe(true)
    expect(capped.onTrack).toBe(false)
    expect(capped.etaDate).toBeNull()
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

describe('weeklyTarget', () => {
  it('returns the one-week required step toward the target', () => {
    expect(weeklyTarget(170, 180, 10)).toBe(171)
  })

  it('returns target when weeksOut <= 0', () => {
    expect(weeklyTarget(170, 180, 0)).toBe(180)
    expect(weeklyTarget(170, 180, -5)).toBe(180)
  })
})
