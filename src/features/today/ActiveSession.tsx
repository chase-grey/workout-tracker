import { useMemo, useState } from 'react'
import type { WorkoutSession } from '../../types'
import { useData } from '../../store/DataContext'
import { nextTarget, type Target } from '../../lib/progression'
import { useActiveSession } from './useActiveSession'
import { ExerciseCard } from './ExerciseCard'
import { RestTimer } from '../../components/RestTimer'

type Props = {
  session: WorkoutSession
  controls: ReturnType<typeof useActiveSession>
  onFinish: (s: WorkoutSession) => void
}

export function ActiveSession({ session, controls, onFinish }: Props) {
  const { plan, workouts } = useData()
  const [rest, setRest] = useState<number | null>(null)
  const day = plan[session.dayType]

  // Group planned exercises by their UI header, preserving plan order.
  const groups = useMemo(() => {
    const map = new Map<string, typeof day.exercises>()
    for (const ex of day.exercises) {
      const list = map.get(ex.group) ?? []
      list.push(ex)
      map.set(ex.group, list)
    }
    return [...map.entries()]
  }, [day])

  // Progression targets per exercise (from history) — shown as the goal to beat.
  const targets = useMemo(() => {
    const m = new Map<string, Target>()
    for (const e of day.exercises) {
      m.set(
        e.key,
        nextTarget(workouts, e.key, {
          repMin: e.repMin,
          repMax: e.repMax,
          bodyweight: e.bodyweight,
          increment: e.increment,
        }),
      )
    }
    return m
  }, [day, workouts])

  const doneSets = session.exercises.reduce(
    (n, ex) => n + ex.sets.filter((s) => s.done && s.reps > 0).length,
    0,
  )

  const finish = () => {
    // Save only the sets the user actually completed.
    const cleaned: WorkoutSession = {
      ...session,
      exercises: session.exercises
        .map((ex) => ({ ...ex, sets: ex.sets.filter((s) => s.done && s.reps > 0) }))
        .filter((ex) => ex.sets.length > 0),
    }
    onFinish(cleaned)
  }

  return (
    <div className="flex flex-col gap-4 pb-28">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{day.label}</h2>
          <p className="text-sm text-neutral-500">
            {session.date} · {doneSets} set{doneSets === 1 ? '' : 's'} done
          </p>
        </div>
        <button
          onClick={() => {
            if (confirm('Discard this in-progress workout?')) controls.clear()
          }}
          className="min-h-[44px] rounded-xl px-3 text-sm text-neutral-500"
        >
          Discard
        </button>
      </header>

      {groups.map(([group, exercises]) => (
        <section key={group} className="flex flex-col gap-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            {group}
          </h3>
          {exercises.map((planned) => {
            const log = session.exercises.find((e) => e.exercise === planned.key)
            if (!log) return null
            return (
              <ExerciseCard
                key={planned.key}
                planned={planned}
                target={targets.get(planned.key)}
                log={log}
                onAddSet={() => controls.addSet(planned.key, targets.get(planned.key))}
                onUpdateSet={(i, patch) => controls.updateSet(planned.key, i, patch)}
                onRemoveSet={(i) => controls.removeSet(planned.key, i)}
                onSetNotes={(notes) => controls.setNotes(planned.key, notes)}
                onRest={(sec) => setRest(sec)}
              />
            )
          })}
        </section>
      ))}

      <button
        onClick={finish}
        disabled={doneSets === 0}
        className="min-h-[52px] rounded-2xl bg-accent text-lg font-bold text-black disabled:opacity-30"
      >
        Finish workout
      </button>

      {rest != null && <RestTimer seconds={rest} onClose={() => setRest(null)} />}
    </div>
  )
}
