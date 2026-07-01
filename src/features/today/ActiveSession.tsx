import { useMemo, useState } from 'react'
import type { WorkoutSession } from '../../types'
import { PLAN } from '../../config/plan'
import { useActiveSession } from './useActiveSession'
import { ExerciseCard } from './ExerciseCard'
import { RestTimer } from '../../components/RestTimer'
import { hasLoggedSets } from '../../lib/session'

type Props = {
  session: WorkoutSession
  controls: ReturnType<typeof useActiveSession>
  onFinish: (s: WorkoutSession) => void
}

export function ActiveSession({ session, controls, onFinish }: Props) {
  const [rest, setRest] = useState<number | null>(null)
  const plan = PLAN[session.dayType]

  // Group planned exercises by their UI header, preserving plan order.
  const groups = useMemo(() => {
    const map = new Map<string, typeof plan.exercises>()
    for (const ex of plan.exercises) {
      const list = map.get(ex.group) ?? []
      list.push(ex)
      map.set(ex.group, list)
    }
    return [...map.entries()]
  }, [plan])

  const totalSets = session.exercises.reduce((n, ex) => n + ex.sets.length, 0)

  const finish = () => {
    // Drop empty sets before saving.
    const cleaned: WorkoutSession = {
      ...session,
      exercises: session.exercises
        .map((ex) => ({ ...ex, sets: ex.sets.filter((s) => s.reps > 0) }))
        .filter((ex) => ex.sets.length > 0),
    }
    onFinish(cleaned)
  }

  return (
    <div className="flex flex-col gap-4 pb-28">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{plan.label}</h2>
          <p className="text-sm text-neutral-500">
            {session.date} · {totalSets} set{totalSets === 1 ? '' : 's'} logged
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
            const log = session.exercises.find((e) => e.exercise === planned.key)!
            return (
              <ExerciseCard
                key={planned.key}
                planned={planned}
                log={log}
                onAddSet={() => controls.addSet(planned.key)}
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
        disabled={!hasLoggedSets(session)}
        className="min-h-[52px] rounded-2xl bg-accent text-lg font-bold text-black disabled:opacity-30"
      >
        Finish workout
      </button>

      {rest != null && <RestTimer seconds={rest} onClose={() => setRest(null)} />}
    </div>
  )
}
