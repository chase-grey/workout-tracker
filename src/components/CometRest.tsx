import { useEffect, useId, useRef, useState } from 'react'
import { clamp, earthFragments, IMPACT_AT } from '../lib/comet'
import { usePrefersReducedMotion } from '../lib/useReducedMotion'

const STARS = Array.from({ length: 38 }, (_, i) => ({
  x: (i * 37.71) % 100, y: (i * 61.13) % 100, size: 0.12 + (i % 3) * 0.08,
}))

export function CometRest({ fraction, earth = false }: { fraction: number; earth?: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(140)
  const id = useId().replace(/\W/g, '')
  const reduced = usePrefersReducedMotion()
  useEffect(() => {
    const node = host.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setHeight(100 * entry.contentRect.height / entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const elapsed = 1 - clamp(fraction)
  const radius = Math.min(100, height) * 0.17
  const approach = clamp(elapsed / IMPACT_AT)
  const debris = clamp((elapsed - IMPACT_AT) / (1 - IMPACT_AT))
  const impacted = earth && elapsed >= IMPACT_AT
  // Accelerating approach ends on the planet's near surface, along the tail's axis.
  const travel = approach * approach
  const x = earth ? -8 + travel * (58 - radius * 0.92) : 22 + elapsed * 52
  const y = earth ? height / 2 - 24 + travel * (24 - radius * 0.39) : height * 0.44 + elapsed * 12
  const core = earth ? 1 : Math.pow(clamp(1 - elapsed), 0.65)
  const planet = <>
    <circle r={radius} fill={`url(#${id}-ocean)`} />
    <path d={`M ${-radius * .8} ${-radius * .35} l ${radius * .3} ${-radius * .4} ${radius * .4} ${radius * .2} ${-radius * .12} ${radius * .4} ${radius * .2} ${radius * .2} ${-radius * .15} ${radius * .55} ${-radius * .23} ${-radius * .35} z M ${radius * .35} ${-radius * .65} l ${radius * .45} ${radius * .4} ${-radius * .2} ${radius * .3} ${-radius * .35} ${-radius * .1} z`}
      fill="currentColor" opacity=".85" />
    <ellipse cy={-radius * .7} rx={radius * .48} ry={radius * .08} fill="#effff6" opacity=".45" />
  </>

  return <div ref={host} className="pointer-events-none absolute inset-y-0 -left-6 -right-6 overflow-hidden text-accent-bright" aria-hidden>
    <svg viewBox={`0 0 100 ${height}`} className="absolute inset-0 h-full w-full">
      <defs>
        <radialGradient id={`${id}-ocean`} cx="30%" cy="28%" r="75%">
          <stop stopColor="#65cbb3" /><stop offset=".55" stopColor="#187462" /><stop offset="1" stopColor="#032a25" />
        </radialGradient>
        <radialGradient id={`${id}-glow`}>
          <stop stopColor="#effff6" stopOpacity=".85" /><stop offset=".28" stopColor="currentColor" stopOpacity=".45" /><stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-tail`}>
          <stop stopColor="currentColor" stopOpacity="0" /><stop offset="1" stopColor="currentColor" stopOpacity=".85" />
        </linearGradient>
        {earthFragments(100, height).map((bit, i) => <clipPath key={i} id={`${id}-bit-${i}`}><polygon points={bit.points} /></clipPath>)}
      </defs>
      <g opacity={.55 * clamp(fraction * 12)}>
        {STARS.map((star, i) => {
          const sx = reduced ? star.x : ((star.x - elapsed * (earth ? 12 : 230)) % 100 + 100) % 100
          return <path key={i} d={`M ${sx} ${star.y * height / 100} h ${reduced || earth ? .1 : 1.5 + i % 3}`} stroke="#b9e9df" strokeWidth={star.size} strokeLinecap="round" />
        })}
      </g>
      {earth && !impacted && <g transform={`translate(50 ${height / 2})`}>
        <circle r={radius * 1.18} fill={`url(#${id}-glow)`} opacity=".5" />
        {planet}
        <circle r={radius} fill="none" stroke="currentColor" strokeWidth=".25" opacity=".7" />
      </g>}
      {!impacted && fraction > 0 && <g transform={`translate(${x} ${y}) rotate(${earth ? 23 : 10})`}>
        <g transform={`scale(${core})`}>
          <path d="M -45 -4 Q -19 -7 1 -2 L 3 0 Q -11 7 -45 8 Q -23 1 -45 -4" fill={`url(#${id}-tail)`} opacity=".55" />
          <path d="M -37 0 Q -12 -2 2 0 Q -14 3 -37 0" fill={`url(#${id}-tail)`} />
          <circle r="7" fill={`url(#${id}-glow)`} />
          <path d="M -3 -1 L -1 -2.5 1.5 -2 3 0 1 2 -2 1.5 Z" fill="#effff6" />
        </g>
        {!earth && Array.from({ length: 24 }, (_, i) => {
          const start = .05 + i / 24 * .7
          const age = clamp((elapsed - start) / (1 - start))
          const size = (.5 + i % 3 * .23) * (1 - age)
          return elapsed > start && age < 1 ? <g key={i} transform={`translate(${-age * (18 + i % 5 * 6)} ${(i % 2 ? 1 : -1) * age * (3 + i % 7)}) rotate(${reduced ? 0 : age * 180})`} opacity={(1 - age) * .8}>
            <path d={`M ${-size} 0 L 0 ${-size} ${size} 0 0 ${size * .6} Z`} fill="currentColor" />
          </g> : null
        })}
      </g>}
      {impacted && fraction > 0 && <>
        {!reduced && <g transform={`translate(50 ${height / 2})`} opacity={Math.pow(1 - clamp(debris / .38), 2)}>
          <circle r={radius * (1 + debris * 5)} fill={`url(#${id}-glow)`} />
          <circle r={radius * (1 + debris * 7)} fill="none" stroke="currentColor" strokeWidth=".5" />
        </g>}
        {earthFragments(100, height).map((bit, i) => {
          const flight = clamp(debris / bit.exitsAt)
          return <g key={i} transform={`translate(${50 + bit.dx * flight} ${height / 2 + bit.dy * flight})`}>
            <g clipPath={`url(#${id}-bit-${i})`}>{planet}</g>
            <polygon points={bit.points} fill="currentColor" opacity={.3 * (1 - flight)} />
          </g>
        })}
      </>}
    </svg>
  </div>
}
