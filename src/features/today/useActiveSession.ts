import { useCallback, useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { DayType, SetLog, WorkoutSession } from '../../types'
import { storage } from '../../services/storage'
import { toISODate } from '../../lib/dates'
import { useData } from '../../store/DataContext'
import { nextTarget } from '../../lib/progression'
import { variantExercises, type VariantKey } from '../../config/plan'
import { nextVariant, progressionVariant } from '../../lib/pushVariant'

/**
 * Owns the in-progress workout session, mirrored to localStorage so a mid-gym
 * app close can be resumed. On start, every set is pre-filled with the
 * progression target (weight × reps that beats the last session) — editable.
 */
export function useActiveSession() {
  const { plan, workouts } = useData()
  const [session, setSession] = useState<WorkoutSession | null>(() => storage.loadActiveSession())

  const commit = useCallback((next: WorkoutSession | null) => {
    setSession(next)
    storage.saveActiveSession(next)
  }, [])

  const start = useCallback(
    // `variant` overrides the automatic A/B choice (Push + Core only); omit it to
    // take whichever one this week's session count calls for.
    (dayType: DayType, variant?: VariantKey) => {
      storage.saveActiveStep(0)
      storage.saveActiveStepKey(null)
      storage.saveActiveRest(null)
      const chosen = variant ?? nextVariant(workouts, dayType) ?? undefined
      commit({
        sessionId: uuid(),
        date: toISODate(new Date()),
        dayType,
        isHistorical: false,
        startedAt: new Date().toISOString(),
        variant: chosen,
        exercises: variantExercises(plan[dayType], chosen ?? null).map((e) => {
          const target = nextTarget(workouts, e.key, {
            repMin: e.repMin,
            repMax: e.repMax,
            bodyweight: e.bodyweight,
            increment: e.increment,
            // A press this variant trains under different fatigue climbs on its
            // own ladder, so the prefill is read from the matching slot rather
            // than from the day the lift led (or followed).
            variant: progressionVariant(e.key, chosen),
          })
          const sets: SetLog[] = Array.from({ length: e.sets }, (_, i) => ({
            setNumber: i + 1,
            weightLbs: target.weightLbs,
            reps: target.reps,
            done: false,
          }))
          return { exercise: e.key, sets }
        }),
      })
    },
    [commit, plan, workouts],
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
        exercises: prev.exercises.map((ex) => (ex.exercise === exKey ? { ...ex, notes } : ex)),
      }
      storage.saveActiveSession(next)
      return next
    })
  }, [])

  const addSet = useCallback(
    (exKey: string, template?: Partial<SetLog>) =>
      mutateExercise(exKey, (sets) => {
        const last = sets[sets.length - 1]
        return [
          ...sets,
          {
            setNumber: sets.length + 1,
            weightLbs: template?.weightLbs ?? last?.weightLbs ?? null,
            reps: template?.reps ?? last?.reps ?? 0,
            done: false,
          },
        ]
      }),
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

  const clear = useCallback(() => {
    storage.saveActiveStep(0)
    storage.saveActiveStepKey(null)
    storage.saveActiveRest(null)
    commit(null)
  }, [commit])

  return { session, start, addSet, updateSet, removeSet, setNotes, clear }
}
