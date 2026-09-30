import { clamp } from '../lib/comet'

const ROCK = 'M 12 -3 C 13 0 11 3 10 5 L 7 8 Q 5 11 1 11 L -3 10 Q -7 11 -9 7 L -11 4 Q -13 1 -11 -3 L -10 -7 Q -8 -10 -4 -10 L 0 -12 Q 4 -12 6 -9 L 9 -8 Z'
// Chips come from the perimeter; the body is always a single continuous surface.
const chips = Array.from({ length: 18 }, (_, i) => {
  const angle = i * 2.399963
  return {
    x: Math.cos(angle) * 10,
    y: Math.sin(angle) * 9.5,
    release: .07 + i / 18 * .78,
    size: 1.1 + i % 3 * .35,
    angle: angle * 180 / Math.PI,
  }
})
const streams = [
  'M 8 -8 C -8 -23 -22 -9 -38 -18 C -29 -7 -47 -11 -62 -6 C -41 -4 -29 3 -15 0 Q 4 5 11 3 Z',
  'M 6 8 C -7 20 -23 7 -36 15 C -29 6 -49 11 -58 4 C -39 7 -31 -4 -15 -2 Q 4 -4 11 -2 Z',
  'M 8 -5 C -9 -14 -19 1 -34 -6 C -29 0 -43 -1 -52 3 C -34 10 -23 0 -12 7 Q 6 11 12 1 Z',
  'M 10 -3 C -4 -9 -14 -1 -23 -3 C -19 2 -31 5 -40 2 C -26 12 -16 3 -6 6 Q 7 8 12 0 Z',
]

export function BurningComet({ elapsed, height, id, reduced }: {
  elapsed: number; height: number; id: string; reduced: boolean
}) {
  const heat = clamp((1 - elapsed) / .22)
  const size = Math.min(1, height / 65)
  const bodyScale = (1 - elapsed * .62) * clamp((1 - elapsed) / .12)
  return <g transform={`translate(50 ${height / 2}) scale(${size}) rotate(-12)`}>
    <defs>
      <linearGradient id={`${id}-comet-flame`}>
        <stop stopColor="#15803d" stopOpacity="0" />
        <stop offset=".3" stopColor="#16a34a" stopOpacity=".15" />
        <stop offset=".65" stopColor="#4ade80" stopOpacity=".65" />
        <stop offset="1" stopColor="#dcfce7" />
      </linearGradient>
      <radialGradient id={`${id}-heat`}>
        <stop stopColor="#86efac" stopOpacity=".5" />
        <stop offset=".5" stopColor="#22c55e" stopOpacity=".18" />
        <stop offset="1" stopColor="#15803d" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${id}-stone`} cx="80%" cy="35%" r="90%">
        <stop stopColor="#718578" /><stop offset=".32" stopColor="#3c5044" />
        <stop offset=".7" stopColor="#22352d" /><stop offset="1" stopColor="#101b18" />
      </radialGradient>
      <radialGradient id={`${id}-crater`} cx="35%" cy="65%">
        <stop stopColor="#0b1712" stopOpacity=".8" /><stop offset=".72" stopColor="#14251d" stopOpacity=".5" />
        <stop offset="1" stopColor="#92ad99" stopOpacity=".12" />
      </radialGradient>
      <mask id={`${id}-erosion`} maskUnits="userSpaceOnUse" x="-15" y="-15" width="30" height="30">
        <path d={ROCK} fill="white" />
        {chips.map((bit, i) => <ellipse key={i} cx={bit.x} cy={bit.y}
          rx={bit.size * clamp((elapsed - bit.release) / .06)}
          ry={bit.size * 1.3 * clamp((elapsed - bit.release) / .06)} fill="black" />)}
      </mask>
    </defs>
    <ellipse cx="-7" rx="37" ry="26" fill={`url(#${id}-heat)`} opacity={heat} />
    <g className={reduced ? undefined : 'rest-comet-shake'}>
      <g opacity={heat} transform={`scale(${.4 + .6 * bodyScale})`}>
        {streams.map((d, i) => <path key={i} d={d} fill={`url(#${id}-comet-flame)`}
          className={reduced ? undefined : 'rest-comet-fire'}
          style={{ animationDelay: `${-i * .37}s`, animationDuration: `${.73 + i * .23}s` }} />)}
        <path d="M 10 -9 C 19 -2 13 10 6 11 C -3 16 -15 8 -25 10 C -12 4 -3 10 5 6 Q 12 0 7 -6 C -3 -11 -13 -6 -22 -10 Q -2 -17 10 -9 Z"
          fill="#bbf7d0" opacity=".65" className={reduced ? undefined : 'rest-comet-fire'} style={{ animationDuration: '.61s' }} />
      </g>
      <g transform={`scale(${bodyScale})`}>
        <g mask={`url(#${id}-erosion)`}>
          <path d={ROCK} fill={`url(#${id}-stone)`} />
          {Array.from({ length: 15 }, (_, i) => <ellipse key={i}
            cx={Math.cos(i * 2.4) * (2 + i % 4 * 2)} cy={Math.sin(i * 2.4) * (2 + i % 3 * 2.4)}
            rx={.55 + i % 4 * .4} ry={.45 + i % 3 * .45} fill={`url(#${id}-crater)`} />)}
          <path d="M -8 -5 Q -4 -7 -2 -5 L 0 -2 M 3 7 L 4 4 7 2 M -7 4 L -4 2 -5 0"
            fill="none" stroke="#101f18" strokeWidth=".45" opacity=".65" strokeLinecap="round" />
          <path d="M 0 -12 Q 4 -12 6 -9 L 9 -8 12 -3 Q 14 1 10 5 L 7 8 Q 5 11 1 11"
            fill="none" stroke="#b9f9cd" strokeWidth="1.1" opacity={heat * .8} />
        </g>
      </g>
      {chips.map((bit, i) => {
        const age = clamp((elapsed - bit.release) / .18)
        if (elapsed <= bit.release || age >= 1) return null
        const releaseScale = 1 - bit.release * .62
        const flight = reduced ? 0 : age
        return <g key={i} opacity={(1 - age) * heat}
          transform={`translate(${bit.x * releaseScale - flight * (24 + i % 4 * 7)} ${bit.y * releaseScale + flight * bit.y * .9}) rotate(${bit.angle + (reduced ? 0 : age * 150)}) scale(${bit.size * releaseScale * (1 - age * .7)})`}>
          <path d="M -1 -.4 L -.5 -1.1 .4 -.8 1 -.1 .6 .7 -.2 1 -.9 .4 Z" fill="#405e49" stroke="#86efac" strokeWidth=".18" />
        </g>
      })}
      <g opacity={heat}>
        {!reduced && Array.from({ length: 22 }, (_, i) => <circle key={i}
          className="rest-comet-cinder" cx={4 - i % 5 * 4} cy={(i % 2 ? 1 : -1) * (4 + i % 7)}
          r={.12 + i % 3 * .1} fill={i % 3 ? '#86efac' : '#f0fdf4'}
          style={{ animationDelay: `${-i * .173}s`, animationDuration: `${.65 + i % 4 * .19}s` }} />)}
      </g>
    </g>
  </g>
}
