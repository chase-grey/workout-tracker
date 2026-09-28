import { expect, it } from 'vitest'
import { mergePendingWorkouts, reconcileWorkouts } from './workoutSync'
import type { WorkoutRow } from '../types'

const row: WorkoutRow = { session_id: 'one', date: '2026-09-28', exercise: 'squat',
  day_type: 'push', set_number: 1, reps: 8, weight_lbs: 100, notes: '', is_historical: false }
it('keeps failed sessions visible after a refresh and deduplicates a lost acknowledgment', () => {
  expect(mergePendingWorkouts([], [row])).toEqual([row])
  expect(mergePendingWorkouts([row], [row])).toEqual([row])
  expect(mergePendingWorkouts([row], [{ ...row, set_number: 2 }])).toHaveLength(2)
})
it('ignores a stale fetch even if a workout saved during the request already left the queue', () => {
  expect(reconcileWorkouts([], [], [row], 0, 1)).toEqual([row])
  expect(reconcileWorkouts([], [row], [row], 1, 1)).toEqual([row])
  expect(reconcileWorkouts([], [], [row], 1, 1)).toEqual([])
})
