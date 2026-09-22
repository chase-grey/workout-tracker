import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { clamp, earthFragments, IMPACT_AT } from '../lib/comet'
import { usePrefersReducedMotion } from '../lib/useReducedMotion'
import { BurningComet } from './BurningComet'

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
  const fragments = useMemo(() => earth ? earthFragments(100, height) : [], [earth, height])
  const approach = clamp(elapsed / IMPACT_AT)
  const debris = clamp((elapsed - IMPACT_AT) / (1 - IMPACT_AT))
  const impacted = earth && elapsed >= IMPACT_AT
  // Accelerating approach ends on the planet's near surface, along the tail's axis.
  const travel = approach * approach
  const x = -8 + travel * (58 - radius * 0.92)
  const y = height / 2 - 24 + travel * (24 - radius * 0.39)

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
        <radialGradient id={`${id}-fire`}>
          <stop stopColor="#fffbe8" /><stop offset=".2" stopColor="#ffd18a" stopOpacity=".9" /><stop offset=".5" stopColor="#f07832" stopOpacity=".5" /><stop offset="1" stopColor="#b83516" stopOpacity="0" />
        </radialGradient>
        {fragments.map((bit, i) => <clipPath key={i} id={`${id}-bit-${i}`}><polygon points={bit.points} /></clipPath>)}
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
      {!earth && fraction > 0 && <BurningComet elapsed={elapsed} height={height} id={id} reduced={reduced} />}
      {earth && !impacted && fraction > 0 && <g transform={`translate(${x} ${y}) rotate(23)`}>
        <g>
          <path d="M -45 -4 Q -19 -7 1 -2 L 3 0 Q -11 7 -45 8 Q -23 1 -45 -4" fill={`url(#${id}-tail)`} opacity=".55" />
          <path d="M -37 0 Q -12 -2 2 0 Q -14 3 -37 0" fill={`url(#${id}-tail)`} />
          <circle r="7" fill={`url(#${id}-glow)`} />
          <path d="M -3 -1 L -1 -2.5 1.5 -2 3 0 1 2 -2 1.5 Z" fill="#effff6" />
        </g>

      </g>}
      {impacted && fraction > 0 && <>
        {fragments.map((bit, i) => {
          const flight = clamp((debris - bit.delay) / (bit.exitsAt - bit.delay))
          const heat = clamp((debris - bit.delay) / .025) * (1 - clamp((debris - bit.delay) / .3))
          return <g key={i} transform={`translate(${50 + bit.dx * flight} ${height / 2 + bit.dy * flight})`}>
            <g clipPath={`url(#${id}-bit-${i})`}>{planet}</g>
            <polygon points={bit.points} fill="#f48637" fillOpacity={heat * .2} stroke="#ffbc70" strokeWidth=".28" strokeOpacity={heat * .9} strokeLinejoin="round" />
          </g>
        })}
        {!reduced && <g transform={`translate(${50 - radius * .92} ${height / 2 - radius * .39})`} opacity={Math.pow(1 - clamp(debris / .42), 2)}>
          <circle r={radius * (.35 + debris * 7)} fill={`url(#${id}-fire)`} />
          {Array.from({ length: 26 }, (_, i) => {
            const angle = i * 2.399963
            const distance = radius * debris * (3 + i % 5)
            const px = Math.cos(angle) * distance, py = Math.sin(angle) * distance
            return <path key={i} d={`M ${px * .75} ${py * .75} L ${px} ${py}`} stroke={i % 3 ? '#ffac60' : '#fff6d5'} strokeWidth={.15 + i % 3 * .1} strokeLinecap="round" />
          })}
        </g>}
      </>}
    </svg>
  </div>
}
