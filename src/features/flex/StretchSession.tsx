import { useEffect, useMemo, useState } from 'react'
import { MdCheck, MdCheckCircle, MdChevronRight, MdRadioButtonUnchecked } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { RestTimer } from '../../components/RestTimer'
import { KebabMenu } from '../../components/KebabMenu'
import { estimateSecs, formatDuration } from '../../lib/estimate'
import { storage } from '../../services/storage'
import type { FlexExercise } from '../../config/flexPlan'

type Step = { blockLabel: string; blockNote?: string; ex: FlexExercise }
const SEC_PER_REP = 5

export function StretchSession({ onClose }: { onClose: () => void }) {
  const { flexPlan, logFlex } = useData()
  const [current, setCurrent] = useState(() => storage.loadStretch()?.step ?? 0)
  const [done, setDone] = useState<Set<string>>(() => new Set(storage.loadStretch()?.done ?? []))
  const [rest, setRest] = useState<number | null>(null)
  const [showList, setShowList] = useState(false)

  useEffect(() => {
    storage.saveStretch({ step: current, done: [...done] })
  }, [current, done])

  const steps = useMemo<Step[]>(() => {
    const out: Step[] = []
    for (const block of flexPlan) {
      block.exercises.forEach((ex) => out.push({ blockLabel: block.label, blockNote: block.note, ex }))
    }
    return out
  }, [flexPlan])

  const N = steps.length
  const safeCurrent = N ? Math.min(Math.max(0, current), N - 1) : 0

  const doneForStep = (i: number, maxSets: number) => {
    let n = 0
    for (let s = 0; s < maxSets; s++) if (done.has(`${i}:${s}`)) n++
    return n
  }
  const isStepComplete = (i: number, maxSets: number) => maxSets > 0 && doneForStep(i, maxSets) === maxSets

  const totals = useMemo(() => {
    let d = 0
    let total = 0
    steps.forEach((s, i) => {
      total += s.ex.maxSets
      d += doneForStep(i, s.ex.maxSets)
    })
    return { done: d, total }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, done])

  const timeLeft = useMemo(() => {
    const items = steps.slice(safeCurrent).map((s, idx) => ({
      remainingSets: s.ex.maxSets - doneForStep(safeCurrent + idx, s.ex.maxSets),
      workSec: s.ex.reps * SEC_PER_REP,
      restSec: s.ex.restSec,
    }))
    return estimateSecs(items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, safeCurrent, done])

  if (N === 0) {
    return (
      <div className="flex flex-col gap-4 pb-24 pt-16 text-center">
        <p className="text-neutral-500">No stretches in your routine. Add some in Settings → Edit stretch routine.</p>
        <button onClick={onClose} className="min-h-[44px] rounded-xl bg-surface font-medium">
          Back
        </button>
      </div>
    )
  }

  const step = steps[safeCurrent]

  const toggleSet = (setIdx: number) => {
    const id = `${safeCurrent}:${setIdx}`
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else {
        next.add(id)
        setRest(step.ex.restSec)
      }
      return next
    })
  }

  const setStepComplete = (i: number, maxSets: number, complete: boolean) => {
    setDone((prev) => {
      const next = new Set(prev)
      for (let s = 0; s < maxSets; s++) {
        const id = `${i}:${s}`
        if (complete) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const finish = () => {
    void logFlex(null, 'Stretch routine')
    onClose()
  }

  const atLast = safeCurrent >= N - 1

  return (
    <div className="flex flex-col gap-3 pb-6">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Stretch session</h2>
          <p className="text-sm text-neutral-500">
            Stretch {safeCurrent + 1} of {N} · {formatDuration(timeLeft)} left
          </p>
        </div>
        <KebabMenu
          items={[
            { label: 'Routine checklist', onClick: () => setShowList(true) },
            { label: 'Finish & log session', onClick: finish },
            { label: 'Exit without logging', danger: true, onClick: onClose },
          ]}
        />
      </header>

      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${totals.total ? (totals.done / totals.total) * 100 : 0}%` }}
        />
      </div>

      <p className="px-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {step.blockLabel}
      </p>
      {step.blockNote && <p className="px-1 text-xs text-neutral-500">{step.blockNote}</p>}

      <div className="rounded-2xl bg-surface p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold">{step.ex.name}</h3>
          <span className="shrink-0 text-sm text-neutral-500">
            {step.ex.sets}×{step.ex.reps}
          </span>
        </div>
        <p className="mt-1 text-sm text-accent-2">{step.ex.tempo}</p>
        <p className="text-xs text-neutral-500">rest {step.ex.restSec}s between sets</p>

        <p className="mt-4 text-xs uppercase tracking-wide text-neutral-500">Mark each set done</p>
        <div className="mt-2 flex gap-2">
          {Array.from({ length: step.ex.maxSets }, (_, i) => {
            const isDone = done.has(`${safeCurrent}:${i}`)
            return (
              <button
                key={i}
                onClick={() => toggleSet(i)}
                className={`flex min-h-[52px] flex-1 items-center justify-center rounded-xl text-lg font-semibold ${
                  isDone ? 'bg-accent-2 text-black' : 'bg-surface-2 text-neutral-400'
                }`}
              >
                {isDone ? <MdCheck aria-hidden /> : i + 1}
              </button>
            )
          })}
        </div>
      </div>

      {atLast ? (
        <button
          onClick={finish}
          className="mt-1 min-h-[52px] rounded-2xl bg-accent text-lg font-bold text-black active:opacity-80"
        >
          Finish &amp; log session
        </button>
      ) : (
        <button
          onClick={() => setCurrent(safeCurrent + 1)}
          className="mt-1 flex min-h-[52px] items-center justify-center gap-1 rounded-2xl bg-accent text-lg font-bold text-black active:opacity-80"
        >
          Next stretch <MdChevronRight className="text-2xl" aria-hidden />
        </button>
      )}

      {rest != null && <RestTimer seconds={rest} onClose={() => setRest(null)} />}

      {showList && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={() => setShowList(false)}>
          <div
            className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <h3 className="mb-1 text-lg font-bold">Routine checklist</h3>
            <p className="mb-3 text-xs text-neutral-500">Tap a name to jump; tap the circle to mark done.</p>
            <div className="flex flex-col gap-1">
              {steps.map((s, i) => {
                const complete = isStepComplete(i, s.ex.maxSets)
                return (
                  <div
                    key={`${s.ex.key}-${i}`}
                    className={`flex items-center gap-2 rounded-xl px-2 ${i === safeCurrent ? 'bg-surface-2' : ''}`}
                  >
                    <button
                      onClick={() => {
                        setCurrent(i)
                        setShowList(false)
                      }}
                      className="flex-1 py-3 text-left active:opacity-70"
                    >
                      <span className="text-[10px] uppercase tracking-wide text-neutral-500">{s.blockLabel}</span>
                      <span className="block font-medium">{s.ex.name}</span>
                      <span className="text-xs text-neutral-500 tabular-nums">
                        {doneForStep(i, s.ex.maxSets)}/{s.ex.maxSets} sets
                      </span>
                    </button>
                    <button
                      onClick={() => setStepComplete(i, s.ex.maxSets, !complete)}
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
