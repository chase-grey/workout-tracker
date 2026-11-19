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
import type { SessionLength, VariantKey } from '../../config/plan'
import { nextVariant, progressionVariant } from '../../lib/pushVariant'
import { nextStartSide } from '../../lib/pushSide'
import { expandToFull as expandSession } from '../../lib/sessionLength'
import { restoreGroup, type RestRule } from '../../lib/groupRest'
import { performedExercises, restingFlags } from '../../lib/performed'
import type { Arrangement } from '../../lib/arrangement'

/**
 * Owns the in-progress workout session, mirrored to localStorage so a mid-gym
 * app close can be resumed. On start, every set is pre-filled with the
 * progression target (weight × reps that beats the last session) — editable.
 */
export function useActiveSession() {
  const { plan, workouts, settings } = useData()
  // The size a workout opens at: the profile's choice, else short as always.
  const defaultLength: SessionLength = settings.profile?.strength?.length ?? 'short'
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
    // the profile's default size — short unless it says full (see SessionLength);
    // the checklist can open a short session up later.
    (dayType: DayType, variant?: VariantKey, length: SessionLength = defaultLength) => {
      // A day with nothing in it has no first set to open on.
      if (plan[dayType].exercises.length === 0) return
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
      // Variants belong to a day that declares them. A day with none — every
      // starter template's — would otherwise be stamped A and B in turn and have
      // its progression read from every other session.
      const hasVariants = plan[dayType].exercises.some((e) => e.byVariant)
      const chosen = hasVariants ? variant ?? nextVariant(workouts, dayType) ?? undefined : undefined
      // Whichever arm didn't lead last time leads today's one-arm-at-a-time work.
      const startSide = nextStartSide(workouts, dayType)
      const date = toISODate(new Date())
      // A group trained yesterday (or already today) sits this one out — the abs'
      // time goes to the rest of the day (see lib/absRest, lib/groupRest). The
      // kebab can bring each one back.
      const resting = restingFlags(workouts, plan, date)
      const planned = performedExercises(plan[dayType], { variant: chosen, length, startSide, ...resting })
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
        date,
        dayType,
        isHistorical: false,
        startedAt: new Date().toISOString(),
        variant: chosen,
        startSide,
        length,
        ...resting,
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
    [plan, workouts, defaultLength],
  )

  // Open a short session up to the whole day: the movements the short form left
  // out arrive prescribed as they would have been at the start, and the ones it
  // cut get their missing sets back (see lib/sessionLength). Nothing logged moves.
  const expandToFull = useCallback(() => {
    setSession((prev) => {
      if (!prev || prev.length !== 'short') return prev
      // The full day under the same flags — a session resting its abs opens up to
      // the full day without them, and with the full day's own fill.
      const full = performedExercises(plan[prev.dayType], { ...prev, length: 'full' })
      const have = new Set(prev.exercises.map((l) => l.exercise))
      const targets = nextTargets(
        workouts,
        full.filter((e) => !have.has(e.key)),
        { variantFor: (key) => progressionVariant(key, prev.variant) },
      )
      return expandSession(prev, full, targets)
    })
  }, [plan, workouts])

  // Put a resting group back into a session that started without it: its
  // movements arrive where the day has them, prescribed as they would have been
  // at the start, and the sets and movements that were filling their time go
  // unless they're already logged (see lib/groupRest.restoreGroup).
  const restoreRested = useCallback((rule: RestRule) => {
    setSession((prev) => {
      if (!prev || !prev[rule.flag]) return prev
      const withGroup = performedExercises(plan[prev.dayType], { ...prev, [rule.flag]: false })
      const have = new Set(prev.exercises.map((l) => l.exercise))
      const targets = nextTargets(
        workouts,
        withGroup.filter((e) => !have.has(e.key)),
        { variantFor: (key) => progressionVariant(key, prev.variant) },
      )
      return restoreGroup(rule, prev, withGroup, targets)
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

  // Add a movement to this workout only (see lib/adHocExercise): the plan's
  // across any day, one known from the log, or one typed in. The movement
  // arrives shaped already; this just gives it its sets, prefilled with one
  // weight and rep count across the board.
  const addExercise = useCallback((exercise: PlannedExercise, target: { weightLbs: number | null; reps: number }) => {
    setSession((prev) =>
      prev
        ? {
            ...prev,
            adHocExercises: [...(prev.adHocExercises ?? []), exercise],
            exercises: [
              ...prev.exercises,
              {
                exercise: exercise.key,
                sets: Array.from({ length: exercise.sets }, (_, i) => ({
                  setNumber: i + 1,
                  weightLbs: target.weightLbs,
                  reps: target.reps,
                  done: false,
                })),
              },
            ],
          }
        : prev,
    )
  }, [])

  // Keep the order and the circuits the checklist was dragged into (see
  // lib/arrangement). Held on the session, so it's saved with it and a reload
  // mid-workout comes back to the same rotation.
  const arrange = useCallback((arrangement: Arrangement | null) => {
    setSession((prev) => (prev && (prev.arrangement ?? null) !== arrangement ? { ...prev, arrangement } : prev))
  }, [])

  const updateSet = useCallback(
    // `alone` writes this set and nothing else: a side whose numbers were split
    // from its other side's on purpose ("sides differ"), where carrying the number
    // across is exactly what isn't wanted.
    (exKey: string, index: number, patch: Partial<SetLog>, opts?: { alone?: boolean }) => {
      mutateExercise(exKey, (sets) => sets.map((s, i) => (i === index ? { ...s, ...patch } : s)))
      if (opts?.alone) return
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

  return { session, start, expandToFull, restoreRested, addSet, addExercise, arrange, updateSet, carrySet, removeSet, clear }
}
