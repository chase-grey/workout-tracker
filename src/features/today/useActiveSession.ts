import { useCallback, useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { DayType, SetLog, WorkoutSession } from '../../types'
import { PLAN } from '../../config/plan'
import { storage } from '../../services/storage'
import { toISODate } from '../../lib/dates'

/**
 * Owns the in-progress workout session, mirrored to localStorage so a mid-gym
 * app close can be resumed.
 */
export function useActiveSession() {
  const [session, setSession] = useState<WorkoutSession | null>(() => storage.loadActiveSession())

  const commit = useCallback((next: WorkoutSession | null) => {
    setSession(next)
    storage.saveActiveSession(next)
  }, [])

  const start = useCallback(
    (dayType: DayType) => {
      commit({
        sessionId: uuid(),
        date: toISODate(new Date()),
        dayType,
        isHistorical: false,
        exercises: PLAN[dayType].exercises.map((e) => ({ exercise: e.key, sets: [] })),
      })
    },
    [commit],
  )

  const mutateExercise = useCallback((exKey: string, fn: (sets: SetLog[]) => SetLog[]) => {
    setSession((prev) => {
      if (!prev) return prev
      const next: WorkoutSession = {
        ...prev,
        exercises: prev.exercises.map((ex) =>
          ex.exercise === exKey
            ? { ...ex, sets: fn(ex.sets).map((s, i) => ({ ...s, setNumber: i + 1 })) }
            : ex,
        ),
      }
      storage.saveActiveSession(next)
      return next
    })
  }, [])

  const setNotes = useCallback((exKey: string, notes: string) => {
    setSession((prev) => {
      if (!prev) return prev
      const next: WorkoutSession = {
        ...prev,
        exercises: prev.exercises.map((ex) =>
          ex.exercise === exKey ? { ...ex, notes } : ex,
        ),
      }
      storage.saveActiveSession(next)
      return next
    })
  }, [])

  const addSet = useCallback(
    (exKey: string, template?: Partial<SetLog>) =>
      mutateExercise(exKey, (sets) => [
        ...sets,
        { setNumber: sets.length + 1, weightLbs: template?.weightLbs ?? null, reps: template?.reps ?? 0 },
      ]),
    [mutateExercise],
  )

  const updateSet = useCallback(
    (exKey: string, index: number, patch: Partial<SetLog>) =>
      mutateExercise(exKey, (sets) => sets.map((s, i) => (i === index ? { ...s, ...patch } : s))),
    [mutateExercise],
  )

  const removeSet = useCallback(
    (exKey: string, index: number) =>
      mutateExercise(exKey, (sets) => sets.filter((_, i) => i !== index)),
    [mutateExercise],
  )

  const clear = useCallback(() => commit(null), [commit])

  return { session, start, addSet, updateSet, removeSet, setNotes, clear }
}
