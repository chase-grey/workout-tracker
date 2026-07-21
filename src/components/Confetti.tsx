import { useMemo, type CSSProperties } from 'react'

/**
 * Dependency-free confetti: a fixed layer of pieces that rain from the top with
 * randomized drift, spin, size, and delay. Each piece drives the shared
 * `confetti-fall` keyframe (see index.css) via CSS custom properties. Purely
 * decorative — never blocks taps.
 */
export function Confetti({ count, colors }: { count: number; colors: string[] }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const size = 6 + Math.random() * 8
        return {
          left: Math.random() * 100, // vw
          dx: `${(Math.random() * 2 - 1) * 18}vw`,
          rot: `${Math.random() * 900 - 300}deg`,
          duration: `${1.5 + Math.random() * 1.4}s`,
          delay: `${Math.random() * 0.5}s`,
          color: colors[i % colors.length],
          width: size,
          height: size * (1.2 + Math.random()),
          round: Math.random() < 0.4,
        }
      }),
    // Regenerating on every render would restart the animation; keep it stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count],
  )

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece absolute top-0"
          style={
            {
              left: `${p.left}vw`,
              width: p.width,
              height: p.height,
              background: p.color,
              borderRadius: p.round ? '9999px' : '2px',
              animationDuration: p.duration,
              animationDelay: p.delay,
              '--dx': p.dx,
              '--rot': p.rot,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
