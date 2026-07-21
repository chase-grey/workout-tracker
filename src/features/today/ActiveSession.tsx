import { useEffect, useMemo, useState } from 'react'
import { MdCheckCircle, MdChevronRight, MdRadioButtonUnchecked } from 'react-icons/md'
import type { WorkoutSession } from '../../types'
import { useData } from '../../store/DataContext'
import { nextTarget, type Target } from '../../lib/progression'
import { formatDuration, remainingSecs, WORK_PER_SET_SEC } from '../../lib/estimate'
import { toISODate } from '../../lib/dates'
import { storage } from '../../services/storage'
import { useActiveSession } from './useActiveSession'
import { ExerciseCard } from './ExerciseCard'
import { RestTimer } from '../../components/RestTimer'
import { PauseOverlay } from '../../components/PauseOverlay'
import { KebabMenu } from '../../components/KebabMenu'

type Props = {
  session: WorkoutSession
  controls: ReturnType<typeof useActiveSession>
  onFinish: (s: WorkoutSession) => void
  onSkip: () => void
}

export function ActiveSession({ session, controls, onFinish, onSkip }: Props) {
  const { plan, workouts } = useData()
  const [rest, setRest] = useState<number | null>(null)
  const [current, setCurrent] = useState(() => storage.loadActiveStep())
  const [showList, setShowList] = useState(false)
  const [paused, setPaused] = useState(false)
  // Learned session durations are device-local and only change on finish (which
  // unmounts this view), so reading once at mount is enough.
  const [durations] = useState(() => storage.loadDurations())

  const day = plan[session.dayType]
  const exercises = day.exercises
  const N = exercises.length
  const safeCurrent = Math.min(Math.max(0, current), N - 1)
  const planned = exercises[safeCurrent]

  useEffect(() => {
    storage.saveActiveStep(safeCurrent)
  }, [safeCurrent])

  const target: Target | undefined = useMemo(
    () =>
      planned
        ? nextTarget(workouts, planned.key, {
            repMin: planned.repMin,
            repMax: planned.repMax,
            bodyweight: planned.bodyweight,
            increment: planned.increment,
          })
        : undefined,
    [planned, workouts],
  )

  const logFor = (key: string) => session.exercises.find((e) => e.exercise === key)
  const doneCount = (key: string) => logFor(key)?.sets.filter((s) => s.done && s.reps > 0).length ?? 0
  const isComplete = (key: string) => {
    const log = logFor(key)
    return !!log && log.sets.length > 0 && log.sets.every((s) => s.done && s.reps > 0)
  }

  const totals = useMemo(() => {
    let done = 0
    let all = 0
    for (const e of exercises) {
      done += doneCount(e.key)
      all += e.sets
    }
    return { done, all }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises, session])

  const timeLeft = useMemo(() => {
    const fallbackItems = exercises.slice(safeCurrent).map((e) => ({
      remainingSets: Math.max(0, e.sets - doneCount(e.key)),
      workSec: WORK_PER_SET_SEC,
      restSec: e.restSec,
    }))
    return remainingSecs({
      history: durations,
      dayType: session.dayType,
      doneSets: totals.done,
      totalSets: totals.all,
      fallbackItems,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises, safeCurrent, session, durations, totals])

  const log = logFor(planned.key)

  const setExerciseComplete = (key: string, complete: boolean) => {
    const l = logFor(key)
    if (!l) return
    l.sets.forEach((_, i) => controls.updateSet(key, i, { done: complete }))
  }

  const finish = () => {
    if (session.startedAt) {
      storage.recordDuration({
        date: toISODate(new Date()),
        dayType: session.dayType,
        seconds: (Date.now() - new Date(session.startedAt).getTime()) / 1000,
      })
    }
    const cleaned: WorkoutSession = {
      ...session,
      exercises: session.exercises
        .map((ex) => ({ ...ex, sets: ex.sets.filter((s) => s.done && s.reps > 0) }))
        .filter((ex) => ex.sets.length > 0),
    }
    onFinish(cleaned)
  }

  const atLast = safeCurrent >= N - 1

  return (
    <div className="flex flex-col gap-3 pb-6">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{day.label}</h2>
          <p className="text-sm text-neutral-500">
            Exercise {safeCurrent + 1} of {N} · {formatDuration(timeLeft)} left
          </p>
        </div>
        <KebabMenu
          items={[
            { label: 'Pause workout', onClick: () => setPaused(true) },
            { label: 'Workout checklist', onClick: () => setShowList(true) },
            { label: 'Skip logging details (mark done)', onClick: onSkip },
            { label: 'Finish workout now', onClick: finish },
            {
              label: 'Discard workout',
              danger: true,
              onClick: () => {
                if (confirm('Discard this in-progress workout?')) controls.clear()
              },
            },
          ]}
        />
      </header>

      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${totals.all ? (totals.done / totals.all) * 100 : 0}%` }}
        />
      </div>

      <p className="px-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {planned.group}
      </p>

      {log && (
        <ExerciseCard
          planned={planned}
          target={target}
          log={log}
          onAddSet={() => controls.addSet(planned.key, target)}
          onUpdateSet={(i, patch) => controls.updateSet(planned.key, i, patch)}
          onRemoveSet={(i) => controls.removeSet(planned.key, i)}
          onSetNotes={(notes) => controls.setNotes(planned.key, notes)}
          onRest={(sec) => setRest(sec)}
        />
      )}

      {atLast ? (
        <button
          onClick={finish}
          className="mt-1 min-h-[52px] rounded-2xl bg-accent text-lg font-bold text-black active:opacity-80"
        >
          Finish workout
        </button>
      ) : (
        <button
          onClick={() => setCurrent(safeCurrent + 1)}
          className="mt-1 flex min-h-[52px] items-center justify-center gap-1 rounded-2xl bg-accent text-lg font-bold text-black active:opacity-80"
        >
          Next exercise <MdChevronRight className="text-2xl" aria-hidden />
        </button>
      )}

      {rest != null && <RestTimer seconds={rest} onClose={() => setRest(null)} />}

      {paused && <PauseOverlay label="Workout paused" onResume={() => setPaused(false)} />}

      {showList && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={() => setShowList(false)}>
          <div
            className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <h3 className="mb-1 text-lg font-bold">Workout checklist</h3>
            <p className="mb-3 text-xs text-neutral-500">Tap a name to jump; tap the circle to mark done.</p>
            <div className="flex flex-col gap-1">
              {exercises.map((e, i) => {
                const complete = isComplete(e.key)
                return (
                  <div
                    key={e.key}
                    className={`flex items-center gap-2 rounded-xl px-2 ${i === safeCurrent ? 'bg-surface-2' : ''}`}
                  >
                    <button
                      onClick={() => {
                        setCurrent(i)
                        setShowList(false)
                      }}
                      className="flex-1 py-3 text-left active:opacity-70"
                    >
                      <span className="text-[10px] uppercase tracking-wide text-neutral-500">{e.group}</span>
                      <span className="block font-medium">{e.name}</span>
                      <span className="text-xs text-neutral-500 tabular-nums">
                        {doneCount(e.key)}/{e.sets} sets
                      </span>
                    </button>
                    <button
                      onClick={() => setExerciseComplete(e.key, !complete)}
                      aria-label={complete ? 'mark incomplete' : 'mark complete'}
                      className="p-2 text-2xl"
                    >
                      {complete ? (
                        <MdCheckCircle className="text-accent-2" aria-hidden />
                      ) : (
                        <MdRadioButtonUnchecked className="text-neutral-600" aria-hidden />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
