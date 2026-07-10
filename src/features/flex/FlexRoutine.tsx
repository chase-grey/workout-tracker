import { useState } from 'react'
import { MdCheck } from 'react-icons/md'
import { RestTimer } from '../../components/RestTimer'
import { useData } from '../../store/DataContext'

/** Guided stretch checklist. Set checkboxes are per-session (not persisted). */
export function FlexRoutine() {
  const { logFlex, flexPlan } = useData()
  const [done, setDone] = useState<Set<string>>(new Set())
  const [rest, setRest] = useState<number | null>(null)
  const [logged, setLogged] = useState(false)

  const toggle = (id: string, restSec: number) => {
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else {
        next.add(id)
        setRest(restSec)
      }
      return next
    })
  }

  const finish = () => {
    void logFlex(null, 'Stretch routine')
    setLogged(true)
    setTimeout(() => setLogged(false), 2000)
    setDone(new Set())
  }

  return (
    <div className="flex flex-col gap-3">
      {flexPlan.map((block) => (
        <div key={block.label} className="rounded-2xl bg-surface p-3">
          <h4 className="text-sm font-semibold text-neutral-300">{block.label}</h4>
          {block.note && <p className="mt-0.5 text-xs text-neutral-500">{block.note}</p>}
          <div className="mt-2 flex flex-col gap-3">
            {block.exercises.map((ex) => (
              <div key={ex.key}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{ex.name}</span>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {ex.sets}×{ex.reps}
                  </span>
                </div>
                <p className="text-xs text-neutral-500">
                  {ex.tempo} · rest {ex.restSec}s
                </p>
                <div className="mt-1 flex gap-2">
                  {Array.from({ length: ex.maxSets }, (_, i) => {
                    const id = `${ex.key}:${i}`
                    const isDone = done.has(id)
                    return (
                      <button
                        key={id}
                        onClick={() => toggle(id, ex.restSec)}
                        aria-label={`set ${i + 1}`}
                        className={`flex min-h-[40px] flex-1 items-center justify-center rounded-lg text-sm ${
                          isDone ? 'bg-accent-2 text-black' : 'bg-surface-2 text-neutral-500'
                        }`}
                      >
                        {isDone ? <MdCheck aria-hidden /> : i + 1}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <button
        onClick={finish}
        className="min-h-[48px] rounded-2xl bg-accent font-bold text-black active:opacity-80"
      >
        {logged ? 'Logged ✓' : 'Log stretch session'}
      </button>

      {rest != null && <RestTimer seconds={rest} onClose={() => setRest(null)} />}
    </div>
  )
}
