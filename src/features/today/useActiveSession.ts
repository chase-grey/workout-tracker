import { useCallback, useEffect, useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { DayType, SetLog, WorkoutSession } from '../../types'
import type { PlannedExercise } from '../../config/plan'
import { storage } from '../../services/storage'
import { toISODate } from '../../lib/dates'
import { useData } from '../../store/DataContext'
import { nextTargets } from '../../lib/progression'
import { spreadSharedWeight } from '../../lib/sharedLoad'
import { mirrorSidedEdit } from '../../lib/sidePair'
import { carryLoggedSet, type CarriedSet } from '../../lib/carryForward'
import {
  shortExercises,
  sideOrderedExercises,
  variantExercises,
  type SessionLength,
  type VariantKey,
} from '../../config/plan'
import { nextVariant, progressionVariant } from '../../lib/pushVariant'
import { nextStartSide } from '../../lib/pushSide'
import { expandToFull as expandSession } from '../../lib/sessionLength'

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
    // take whichever press the last push session didn't start with. `length` is
    // the day's short form unless asked for the whole day (see SessionLength);
    // the checklist can open a short session up later.
    (dayType: DayType, variant?: VariantKey, length: SessionLength = 'short') => {
      storage.saveActiveStep(0)
      storage.saveActiveStepKey(null)
      storage.saveActiveRest(null)
      storage.saveRestTally(null)
      storage.saveActiveExerciseTimes(null)
      storage.saveSetClock(null)
      // Hands-free was a choice about the workout that just ended, so a new one
      // opens waiting for taps again. Same for whatever it skipped: today's sore
      // knee isn't next week's.
      storage.saveFastMode('off')
      storage.saveSkipped(null)
      const chosen = variant ?? nextVariant(workouts, dayType) ?? undefined
      // Whichever arm didn't lead last time leads today's one-arm-at-a-time work.
      const startSide = nextStartSide(workouts, dayType)
      const planned = sideOrderedExercises(
        shortExercises(variantExercises(plan[dayType], chosen ?? null), length),
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
        length,
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

  // Open a short session up to the whole day: the movements the short form left
  // out arrive prescribed as they would have been at the start, and the ones it
  // cut get their missing sets back (see lib/sessionLength). Nothing logged moves.
  const expandToFull = useCallback(() => {
    setSession((prev) => {
      if (!prev || prev.length !== 'short') return prev
      const full = sideOrderedExercises(
        variantExercises(plan[prev.dayType], prev.variant ?? null),
        prev.startSide,
      )
      const have = new Set(prev.exercises.map((l) => l.exercise))
      const targets = nextTargets(
        workouts,
        full.filter((e) => !have.has(e.key)),
        { variantFor: (key) => progressionVariant(key, prev.variant) },
      )
      return expandSession(prev, full, targets)
    })
  }, [plan, workouts])

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

  const addExercise = useCallback(
    (input: { name: string; sets: number; reps: number; weightLbs: number | null }) => {
      const key = `adhoc:${uuid()}`
      const exercise: PlannedExercise = {
        key,
        name: input.name,
        sets: input.sets,
        repMin: input.reps,
        repMax: input.reps,
        restSec: 60,
        group: 'ad hoc',
      }
      setSession((prev) =>
        prev
          ? {
              ...prev,
              adHocExercises: [...(prev.adHocExercises ?? []), exercise],
              exercises: [
                ...prev.exercises,
                {
                  exercise: key,
                  sets: Array.from({ length: input.sets }, (_, i) => ({
                    setNumber: i + 1,
                    weightLbs: input.weightLbs,
                    reps: input.reps,
                    done: false,
                  })),
                },
              ],
            }
          : prev,
      )
      return key
    },
    [],
  )

  const updateSet = useCallback(
    (exKey: string, index: number, patch: Partial<SetLog>) => {
      mutateExercise(exKey, (sets) => sets.map((s, i) => (i === index ? { ...s, ...patch } : s)))
      setSession((prev) => {
        if (!prev) return prev
        const exercises = plan[prev.dayType]?.exercises ?? []
        // A number typed for one arm of a sided pair is the number for the other
        // arm's same set — one dumbbell, the same reps each side (see mirrorSidedEdit).
        let logs = mirrorSidedEdit({ logs: prev.exercises, exercises, exKey, index, patch })
        // A weight entered at one station is the weight of the whole load-sharing
        // group — one cable stack, one dumbbell — so it carries to the group's other
        // stations instead of being typed again at each of them.
        if (patch.weightLbs != null) {
          logs = spreadSharedWeight({ logs, exercises, exKey, weightLbs: patch.weightLbs })
        }
        return logs === prev.exercises ? prev : { ...prev, exercises: logs }
      })
    },
    [mutateExercise, plan],
  )

  // What a completed set leaves the rest of the exercise: the sets still ahead of
  // it prefill with the numbers just logged instead of the target they were built
  // with, so an exercise is prescribed once and then follows itself (see
  // carryLoggedSet).
  const carrySet = useCallback(
    (exKey: string, carried: CarriedSet) =>
      setSession((prev) =>
        prev ? { ...prev, exercises: carryLoggedSet({ logs: prev.exercises, exKey, carried }) } : prev,
      ),
    [],
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
    storage.saveActiveExerciseTimes(null)
    storage.saveSetClock(null)
    storage.saveFastMode('off')
    storage.saveSkipped(null)
    setSession(null)
  }, [])

  return { session, start, expandToFull, addSet, addExercise, updateSet, carrySet, removeSet, clear }
}
