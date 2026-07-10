import { useEffect, useMemo, useState } from 'react'
import { parseTempo, phaseScales } from '../lib/tempo'

/**
 * An abstract, nature-inspired rhythm animation that paces a stretch's tempo
 * (like a breathing square). A shape expands/contracts through the tempo phases.
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
          className="absolute h-44 w-44 rounded-[2rem] bg-accent/25 ring-1 ring-accent/40"
          style={{ transition: `transform ${secs}s ease-in-out`, transform: `scale(${scale}) rotate(${(scale - 0.55) * 25}deg)` }}
        />
      )
    case 'rings':
      return (
        <>
          {[11, 8, 5].map((rem, i) => (
            <div
              key={i}
              className="absolute rounded-full border border-accent/40"
              style={{
                width: `${rem}rem`,
                height: `${rem}rem`,
                transition: `transform ${secs}s ease-in-out`,
                transform: `scale(${scale})`,
              }}
            />
          ))}
        </>
      )
    case 'tide':
      return (
        <div className="absolute h-44 w-44 overflow-hidden rounded-full ring-1 ring-accent/40">
          <div
            className="absolute bottom-0 left-0 w-full bg-accent/30"
            style={{ height: `${scale * 100}%`, transition: `height ${secs}s ease-in-out` }}
          />
        </div>
      )
    case 'orb':
    default:
      return <div className="absolute h-44 w-44 rounded-full bg-accent/25 ring-1 ring-accent/40" style={base} />
  }
}

export function RhythmGuide({ tempo }: { tempo: string }) {
  const phases = useMemo(() => parseTempo(tempo), [tempo])
  const scales = useMemo(() => phaseScales(phases), [phases])
  const [variant] = useState<Variant>(() => VARIANTS[Math.floor(Math.random() * VARIANTS.length)])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (phases.length === 0) return
    const p = phases[idx % phases.length]
    const t = setTimeout(() => setIdx((i) => (i + 1) % phases.length), p.seconds * 1000)
    return () => clearTimeout(t)
  }, [idx, phases])

  if (phases.length === 0) return null

  const i = idx % phases.length
  const phase = phases[i]
  const scale = scales[i]

  return (
    <div className="flex items-center justify-center py-2">
      <div className="relative flex h-60 w-60 items-center justify-center">
        <Shape variant={variant} scale={scale} secs={phase.seconds} />
        <div className="relative text-center">
          <div className="text-xl font-semibold capitalize text-white">{phase.label}</div>
          <div className="mt-0.5 text-sm text-neutral-400">{phase.seconds}s</div>
        </div>
      </div>
    </div>
  )
}
