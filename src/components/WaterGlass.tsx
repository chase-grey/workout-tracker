import { useEffect, useId, useRef, useState } from 'react'
import {
  createDripper,
  crownsPath,
  dripTuning,
  dropsPath,
  specksPath,
  stepDrip,
} from '../lib/drip'
import { createWave, impulseWave, stepWave, waveSurfacePath } from '../lib/tide'
import { chamberFill, glassPaths, waterLines, type Glass } from '../lib/waterclock'
import { usePrefersReducedMotion } from '../lib/useReducedMotion'

/**
 * The water-clock rest shapes: the same glass as the sandglass and the hourglass
 * in components/RestTimer, filled with water instead of sand — so it drips.
 *
 * Read exactly like its sand siblings: the upper chamber's level sinks toward the
 * waist as the rest runs out and the lower chamber's rises by the same share, so
 * either line alone says how much rest is left. What the water buys is the part in
 * between. A drop lets go of the neck on a steady beat, falls, and goes in with a
 * crown and a handful of spray; the surface it lands on is a real wave (see
 * lib/tide), so the bump spreads out, bounces off the walls and rings down for
 * seconds — and because the next drop comes before the last ripples are gone, the
 * bottom half of the glass is never still.
 *
 * The splashes are all the same size on purpose. What makes a dripping glass worth
 * watching is the rhythm rather than any one impact, and a big splash every so
 * often would read as an event happening — the wrong reading, since nothing is
 * happening except time passing. See lib/drip.
 *
 * Both levels and the surface are written straight to the DOM from one animation
 * frame loop rather than re-rendered: the wave is texture at 60fps, and driving
 * the two levels from the same smoothed number is what keeps them exact mirrors of
 * each other. The countdown's 250ms steps are smoothed into one continuous fall
 * the way the other shapes' `height` transitions do.
 *
 * One SVG, letterboxed into whatever space it's given, so the glass keeps its
 * proportions on any display instead of being stretched to the box.
 */
export function WaterGlass({ glass, fraction }: { glass: Glass; fraction: number }) {
  // Each chamber clips its own water, and a clip path is referenced by id. Stripped
  // to word characters: useId's own punctuation has no business in a url(#…).
  const id = useId().replace(/\W/g, '')
  const [paths] = useState(() => glassPaths(glass))
  const [wave] = useState(() => createWave())
  const [dripper] = useState(() => createDripper(dripTuning(glass)))
  const calm = usePrefersReducedMotion()
  // The loop runs for the whole rest, so it reads the countdown through a ref
  // rather than restarting on every tick.
  const fractionRef = useRef(fraction)
  fractionRef.current = fraction
  const upperRef = useRef<SVGPathElement>(null)
  const upperLineRef = useRef<SVGPathElement>(null)
  const lowerRef = useRef<SVGPathElement>(null)
  const lowerLineRef = useRef<SVGPathElement>(null)
  const dropsRef = useRef<SVGPathElement>(null)
  const specksRef = useRef<SVGPathElement>(null)
  const crownsRef = useRef<SVGPathElement>(null)

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let level = fractionRef.current
    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now
      level += (fractionRef.current - level) * (1 - Math.exp(-dt / 0.09))
      stepWave(wave, dt)
      const lines = waterLines(glass, level)
      // The surface as the drip sees it: the flat line plus whatever the wave is
      // doing at that node, so a drop lands on the water rather than through it.
      const nodes = wave.y.length - 1
      const surfaceAt = (x: number) => {
        const at = Math.max(0, Math.min(1, x / glass.width))
        return lines.lower + wave.y[Math.round(at * nodes)]
      }
      if (!calm) {
        stepDrip(
          dripper,
          dt,
          { x: glass.width / 2, y: glass.waist, surfaceAt, flowing: level > 0 },
          (x) => impulseWave(wave, x / glass.width, dripper.tuning.lift, dripper.tuning.bump),
        )
        dropsRef.current?.setAttribute('d', dropsPath(dripper))
        specksRef.current?.setAttribute('d', specksPath(dripper))
        crownsRef.current?.setAttribute('d', crownsPath(dripper, surfaceAt))
      }
      upperRef.current?.setAttribute('d', chamberFill(glass, lines.upper, glass.waist))
      upperLineRef.current?.setAttribute('d', `M 0 ${lines.upper} H ${glass.width}`)
      // Drawn across the whole box and cropped to the chamber, which is what lets
      // the surface meet the tapered walls exactly. Its reflections happen at the
      // box's edges rather than the chamber's, so in the narrow water near the
      // waist a ripple rolls out of sight and comes back — as close to right as a
      // one-dimensional surface gets.
      const surface = waveSurfacePath(wave, lines.lower, glass.width)
      lowerRef.current?.setAttribute(
        'd',
        `${surface} L ${glass.width} ${glass.height} L 0 ${glass.height} Z`,
      )
      lowerLineRef.current?.setAttribute('d', surface)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [calm, dripper, glass, wave])

  return (
    <div className="pointer-events-none absolute inset-0 text-accent-bright" aria-hidden>
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${glass.width} ${glass.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <clipPath id={`${id}-upper`}>
            <path d={paths.upper} />
          </clipPath>
          <clipPath id={`${id}-lower`}>
            <path d={paths.lower} />
          </clipPath>
        </defs>
        <g fill="currentColor">
          {/* Caps, where the glass wears them: the frame that makes a small shape
              read as a timer object rather than a diagram. */}
          {paths.caps.map((cap) => (
            <rect
              key={cap.y}
              x={cap.x}
              y={cap.y}
              width={cap.width}
              height={cap.height}
              rx={cap.r}
              fillOpacity={0.6}
            />
          ))}
          {/* The empty chambers, so both are still there once their water has gone. */}
          <path d={paths.upper} fillOpacity={0.1} />
          <path d={paths.lower} fillOpacity={0.1} />
          <g clipPath={`url(#${id}-upper)`}>
            <path ref={upperRef} fillOpacity={0.7} />
            {/* The upper surface stays a flat line: this chamber drains from
                underneath, and nothing ever lands on it. */}
            <path
              ref={upperLineRef}
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
            />
          </g>
          <g clipPath={`url(#${id}-lower)`}>
            <path ref={lowerRef} fillOpacity={0.7} />
            <path
              ref={lowerLineRef}
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
            />
            {/* The drip and everything it throws up live inside the lower chamber's
                clip, so nothing shows outside the glass. */}
            <path ref={dropsRef} fillOpacity={0.95} />
            <path ref={specksRef} fillOpacity={0.9} />
            <path
              ref={crownsRef}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.75}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        </g>
        {/* The outline, over the water so the taper stays crisp. One weight, no
            highlight — the line is the shape's edge and nothing more. */}
        <g fill="none" stroke="currentColor" strokeOpacity={0.55} vectorEffect="non-scaling-stroke">
          <path d={paths.upper} strokeWidth={2} />
          <path d={paths.lower} strokeWidth={2} />
        </g>
      </svg>
    </div>
  )
}
