import { useMemo, useState } from 'react'
import { MdChevronLeft, MdChevronRight } from 'react-icons/md'
import type { WorkoutSession } from '../../types'
import { useData } from '../../store/DataContext'
import { nextTarget, type Target } from '../../lib/progression'
import { estimateSecs, formatDuration, WORK_PER_SET_SEC } from '../../lib/estimate'
import { useActiveSession } from './useActiveSession'
import { ExerciseCard } from './ExerciseCard'
import { RestTimer } from '../../components/RestTimer'
import { KebabMenu } from '../../components/KebabMenu'

type Props = {
  session: WorkoutSession
  controls: ReturnType<typeof useActiveSession>
  onFinish: (s: WorkoutSession) => void
}

export function ActiveSession({ session, controls, onFinish }: Props) {
  const { plan, workouts } = useData()
  const [rest, setRest] = useState<number | null>(null)
  const [current, setCurrent] = useState(0)
  const [showJump, setShowJump] = useState(false)

  const day = plan[session.dayType]
  const exercises = day.exercises
  const N = exercises.length
  const planned = exercises[Math.min(current, N - 1)]

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

  const doneCount = (key: string) => {
    const log = session.exercises.find((e) => e.exercise === key)
    return log ? log.sets.filter((s) => s.done && s.reps > 0).length : 0
  }

  const totals = useMemo(() => {
    let done = 0
    let planned = 0
    for (const e of exercises) {
      done += doneCount(e.key)
      planned += e.sets
    }
    return { done, planned }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises, session])

  const timeLeft = useMemo(() => {
    const items = exercises.slice(current).map((e) => ({
      remainingSets: Math.max(0, e.sets - doneCount(e.key)),
      workSec: WORK_PER_SET_SEC,
      restSec: e.restSec,
    }))
    return estimateSecs(items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises, current, session])

  const log = session.exercises.find((e) => e.exercise === planned.key)

  const finish = () => {
    const cleaned: WorkoutSession = {
      ...session,
      exercises: session.exercises
        .map((ex) => ({ ...ex, sets: ex.sets.filter((s) => s.done && s.reps > 0) }))
        .filter((ex) => ex.sets.length > 0),
    }
    onFinish(cleaned)
  }

  const atLast = current >= N - 1

  return (
    <div className="flex min-h-[100dvh] flex-col pb-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{day.label}</h2>
          <p className="text-sm text-neutral-500">
            Exercise {current + 1} of {N} · {formatDuration(timeLeft)} left
          </p>
        </div>
        <KebabMenu
          items={[
            { label: 'Jump to exercise…', onClick: () => setShowJump(true) },
            ...(atLast ? [] : [{ label: 'Skip this exercise', onClick: () => setCurrent((c) => c + 1) }]),
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

      {/* overall set-completion progress */}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${totals.planned ? (totals.done / totals.planned) * 100 : 0}%` }}
        />
      </div>

      <p className="mt-3 px-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {planned.group}
      </p>

      <div className="mt-1 flex-1">
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
      </div>

      <div className="sticky bottom-0 mt-4 flex gap-2 bg-bg pt-2">
        <button
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
          className="flex min-h-[52px] items-center justify-center rounded-2xl bg-surface px-4 font-semibold disabled:opacity-30"
        >
          <MdChevronLeft className="text-2xl" aria-hidden />
        </button>
        {atLast ? (
          <button
            onClick={finish}
            className="min-h-[52px] flex-1 rounded-2xl bg-accent text-lg font-bold text-black active:opacity-80"
          >
            Finish workout
          </button>
        ) : (
          <button
            onClick={() => setCurrent((c) => Math.min(N - 1, c + 1))}
            className="flex min-h-[52px] flex-1 items-center justify-center gap-1 rounded-2xl bg-accent text-lg font-bold text-black active:opacity-80"
          >
            Next <MdChevronRight className="text-2xl" aria-hidden />
          </button>
        )}
      </div>

      {rest != null && <RestTimer seconds={rest} onClose={() => setRest(null)} />}

      {showJump && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={() => setShowJump(false)}>
          <div
            className="max-h-[70vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <h3 className="mb-3 text-lg font-bold">Jump to exercise</h3>
            <div className="flex flex-col gap-1">
              {exercises.map((e, i) => (
                <button
                  key={e.key}
                  onClick={() => {
                    setCurrent(i)
                    setShowJump(false)
                  }}
                  className={`flex items-center justify-between rounded-xl px-3 py-3 text-left ${
                    i === current ? 'bg-surface-2' : 'active:bg-surface-2'
                  }`}
                >
                  <span>
                    <span className="text-[10px] uppercase tracking-wide text-neutral-500">{e.group}</span>
                    <span className="block font-medium">{e.name}</span>
                  </span>
                  <span className="text-xs text-neutral-500 tabular-nums">
                    {doneCount(e.key)}/{e.sets}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
