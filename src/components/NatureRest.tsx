import type { CSSProperties } from 'react'

type NatureVariant = 'tree' | 'mushroom' | 'roots' | 'flower' | 'dandelion'
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const stage = (progress: number, start: number, end = 1) => clamp((progress - start) / (end - start))
const smooth: CSSProperties = { transition: 'transform 260ms linear, opacity 260ms linear, stroke-dashoffset 260ms linear' }

/** Growth and seed flight follow elapsed rest, including after a background resume. */
export function NatureRest({ variant, fraction }: { variant: NatureVariant; fraction: number }) {
  const p = 1 - clamp(fraction)
  const growingPath = (d: string, progress: number, width: number) => (
    <path d={d} fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round"
      pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - progress}
      opacity={progress > 0 ? 1 : 0} style={smooth} />
  )
  const leaf = (x: number, y: number, angle: number, size: number, key: number) => (
    <g key={key} transform={`translate(${x} ${y}) rotate(${angle})`}>
      <g style={{ ...smooth, transform: `scale(${size})` }}>
        <path d="M0 0 Q-5 -13 0 -22 Q11 -12 0 0Z" fill="currentColor" opacity="0.8" />
        <path d="M0 -2 L1 -17" stroke="black" strokeOpacity="0.25" strokeWidth="0.6" />
      </g>
    </g>
  )

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio={variant === 'roots' ? 'none' : 'xMidYMid meet'}
      className="rest-nature pointer-events-none absolute inset-0 h-full w-full overflow-hidden text-accent-bright" aria-hidden>
      {variant !== 'roots' && variant !== 'dandelion' && (
        <ellipse cx="50" cy="91" rx="29" ry="2" fill="currentColor" opacity="0.12" />
      )}
      {variant === 'tree' && <>
        {growingPath('M50 90 Q47 64 50 43 Q52 31 49 16', p, 3)}
        {[-1, 1].map(side => [0, 1, 2, 3].map(i => {
          const y = 70 - i * 13
          const x = 50 + side * (27 - i * 4)
          const growth = stage(p, 0.17 + i * 0.13, 0.5 + i * 0.13)
          const tipX = (1 - growth) ** 2 * 50 + 2 * (1 - growth) * growth * (50 + side * 13) + growth ** 2 * x
          const tipY = (1 - growth) ** 2 * (y + 6) + 2 * (1 - growth) * growth * (y + 4) + growth ** 2 * (y - 14)
          return <g key={`${side}-${i}`}>
            {growingPath(`M50 ${y + 6} Q${50 + side * 13} ${y + 4} ${x} ${y - 14}`, growth, 1.6 - i * 0.2)}
            {leaf(tipX, tipY, side * 30, stage(p, 0.28 + i * 0.14), 0)}
            {leaf(50 + side * 13, y, side * 65, stage(p, 0.5 + i * 0.13) * 0.75, 1)}
          </g>
        }))}
        <ellipse cx="50" cy="89" rx="3" ry="2" fill="currentColor" />
      </>}
      {variant === 'mushroom' && <>
        <g style={{ ...smooth, transform: `translate(50px, 90px) scale(${0.12 + p * 0.88})` }}>
          <path d="M-7 0 Q-5 -17 -8 -39 L8 -39 Q4 -16 9 0 Q0 3 -7 0Z" fill="currentColor" opacity="0.65" />
          <g style={{ ...smooth, transform: `translateY(-39px) scale(${0.3 + 0.7 * p}, ${0.5 + 0.5 * p})` }}>
            <path d="M-35 0 C-32 -37 29 -46 35 0 Q0 12 -35 0Z" fill="currentColor" opacity="0.9" />
            <ellipse cy="1" rx="34" ry="7" fill="black" opacity="0.5" />
            {[-25, -16, -8, 8, 16, 25].map(x => <path key={x} d={`M${x} 0 L0 6`} stroke="currentColor" strokeWidth="0.6" opacity="0.6" />)}
            {[[-19, -12, 3], [-7, -25, 4], [12, -22, 3.5], [23, -9, 2.5], [1, -10, 2]].map(([x, y, r]) => (
              <ellipse key={x} cx={x} cy={y} rx={r} ry={r * 0.65} fill="black" opacity="0.35" />
            ))}
          </g>
        </g>
      </>}
      {variant === 'roots' && <>
        <ellipse cx="50" cy="3" rx="3.5" ry="2" fill="currentColor" />
        {growingPath('M50 4 C43 24 57 42 49 62 S48 84 50 101', p, 1.1)}
        {[-1, 1].map(side => [0, 1, 2, 3, 4].map(i => {
          const y = 10 + i * 15
          const x = 50 + side * (30 - i * 3)
          return <g key={`${side}-${i}`} opacity="0.8">
            {growingPath(`M50 ${y} C${50 + side * 7} ${y + 9} ${x} ${y + 10} ${x + side * 5} ${Math.min(101, y + 38)}`, stage(p, y / 100), 0.65)}
            {growingPath(`M${50 + side * 15} ${y + 17} Q${x + side * 8} ${y + 21} ${x + side * 11} ${y + 31}`, stage(p, (y + 20) / 100), 0.3)}
          </g>
        }))}
      </>}
      {variant === 'flower' && <>
        {growingPath('M50 90 Q40 69 50 34', stage(p, 0, 0.65), 1.8)}
        {leaf(47, 73, -55, stage(p, 0.2, 0.8), 0)}
        {leaf(47, 60, 65, stage(p, 0.35, 0.9) * 0.85, 1)}
        <g transform="translate(50 32)">
          <g style={{ ...smooth, transform: `scale(${stage(p, 0.65)})` }}>
            {Array.from({ length: 9 }, (_, i) => <ellipse key={i} cy="-12" rx="6" ry="13" transform={`rotate(${i * 40})`} fill="currentColor" opacity="0.75" />)}
            <circle r="6" fill="black" />
            <circle r="4" fill="currentColor" />
          </g>
        </g>
      </>}
      {variant === 'dandelion' && <>
        <path d="M34 94 Q26 65 36 41" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.65" />
        {leaf(32, 81, -60, 0.65, 0)}
        <circle cx="36" cy="40" r="2.6" fill="currentColor" opacity="0.65" />
        {Array.from({ length: 36 }, (_, i) => {
          const angle = i * 2.39996
          const radius = 8 + (i % 4) * 3
          const x = 36 + Math.cos(angle) * radius
          const y = 40 + Math.sin(angle) * radius
          // Stagger release; even the final seed has a quarter of the rest to drift away.
          const flight = stage(p, (i / 35) * 0.72)
          const dx = flight * (88 + (i % 5) * 5)
          const dy = -flight * (15 + (i % 7) * 4) + Math.sin(flight * Math.PI * 2) * 3
          return <g key={i}>
            <path d={`M36 40 L${x} ${y}`} stroke="currentColor" strokeWidth="0.3" opacity={0.3 * (1 - clamp(flight * 15))} style={smooth} />
            <g style={{ ...smooth, transform: `translate(${x + dx}px, ${y + dy}px) rotate(${flight * 40}deg)`, opacity: 1 - stage(flight, 0.8) }}>
              <path d="M0 3 L0 -2 M-3 -4 L0 -2 L3 -4 M-2 -5 L0 -2 L2 -5 M0 -5 L0 -2" fill="none" stroke="currentColor" strokeWidth="0.45" strokeLinecap="round" />
              <ellipse cy="3" rx="0.55" ry="1.3" fill="currentColor" />
            </g>
          </g>
        })}
      </>}
    </svg>
  )
}
