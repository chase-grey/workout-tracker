import { describe, expect, it } from 'vitest'
import { buildBrainShare, goalStandings } from './brainShare'
import { buildGoals, GOAL_IDS } from './goals'
import type { LockedProjection } from './goalLock'
import type { WeekResult } from './weeklyStreak'

const week = (start: string, outcome: WeekResult['outcome'], streakAfter: number, inProgress = false): WeekResult => ({
  week: start,
  counts: { workouts: 2, flex: 2, calDays: 6 },
  goals: { workouts: 2, flex: 2, calDays: 6 },
  tier: outcome === 'advanced' ? 'full' : 'short',
  exceeded: false,
  outcome,
  freezesEarned: 0,
  freezesSpent: outcome === 'froze' ? 1 : 0,
  streakAfter,
  freezesAfter: 3,
  inProgress,
})

describe('buildBrainShare', () => {
  it('has nothing to say before a week has been logged', () => {
    expect(buildBrainShare([], { open: 0, onPace: 0, met: 0, list: [] })).toBeNull()
  })

  it('reports the streak the Today tab shows, and each week by what it did to the run', () => {
    const history = [
      week('2026-11-02', 'reset', 0),
      week('2026-11-09', 'advanced', 1),
      week('2026-11-16', 'froze', 1),
      week('2026-11-23', 'advanced', 2, true),
    ]
    const share = buildBrainShare(history, { open: 2, onPace: 1, met: 1, list: [] }, new Date(2026, 10, 24))!
    expect(share.asOf).toBe('2026-11-24')
    expect(share.streak).toBe(2)
    expect(share.freezes).toBe(3)
    expect(share.weeksTracked).toBe(4)
    expect(share.weeks).toEqual([
      { week: '2026-11-02', result: 'missed' },
      { week: '2026-11-09', result: 'hit' },
      { week: '2026-11-16', result: 'froze' },
      { week: '2026-11-23', result: 'hit', inProgress: true },
    ])
    expect(share.goals).toEqual({ open: 2, onPace: 1, met: 1, list: [] })
  })

  it('keeps counting weeks it no longer lists', () => {
    const history = Array.from({ length: 40 }, (_, i) => week(`w${String(i).padStart(2, '0')}`, 'advanced', i + 1))
    const share = buildBrainShare(history, { open: 0, onPace: 0, met: 0, list: [] })!
    expect(share.weeksTracked).toBe(40)
    expect(share.weeks).toHaveLength(26)
    expect(share.weeks[25].week).toBe('w39')
  })
})

describe('goalStandings', () => {
  const now = new Date(2026, 2, 14)
  const weighIns = [
    { date: '2026-01-31', weightLbs: 170 },
    { date: '2026-02-14', weightLbs: 171.2 },
    { date: '2026-02-28', weightLbs: 172.2 },
    { date: '2026-03-14', weightLbs: 173.4 },
  ]
  const goals = buildGoals({ workouts: [], bodyWeights: weighIns, measurements: [], heightIn: 70 })
  const lock = (slopePerWeek: number, etaDate: string): LockedProjection => ({
    goalId: GOAL_IDS.weight180, lockedAt: '2026-01-31', startValue: 170, target: 180, etaDate, slopePerWeek,
  })

  it('leaves a goal nobody committed to out of the count', () => {
    expect(goalStandings(goals, {}, now)).toEqual({ open: 0, onPace: 0, met: 0, list: [] })
  })

  it('counts a committed goal ahead of its line as on pace', () => {
    const stored = { [GOAL_IDS.weight180]: lock(0.25, '2026-11-07') }
    expect(goalStandings(goals, stored, now)).toEqual({ open: 1, onPace: 1, met: 0, list: [{ title: 'bodyweight → 180', state: 'onPace' }] })
  })

  it('counts a committed goal behind its line as open and not on pace', () => {
    const stored = { [GOAL_IDS.weight180]: lock(2, '2026-03-07') }
    expect(goalStandings(goals, stored, now)).toEqual({ open: 1, onPace: 0, met: 0, list: [{ title: 'bodyweight → 180', state: 'behind' }] })
  })

  it('counts a committed goal already reached as met', () => {
    const reached = buildGoals({
      workouts: [], bodyWeights: [...weighIns, { date: '2026-03-21', weightLbs: 181 }], measurements: [], heightIn: 70,
    })
    const stored = { [GOAL_IDS.weight180]: lock(0.25, '2026-11-07') }
    expect(goalStandings(reached, stored, new Date(2026, 2, 21))).toEqual({ open: 0, onPace: 0, met: 1, list: [{ title: 'bodyweight → 180', state: 'met' }] })
  })

  it('counts a reached goal nobody committed to as met', () => {
    const reached = buildGoals({
      workouts: [], bodyWeights: [...weighIns, { date: '2026-03-21', weightLbs: 181 }], measurements: [], heightIn: 70,
    })
    expect(goalStandings(reached, {}, new Date(2026, 2, 21))).toMatchObject({ open: 0, met: 1 })
  })
})
