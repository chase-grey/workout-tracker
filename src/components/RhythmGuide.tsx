import { useEffect, useMemo, useRef, useState } from 'react'
import { parseTempo, phaseScales } from '../lib/tempo'

/**
 * An abstract, nature-inspired rhythm animation that paces a stretch's tempo
 * (like a breathing square). A shape expands/contracts through the tempo phases,
 * and a live countdown plus rep counter track where you are in the set.
 * A random visual variant is chosen per mount, so it varies for each stretch.
 */
const VARIANTS = ['orb', 'square', 'rings', 'tide'] as const
type Variant = (typeof VARIANTS)[number]

// Remembered across mounts (each set remounts the guide) so we never show the
// same shape twice in a row — the animation reliably rotates through all four.
let lastVariant: Variant | null = null
function pickVariant(): Variant {
  const pool = VARIANTS.filter((v) => v !== lastVariant)
  lastVariant = pool[Math.floor(Math.random() * pool.length)]
  return lastVariant
}

function Shape({ variant, scale }: { variant: Variant; scale: number }) {
  // Scale is interpolated per animation frame by the parent, so the shape needs
  // no CSS transition of its own — that would only lag behind the live value.
  switch (variant) {
    case 'square':
      return (
        <div
          className="absolute h-[73%] w-[73%] rounded-[14%] bg-accent-bright/40 ring-1 ring-accent-bright/70"
          style={{ transform: `scale(${scale}) rotate(${(scale - 0.55) * 25}deg)` }}
        />
      )
    case 'rings':
      return (
        <>
          {[73, 53, 33].map((pct, i) => (
            <div
              key={i}
              className="absolute rounded-full border border-accent-bright/70"
              style={{ width: `${pct}%`, height: `${pct}%`, transform: `scale(${scale})` }}
            />
          ))}
        </>
      )
    case 'tide':
      return (
        <div className="absolute h-[73%] w-[73%] overflow-hidden rounded-full ring-1 ring-accent-bright/70">
          <div className="absolute bottom-0 left-0 w-full bg-accent-bright/40" style={{ height: `${scale * 100}%` }} />
        </div>
      )
    case 'orb':
    default:
      return (
        <div
          className="absolute h-[73%] w-[73%] rounded-full bg-accent-bright/40 ring-1 ring-accent-bright/70"
          style={{ transform: `scale(${scale})` }}
        />
      )
  }
}

/** Smooth ease-in-out so each phase accelerates then settles, like a breath. */
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

export function RhythmGuide({
  tempo,
  reps,
  running = true,
  startRep = 1,
  onRep,
}: {
  tempo: string
  reps?: number
  running?: boolean
  /** Rep to resume counting from — lets a reloaded session pick up where it left off. */
  startRep?: number
  /** Fired as each rep completes, so the caller can persist the count. */
  onRep?: (rep: number) => void
}) {
  const phases = useMemo(() => parseTempo(tempo), [tempo])
  const scales = useMemo(() => phaseScales(phases), [phases])
  const [variant] = useState<Variant>(pickVariant)
  const [idx, setIdx] = useState(0)
  const [rep, setRep] = useState(startRep)
  // The rep count also lives in a ref so the animation loop increments from the
  // latest value without needing `rep` as an effect dependency (which would
  // restart the in-flight phase every rep).
  const repRef = useRef(startRep)
  /** How far (0–1) we are through the current phase, driven per animation frame. */
  const [progress, setProgress] = useState(0)
  // Held in a ref for the same reason: an inline callback would otherwise change
  // identity every render and restart the phase timer.
  const onRepRef = useRef(onRep)
  onRepRef.current = onRep

  useEffect(() => {
    // Hold at the very start of the first phase until the set actually begins,
    // so the guide always kicks off from the top of the motion (e.g. the "down"
    // phase descends from standing) rather than mid-cycle.
    if (!running || phases.length === 0) return
    const dur = phases[idx % phases.length].seconds * 1000
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const elapsed = now - start
      if (elapsed >= dur) {
        const next = (idx + 1) % phases.length
        setProgress(0)
        setIdx(next)
        // A full pass through every phase is one rep. Keep counting past the
        // target — the goal is shown for reference, but reps continue until you
        // tap done.
        if (next === 0) {
          repRef.current += 1
          setRep(repRef.current)
          onRepRef.current?.(repRef.current)
        }
      } else {
        setProgress(elapsed / dur)
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [idx, phases, running])

  if (phases.length === 0) return null

  const i = idx % phases.length
  const phase = phases[i]
  // Interpolate from the previous phase's target to this phase's target so the
  // motion flows continuously and the first phase animates from its start point.
  const from = scales[(i - 1 + scales.length) % scales.length]
  const scale = from + (scales[i] - from) * easeInOut(progress)

  return (
    <div className="flex flex-col items-center py-3">
      <div className="relative flex aspect-square w-[min(86vw,50vh,30rem)] items-center justify-center">
        <Shape variant={variant} scale={scale} />
      </div>
      <div className="mt-2 text-center">
        {/* Rep count is the primary tracker now that the seconds readout is gone
            — the shape's motion paces each phase, so keep the number big + bright. */}
        <div className="text-5xl font-bold tabular-nums leading-tight text-accent-bright">
          Rep {rep}
          {reps ? <span className="text-3xl text-neutral-400"> / {reps}</span> : ''}
        </div>
        <div className="mt-1 text-2xl font-semibold capitalize text-white">{phase.label}</div>
      </div>
    </div>
  )
}
