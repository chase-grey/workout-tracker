import { describe, it, expect } from 'vitest'
import type { BodyWeightEntry, WorkoutRow } from '../types'
import { weeklySummary } from './summary'

// Fixed "today" — Wednesday, 2026-07-08. Its Mon–Sun week is 2026-07-06 .. 2026-07-12.
const TODAY = new Date(2026, 6, 8)

function row(partial: Partial<WorkoutRow> & Pick<WorkoutRow, 'session_id' | 'date' | 'exercise'>): WorkoutRow {
  return {
    day_type: 'push',
    set_number: 1,
    weight_lbs: null,
    reps: 8,
    notes: '',
    is_historical: false,
    ...partial,
  }
}

function bw(date: string, weightLbs: number): BodyWeightEntry {
  return { date, weightLbs }
}

describe('weeklySummary', () => {
  it('counts distinct sessions this week, ignoring prior weeks', () => {
    const workouts: WorkoutRow[] = [
      // this week: session A (2 rows) + session B (1 row) => 2 distinct
      row({ session_id: 'A', date: '2026-07-06', exercise: 'incline_bench' }),
      row({ session_id: 'A', date: '2026-07-06', exercise: 'flat_dumbbell_press' }),
      row({ session_id: 'B', date: '2026-07-08', exercise: 'incline_bench' }),
      // prior week: should not count
      row({ session_id: 'C', date: '2026-06-30', exercise: 'incline_bench' }),
    ]
    const s = weeklySummary(workouts, [], TODAY)
    expect(s.workoutCount).toBe(2)
  })

  it('counts stretch (flex) days as activity too', () => {
    // one workout this week + a stretch day this week = 2; a prior-week stretch ignored
    const workouts: WorkoutRow[] = [row({ session_id: 'A', date: '2026-07-07', exercise: 'x' })]
    const s = weeklySummary(workouts, [], TODAY, ['2026-07-08', '2026-06-30'])
    expect(s.workoutCount).toBe(2)
  })

  it('detects a PR when this week beats all prior weeks', () => {
    const workouts: WorkoutRow[] = [
      // prior weeks best: 100 x 5 => 100 * (1 + 5/30) ≈ 116.7, over two days
      row({ session_id: 'O', date: '2026-06-22', exercise: 'incline_bench', weight_lbs: 95, reps: 5 }),
      row({ session_id: 'P', date: '2026-06-29', exercise: 'incline_bench', weight_lbs: 100, reps: 5 }),
      // this week: 110 x 5 => 110 * (1 + 5/30) ≈ 128.3  -> PR
      row({ session_id: 'A', date: '2026-07-07', exercise: 'incline_bench', weight_lbs: 110, reps: 5 }),
    ]
    const s = weeklySummary(workouts, [], TODAY)
    expect(s.prs).toHaveLength(1)
    expect(s.prs[0].exercise).toBe('incline bench press')
    expect(s.prs[0].est1RM).toBe(128.3)
  })

  it('does NOT report a PR when this week does not beat prior weeks', () => {
    const workouts: WorkoutRow[] = [
      // prior weeks best: 120 x 5, over two days
      row({ session_id: 'O', date: '2026-06-22', exercise: 'incline_bench', weight_lbs: 115, reps: 5 }),
      row({ session_id: 'P', date: '2026-06-29', exercise: 'incline_bench', weight_lbs: 120, reps: 5 }),
      // this week: 110 x 5 -> not a PR
      row({ session_id: 'A', date: '2026-07-07', exercise: 'incline_bench', weight_lbs: 110, reps: 5 }),
    ]
    const s = weeklySummary(workouts, [], TODAY)
    expect(s.prs).toHaveLength(0)
  })

  it('does NOT treat a first-ever lift (no prior data) as a PR', () => {
    const workouts: WorkoutRow[] = [
      row({ session_id: 'A', date: '2026-07-07', exercise: 'cable_row', weight_lbs: 90, reps: 10 }),
    ]
    expect(weeklySummary(workouts, [], TODAY).prs).toHaveLength(0)
  })

  it('does NOT crown a PR off a single prior day of history', () => {
    const workouts: WorkoutRow[] = [
      row({ session_id: 'P', date: '2026-06-29', exercise: 'cable_row', weight_lbs: 80, reps: 10 }),
      row({ session_id: 'A', date: '2026-07-07', exercise: 'cable_row', weight_lbs: 90, reps: 10 }),
    ]
    expect(weeklySummary(workouts, [], TODAY).prs).toHaveLength(0)
  })

  it('ignores same-week days when judging prior history', () => {
    const workouts: WorkoutRow[] = [
      // two days of this lift, but both this week -> no baseline to beat
      row({ session_id: 'A', date: '2026-07-06', exercise: 'cable_row', weight_lbs: 80, reps: 10 }),
      row({ session_id: 'B', date: '2026-07-08', exercise: 'cable_row', weight_lbs: 90, reps: 10 }),
    ]
    expect(weeklySummary(workouts, [], TODAY).prs).toHaveLength(0)
  })

  it('ignores null-weight rows for 1RM', () => {
    const workouts: WorkoutRow[] = [
      row({ session_id: 'A', date: '2026-07-07', exercise: 'weighted_pullups', weight_lbs: null, reps: 8 }),
    ]
    const s = weeklySummary(workouts, [], TODAY)
    expect(s.prs).toHaveLength(0)
    expect(s.workoutCount).toBe(1)
  })

  it('computes weightTrend vs the last pre-week weigh-in', () => {
    const bodyWeights: BodyWeightEntry[] = [
      bw('2026-06-20', 185),
      bw('2026-06-30', 183.4), // latest before this week
      bw('2026-07-06', 182.1), // this week
      bw('2026-07-08', 181.6), // latest this week
    ]
    const s = weeklySummary([], bodyWeights, TODAY)
    // 181.6 - 183.4 = -1.8
    expect(s.weightTrend).toBe(-1.8)
  })

  it('returns null weightTrend when there is no prior weigh-in', () => {
    const s = weeklySummary([], [bw('2026-07-06', 182)], TODAY)
    expect(s.weightTrend).toBeNull()
  })

  it('returns null weightTrend when there is no this-week weigh-in', () => {
    const s = weeklySummary([], [bw('2026-06-30', 183)], TODAY)
    expect(s.weightTrend).toBeNull()
  })
})
