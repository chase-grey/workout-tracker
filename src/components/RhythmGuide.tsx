import { useEffect, useMemo, useState } from 'react'
import { parseTempo, phaseScales } from '../lib/tempo'

/**
 * An abstract, nature-inspired rhythm animation that paces a stretch's tempo
 * (like a breathing square). A shape expands/contracts through the tempo phases,
 * and a live countdown plus rep counter track where you are in the set.
 * A random visual variant is chosen per mount, so it varies for each stretch.
 */
const VARIANTS = ['orb', 'square', 'rings', 'tide'] as const
type Variant = (typeof VARIANTS)[number]

function Shape({ variant, scale, secs }: { variant: Variant; scale: number; secs: number }) {
  const base = { transition: `transform ${secs}s ease-in-out`, transform: `scale(${scale})` }
  switch (variant) {
    case 'square':
      return (
        <div
          className="absolute h-[73%] w-[73%] rounded-[14%] bg-accent-2/25 ring-1 ring-accent-2/40"
          style={{ transition: `transform ${secs}s ease-in-out`, transform: `scale(${scale}) rotate(${(scale - 0.55) * 25}deg)` }}
        />
      )
    case 'rings':
      return (
        <>
          {[73, 53, 33].map((pct, i) => (
            <div
              key={i}
              className="absolute rounded-full border border-accent-2/40"
              style={{
                width: `${pct}%`,
                height: `${pct}%`,
                transition: `transform ${secs}s ease-in-out`,
                transform: `scale(${scale})`,
              }}
            />
          ))}
        </>
      )
    case 'tide':
      return (
        <div className="absolute h-[73%] w-[73%] overflow-hidden rounded-full ring-1 ring-accent-2/40">
          <div
            className="absolute bottom-0 left-0 w-full bg-accent-2/30"
            style={{ height: `${scale * 100}%`, transition: `height ${secs}s ease-in-out` }}
          />
        </div>
      )
    case 'orb':
    default:
      return <div className="absolute h-[73%] w-[73%] rounded-full bg-accent-2/25 ring-1 ring-accent-2/40" style={base} />
  }
}

export function RhythmGuide({ tempo, reps }: { tempo: string; reps?: number }) {
  const phases = useMemo(() => parseTempo(tempo), [tempo])
  const scales = useMemo(() => phaseScales(phases), [phases])
  const [variant] = useState<Variant>(() => VARIANTS[Math.floor(Math.random() * VARIANTS.length)])
  const [idx, setIdx] = useState(0)
  const [rep, setRep] = useState(1)
  /** How far (0–1) we are through the current phase, driven per animation frame. */
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (phases.length === 0) return
    const dur = phases[idx % phases.length].seconds * 1000
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const elapsed = now - start
      setProgress(Math.min(1, elapsed / dur))
      if (elapsed >= dur) {
        const next = (idx + 1) % phases.length
        setIdx(next)
        // A full pass through every phase is one rep. Keep counting past the
        // target — the goal is shown for reference, but reps continue until you
        // tap done.
        if (next === 0) setRep((r) => r + 1)
      } else {
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [idx, phases])

  if (phases.length === 0) return null

  const i = idx % phases.length
  const phase = phases[i]
  const scale = scales[i]
  const remaining = Math.max(1, Math.ceil(phase.seconds * (1 - progress)))

  return (
    <div className="flex items-center justify-center py-3">
      <div className="relative flex aspect-square w-[min(86vw,30rem)] items-center justify-center">
        <Shape variant={variant} scale={scale} secs={phase.seconds} />
        <div className="relative text-center">
          <div className="text-sm font-medium uppercase tracking-wider text-neutral-400">
            Rep {rep}
            {reps ? ` of ${reps}` : ''}
          </div>
          <div className="text-2xl font-semibold capitalize text-white">{phase.label}</div>
          <div className="text-6xl font-bold tabular-nums leading-tight text-accent-2">{remaining}</div>
        </div>
      </div>
    </div>
  )
}
