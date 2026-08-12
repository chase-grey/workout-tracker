import { useCallback, useEffect, useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { DayType, SetLog, WorkoutSession } from '../../types'
import { storage } from '../../services/storage'
import { toISODate } from '../../lib/dates'
import { useData } from '../../store/DataContext'
import { nextTargets } from '../../lib/progression'
import { sideOrderedExercises, variantExercises, type VariantKey } from '../../config/plan'
import { nextVariant, progressionVariant } from '../../lib/pushVariant'
import { nextStartSide } from '../../lib/pushSide'

/**
 * Owns the in-progress workout session, mirrored to localStorage so a mid-gym
 * app close can be resumed. On start, every set is pre-filled with the
 * progression target (weight × reps that beats the last session) — editable.
 */
export function useActiveSession() {
  const { plan, workouts } = useData()
  const [session, setSession] = useState<WorkoutSession | null>(() => storage.loadActiveSession())

  // Mirror the session from here rather than from inside the state updaters.
  // Finishing the last set marks it done and finishes in the same tick, so the
  // clear landed in storage first and React then replayed the queued set update
  // over it — writing a finished workout back and reopening the app into it.
  // Whatever state the queue settles on is what gets written.
  useEffect(() => {
    storage.saveActiveSession(session)
  }, [session])

  const start = useCallback(
    // `variant` overrides the automatic A/B choice (Push + Core only); omit it to
    // take whichever one this week's session count calls for.
    (dayType: DayType, variant?: VariantKey) => {
      storage.saveActiveStep(0)
      storage.saveActiveStepKey(null)
      storage.saveActiveRest(null)
      storage.saveRestTally(null)
      const chosen = variant ?? nextVariant(workouts, dayType) ?? undefined
      // Whichever arm didn't lead last time leads today's one-arm-at-a-time work.
      const startSide = nextStartSide(workouts, dayType)
      const planned = sideOrderedExercises(
        variantExercises(plan[dayType], chosen ?? null),
        startSide,
      )
      // Read as a batch rather than one lift at a time, so the exercises that
      // share a load (the tricep pair) prefill with one weight between them.
      const targets = nextTargets(workouts, planned, {
        // A press this variant trains under different fatigue climbs on its own
        // ladder, so the prefill is read from the matching slot rather than from
        // the day the lift led (or followed).
        variantFor: (key) => progressionVariant(key, chosen),
      })
      setSession({
        sessionId: uuid(),
        date: toISODate(new Date()),
        dayType,
        isHistorical: false,
        startedAt: new Date().toISOString(),
        variant: chosen,
        startSide,
        exercises: planned.map((e) => {
          const target = targets.get(e.key) ?? { weightLbs: null, reps: e.repMin }
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
    [plan, workouts],
  )

  const mutateExercise = useCallback((exKey: string, fn: (sets: SetLog[]) => SetLog[]) => {
    setSession((prev) =>
      prev
        ? {
            ...prev,
            exercises: prev.exercises.map((ex) =>
              ex.exercise === exKey
                ? { ...ex, sets: fn(ex.sets).map((s, i) => ({ ...s, setNumber: i + 1 })) }
                : ex,
            ),
          }
        : prev,
    )
  }, [])

  const setNotes = useCallback((exKey: string, notes: string) => {
    setSession((prev) =>
      prev
        ? {
            ...prev,
            exercises: prev.exercises.map((ex) => (ex.exercise === exKey ? { ...ex, notes } : ex)),
          }
        : prev,
    )
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
    storage.saveRestTally(null)
    setSession(null)
  }, [])

  return { session, start, addSet, updateSet, removeSet, setNotes, clear }
}
