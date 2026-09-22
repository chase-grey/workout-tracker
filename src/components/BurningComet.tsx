import { clamp } from '../lib/comet'

// Shared vertices keep the rock whole until its individual facets break away.
const rim = Array.from({ length: 12 }, (_, i) => {
  const angle = i * Math.PI / 6
  const radius = 12 + Math.sin(i * 7.3) * 1.4
  return [Math.cos(angle) * radius, Math.sin(angle) * radius]
})
const fragments = rim.flatMap((a, i) => {
  const b = rim[(i + 1) % rim.length]
  const innerA = a.map(v => v * .48)
  const innerB = b.map(v => v * .48)
  return [
    { vertices: [a, b, innerB, innerA], release: .08 + ((i * 7) % 12) / 12 * .46 },
    { vertices: [[0, 0], innerA, innerB], release: .56 + ((i * 5) % 12) / 12 * .27 },
  ].map((bit, j) => ({
    ...bit,
    x: bit.vertices.reduce((sum, v) => sum + v[0], 0) / bit.vertices.length,
    y: bit.vertices.reduce((sum, v) => sum + v[1], 0) / bit.vertices.length,
    color: ['#61392e', '#905039', '#b66a42', '#754231', '#cf8550'][(i + j * 2) % 5],
  }))
})

export function BurningComet({ elapsed, height, id, reduced }: {
  elapsed: number; height: number; id: string; reduced: boolean
}) {
  const heat = clamp((1 - elapsed) / .22)
  const size = Math.min(1, height / 65)
  return <g transform={`translate(50 ${height / 2}) scale(${size}) rotate(-12)`}>
    <defs>
      <linearGradient id={`${id}-comet-flame`}>
        <stop stopColor="#d83518" stopOpacity="0" />
        <stop offset=".4" stopColor="#ed491b" stopOpacity=".35" />
        <stop offset=".8" stopColor="#ff9b32" stopOpacity=".9" />
        <stop offset="1" stopColor="#fff2bb" />
      </linearGradient>
      <radialGradient id={`${id}-heat`}>
        <stop stopColor="#ffbb58" stopOpacity=".5" />
        <stop offset=".5" stopColor="#ff671e" stopOpacity=".18" />
        <stop offset="1" stopColor="#ff491b" stopOpacity="0" />
      </radialGradient>
    </defs>
    <ellipse cx="-7" rx="37" ry="26" fill={`url(#${id}-heat)`} opacity={heat} />
    <g className={reduced ? undefined : 'rest-comet-shake'}>
      <g opacity={heat} transform={`scale(${.35 + .65 * clamp(1 - elapsed * .85)})`}>
        <g className={reduced ? undefined : 'rest-comet-fire'}>
          <path d="M 10 -8 Q -2 -18 -25 -13 L -58 -20 Q -39 -7 -31 -6 L -70 -2 Q -47 4 -35 7 L -58 17 Q -25 12 -12 15 Q 6 17 12 5 Z" fill={`url(#${id}-comet-flame)`} />
          <path d="M 11 -6 Q -5 -12 -24 -7 L -48 -10 L -29 -1 L -56 4 Q -34 3 -21 9 Q 1 12 12 3 Z" fill={`url(#${id}-comet-flame)`} />
          <path d="M 10 -4 Q -7 -7 -34 0 Q -10 6 11 5 Z" fill="#ffe7a0" opacity=".7" />
        </g>
      </g>
      {fragments.map((bit, i) => {
        const age = clamp((elapsed - bit.release) / (1 - bit.release))
        const flight = reduced ? 0 : age * age
        const opacity = 1 - age * age
        return <g key={i} opacity={opacity} transform={`translate(${bit.x - flight * (48 + i % 4 * 9)} ${bit.y + flight * bit.y * 2.6}) rotate(${reduced ? 0 : age * (i % 2 ? 140 : -110)}) scale(${1 - age * .85})`}>
          <polygon points={bit.vertices.map(v => `${v[0] - bit.x},${v[1] - bit.y}`).join(' ')} fill={bit.color} stroke="#ffb65b" strokeWidth={.12 + age * .4} strokeLinejoin="round" />
        </g>
      })}
      {!reduced && Array.from({ length: 18 }, (_, i) => <circle key={i}
        className="rest-comet-cinder" cx={-8 - i % 5 * 4} cy={(i % 2 ? 1 : -1) * (3 + i % 7)}
        r={.18 + i % 3 * .12} fill="#ffcf78" opacity={heat}
        style={{ animationDelay: `${-i * .173}s`, animationDuration: `${.8 + i % 4 * .19}s` }} />)}
    </g>
  </g>
}
