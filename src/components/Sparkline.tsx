/** A tiny inline SVG sparkline — no chart library, cheap enough for the home screen. */
export function Sparkline({
  values,
  width = 160,
  height = 40,
  color = 'var(--color-accent)',
}: {
  values: number[]
  width?: number
  height?: number
  /** Line + end-dot color, for series with a color language of their own. */
  color?: string
}) {
  if (values.length < 2) {
    return <span className="text-sm text-neutral-500">not enough data yet</span>
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pad = 3
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2)
    const y = pad + (1 - (v - min) / span) * (height - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const last = pts[pts.length - 1].split(',').map(Number)
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={3} fill={color} />
    </svg>
  )
}
