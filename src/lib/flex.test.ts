import { describe, it, expect } from 'vitest'
import { dedupeFlexByDate, flexStats, type FlexEntry } from './flex'

describe('dedupeFlexByDate', () => {
  it('keeps one entry per date, preferring a measured angle', () => {
    const entries: FlexEntry[] = [
      { date: '2026-07-06', angleDeg: null, note: 'Stretch routine' },
      { date: '2026-07-06', angleDeg: null, note: 'Stretch routine' }, // dup marker
      { date: '2026-07-06', angleDeg: 150 }, // a measured angle same day
      { date: '2026-07-07', angleDeg: null },
    ]
    const out = dedupeFlexByDate(entries)
    expect(out).toHaveLength(2)
    expect(out.find((e) => e.date === '2026-07-06')?.angleDeg).toBe(150)
  })
})

// Fixed "today": Wednesday, 2026-07-08. Its Mon–Sun week is 2026-07-06 … 2026-07-12.
const TODAY = new Date(2026, 6, 8)

describe('flexStats', () => {
  it('counts only in-week entries, including a null-angle quick-log', () => {
    const entries: FlexEntry[] = [
      { date: '2026-07-06', angleDeg: 150 }, // Mon, in week
      { date: '2026-07-08', angleDeg: null, note: 'did my stretch' }, // in week, no measurement
      { date: '2026-07-12', angleDeg: 152 }, // Sun, in week
      { date: '2026-07-05', angleDeg: 149 }, // prev week (Sun)
      { date: '2026-07-13', angleDeg: 153 }, // next week (Mon)
    ]
    const s = flexStats(entries, TODAY)
    expect(s.sessionsThisWeek).toBe(3)
    expect(s.weeklyGoal).toBe(2)
    expect(s.goalDeg).toBe(180)
  })

  it('latestAngle ignores null entries and picks the newest measurement', () => {
    const entries: FlexEntry[] = [
      { date: '2026-06-01', angleDeg: 140 },
      { date: '2026-07-01', angleDeg: 155 },
      { date: '2026-07-08', angleDeg: null }, // newest date, but no angle
    ]
    const s = flexStats(entries, TODAY)
    expect(s.latestAngle).toBe(155)
  })

  it('bestAngle is the max non-null angle ever', () => {
    const entries: FlexEntry[] = [
      { date: '2026-06-01', angleDeg: 140 },
      { date: '2026-06-15', angleDeg: 165 },
      { date: '2026-07-01', angleDeg: 150 },
      { date: '2026-07-08', angleDeg: null },
    ]
    const s = flexStats(entries, TODAY)
    expect(s.bestAngle).toBe(165)
  })

  it('returns null latest/best when there are no measured entries', () => {
    const entries: FlexEntry[] = [
      { date: '2026-07-06', angleDeg: null },
      { date: '2026-07-08', angleDeg: null },
    ]
    const s = flexStats(entries, TODAY)
    expect(s.latestAngle).toBeNull()
    expect(s.bestAngle).toBeNull()
    expect(s.slopePerWeek).toBe(0)
    expect(s.etaWeeks).toBeNull()
    expect(s.etaDate).toBeNull()
  })

  it('an improving series gives slope>0 and an eta in the future', () => {
    // +5 deg/week over 4 weeks: 150 -> 165, latest 165, goal 180 => 3 weeks out.
    const entries: FlexEntry[] = [
      { date: '2026-06-17', angleDeg: 150 },
      { date: '2026-06-24', angleDeg: 155 },
      { date: '2026-07-01', angleDeg: 160 },
      { date: '2026-07-08', angleDeg: 165 },
    ]
    const s = flexStats(entries, TODAY)
    expect(s.slopePerWeek).toBe(5)
    expect(s.latestAngle).toBe(165)
    expect(s.etaWeeks).toBeGreaterThan(0)
    expect(s.etaWeeks).toBeCloseTo(3, 10)
    // today + round(3*7)=21 days => 2026-07-29
    expect(s.etaDate).toBe('2026-07-29')
    expect(parseInt(s.etaDate!.replace(/-/g, ''), 10)).toBeGreaterThan(20260708)
  })

  it('a flat series gives slope 0 and null eta', () => {
    const entries: FlexEntry[] = [
      { date: '2026-06-17', angleDeg: 150 },
      { date: '2026-06-24', angleDeg: 150 },
      { date: '2026-07-01', angleDeg: 150 },
      { date: '2026-07-08', angleDeg: 150 },
    ]
    const s = flexStats(entries, TODAY)
    expect(s.slopePerWeek).toBe(0)
    expect(s.etaWeeks).toBeNull()
    expect(s.etaDate).toBeNull()
  })

  it('an absent series (no measurements) gives null eta', () => {
    const s = flexStats([], TODAY)
    expect(s.slopePerWeek).toBe(0)
    expect(s.etaWeeks).toBeNull()
    expect(s.etaDate).toBeNull()
  })

  it('reaching the goal gives etaWeeks 0 and etaDate today', () => {
    const entries: FlexEntry[] = [
      { date: '2026-06-17', angleDeg: 170 },
      { date: '2026-07-08', angleDeg: 182 }, // latest >= goal
    ]
    const s = flexStats(entries, TODAY)
    expect(s.etaWeeks).toBe(0)
    expect(s.etaDate).toBe('2026-07-08')
  })

  it('honors custom goalDeg and weeklyGoal options', () => {
    const entries: FlexEntry[] = [{ date: '2026-07-08', angleDeg: 120 }]
    const s = flexStats(entries, TODAY, { goalDeg: 160, weeklyGoal: 3 })
    expect(s.goalDeg).toBe(160)
    expect(s.weeklyGoal).toBe(3)
  })
})
