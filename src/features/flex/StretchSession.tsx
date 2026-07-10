import { useMemo, useState } from 'react'
import { MdCheck, MdChevronLeft, MdChevronRight } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { RestTimer } from '../../components/RestTimer'
import { KebabMenu } from '../../components/KebabMenu'
import { estimateSecs, formatDuration } from '../../lib/estimate'
import type { FlexExercise } from '../../config/flexPlan'

type Step = { blockLabel: string; blockNote?: string; ex: FlexExercise; firstInBlock: boolean }
const SEC_PER_REP = 5 // rough working time per stretch rep (tempo + hold)

/** Guided, one-stretch-at-a-time flow for a side-splits session (from Today). */
export function StretchSession({ onClose }: { onClose: () => void }) {
  const { flexPlan, logFlex } = useData()
  const [current, setCurrent] = useState(0)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [rest, setRest] = useState<number | null>(null)
  const [showJump, setShowJump] = useState(false)

  const steps = useMemo<Step[]>(() => {
    const out: Step[] = []
    for (const block of flexPlan) {
      block.exercises.forEach((ex, i) =>
        out.push({ blockLabel: block.label, blockNote: block.note, ex, firstInBlock: i === 0 }),
      )
    }
    return out
  }, [flexPlan])

  const N = steps.length
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

  const step = steps[Math.min(current, N - 1)]
  const doneForStep = (i: number, maxSets: number) => {
    let n = 0
    for (let s = 0; s < maxSets; s++) if (done.has(`${i}:${s}`)) n++
    return n
  }

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
    const items = steps.slice(current).map((s, idx) => ({
      remainingSets: s.ex.maxSets - doneForStep(current + idx, s.ex.maxSets),
      workSec: s.ex.reps * SEC_PER_REP,
      restSec: s.ex.restSec,
    }))
    return estimateSecs(items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, current, done])

  const toggle = (setIdx: number) => {
    const id = `${current}:${setIdx}`
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

  const finish = () => {
    void logFlex(null, 'Stretch routine')
    onClose()
  }

  const atLast = current >= N - 1

  return (
    <div className="flex min-h-[100dvh] flex-col pb-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Stretch session</h2>
          <p className="text-sm text-neutral-500">
            Stretch {current + 1} of {N} · {formatDuration(timeLeft)} left
          </p>
        </div>
        <KebabMenu
          items={[
            { label: 'Jump to stretch…', onClick: () => setShowJump(true) },
            ...(atLast ? [] : [{ label: 'Skip this stretch', onClick: () => setCurrent((c) => c + 1) }]),
            { label: 'Finish & log session', onClick: finish },
            { label: 'Exit without logging', danger: true, onClick: onClose },
          ]}
        />
      </header>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${totals.total ? (totals.done / totals.total) * 100 : 0}%` }}
        />
      </div>

      <p className="mt-3 px-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {step.blockLabel}
      </p>
      {step.blockNote && <p className="px-1 text-xs text-neutral-500">{step.blockNote}</p>}

      <div className="mt-2 flex-1">
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
              const isDone = done.has(`${current}:${i}`)
              return (
                <button
                  key={i}
                  onClick={() => toggle(i)}
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
            Finish &amp; log session
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
            <h3 className="mb-3 text-lg font-bold">Jump to stretch</h3>
            <div className="flex flex-col gap-1">
              {steps.map((s, i) => (
                <button
                  key={`${s.ex.key}-${i}`}
                  onClick={() => {
                    setCurrent(i)
                    setShowJump(false)
                  }}
                  className={`flex items-center justify-between rounded-xl px-3 py-3 text-left ${
                    i === current ? 'bg-surface-2' : 'active:bg-surface-2'
                  }`}
                >
                  <span>
                    <span className="text-[10px] uppercase tracking-wide text-neutral-500">{s.blockLabel}</span>
                    <span className="block font-medium">{s.ex.name}</span>
                  </span>
                  <span className="text-xs text-neutral-500 tabular-nums">
                    {doneForStep(i, s.ex.maxSets)}/{s.ex.maxSets}
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
