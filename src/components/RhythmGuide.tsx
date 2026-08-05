import { useEffect, useMemo, useRef, useState } from 'react'
import { MdKeyboardArrowDown } from 'react-icons/md'
import { parseTempo } from '../lib/tempo'
import {
  cycleProgress,
  loopFadeIn,
  motionForPhases,
  phaseDepths,
  type MotionKind,
} from '../lib/rhythmMotion'

/**
 * An abstract, nature-inspired rhythm animation that paces a stretch's tempo.
 * The shape family is chosen from the stretch's motion (see rhythmMotion):
 * - 'breathe' shapes expand/contract for down · hold · up reps (Tailor's Pose).
 * - 'descent' shapes fold/reach downward and settle deep for push-and-hang
 *   reps (Pancake Hang) rather than forcing a breathing shape to fit them.
 * A random variant within the family is chosen per mount, so it varies from one
 * set to the next, and a live rep counter tracks where you are in the set.
 */
const BREATHE_VARIANTS = ['orb', 'square', 'rings', 'tide', 'petals', 'bars', 'halo'] as const
const DESCENT_VARIANTS = ['reach', 'fold', 'dive', 'drip', 'stairs', 'press'] as const
type Variant = (typeof BREATHE_VARIANTS)[number] | (typeof DESCENT_VARIANTS)[number]

// Remembered per family across mounts (each set remounts the guide) so we never
// show the same shape twice in a row — each family reliably rotates its variants.
const lastVariant: Record<MotionKind, Variant | null> = { breathe: null, descent: null }
function pickVariant(kind: MotionKind): Variant {
  const all = kind === 'descent' ? DESCENT_VARIANTS : BREATHE_VARIANTS
  const pool = all.filter((v) => v !== lastVariant[kind])
  const choice = pool[Math.floor(Math.random() * pool.length)]
  lastVariant[kind] = choice
  return choice
}

/** Depth 0–1 (0 = neutral/top, 1 = deepest) mapped to a breathing orb's scale. */
const SCALE_MIN = 0.55
const scaleFromDepth = (depth: number) => 1 - depth * (1 - SCALE_MIN)

/** Breathing family: a shape that expands (neutral) and contracts (deep). */
function BreatheShape({ variant, scale }: { variant: Variant; scale: number }) {
  // Scale is interpolated per animation frame by the parent, so the shape needs
  // no CSS transition of its own — that would only lag behind the live value.
  switch (variant) {
    case 'square':
      return (
        <div
          className="absolute h-[73%] w-[73%] rounded-[14%] bg-accent-bright/40 ring-1 ring-accent-bright/70"
          style={{ transform: `scale(${scale}) rotate(${(scale - 0.55) * 25}deg)` }}
        />
      )
    case 'rings':
      return (
        <>
          {[73, 53, 33].map((pct, i) => (
            <div
              key={i}
              className="absolute rounded-full border border-accent-bright/70"
              style={{ width: `${pct}%`, height: `${pct}%`, transform: `scale(${scale})` }}
            />
          ))}
        </>
      )
    case 'tide':
      return (
        <div className="absolute h-[73%] w-[73%] overflow-hidden rounded-full ring-1 ring-accent-bright/70">
          <div className="absolute bottom-0 left-0 w-full bg-accent-bright/40" style={{ height: `${scale * 100}%` }} />
        </div>
      )
    case 'petals':
      // Six dots drawn in toward the center and pushed back out — the breath
      // read as a ring closing rather than a single body shrinking.
      return (
        <div className="absolute h-[73%] w-[73%]">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="absolute inset-0" style={{ transform: `rotate(${i * 60}deg) scale(${scale})` }}>
              <div className="absolute left-1/2 top-0 h-[21%] w-[21%] -translate-x-1/2 rounded-full bg-accent-bright/40 ring-1 ring-accent-bright/70" />
            </div>
          ))}
        </div>
      )
    case 'bars':
      // An equalizer that rises and falls from a shared centerline — the only
      // shape in the family that reads left-to-right instead of radially.
      return (
        <div className="absolute flex h-[73%] w-[73%] items-center justify-center gap-[4%]">
          {[0.55, 0.8, 1, 0.8, 0.55].map((f, i) => (
            <div
              key={i}
              className="w-[9%] rounded-full bg-accent-bright/40 ring-1 ring-accent-bright/70"
              style={{ height: `${f * scale * 100}%` }}
            />
          ))}
        </div>
      )
    case 'halo':
      // A blurred core and a crisp ring moving in opposition: the core swells as
      // the ring closes in on it, so the gap between them carries the breath.
      return (
        <>
          <div
            className="absolute h-[58%] w-[58%] rounded-full bg-accent-bright/40 blur-2xl"
            style={{ transform: `scale(${scale})` }}
          />
          <div
            className="absolute h-[73%] w-[73%] rounded-full border border-accent-bright/70"
            style={{ transform: `scale(${1 + SCALE_MIN - scale})` }}
          />
        </>
      )
    case 'orb':
    default:
      return (
        <div
          className="absolute h-[73%] w-[73%] rounded-full bg-accent-bright/40 ring-1 ring-accent-bright/70"
          style={{ transform: `scale(${scale})` }}
        />
      )
  }
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** Descent family: a shape that reaches/folds downward and settles deep. */
function DescentShape({ variant, depth }: { variant: Variant; depth: number }) {
  switch (variant) {
    case 'fold':
      // A panel that hinges shut — upright when neutral, folded flat when deep,
      // like the body folding forward over the legs.
      return (
        <div
          className="absolute h-[70%] w-[58%] rounded-[16%] bg-accent-bright/40 ring-1 ring-accent-bright/70"
          style={{ transform: `scaleY(${1 - depth * 0.72}) scaleX(${1 + depth * 0.16})` }}
        />
      )
    case 'dive':
      // A stack of chevrons that light up and drift downward top-to-bottom as
      // the stretch deepens — a clear "press down and hold" cue.
      return (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ fontSize: 'min(22vw, 8rem)' }}
        >
          {[0, 1, 2].map((i) => {
            const lit = clamp01(depth * 3 - i)
            return (
              <MdKeyboardArrowDown
                key={i}
                aria-hidden
                className="-my-[6%] text-accent-bright"
                style={{ opacity: 0.22 + lit * 0.78, transform: `translateY(${lit * 10}%)` }}
              />
            )
          })}
        </div>
      )
    case 'drip':
      // A droplet that stretches thin as it falls and rounds out as it lands,
      // pooling wider the longer the stretch is held.
      return (
        <div className="absolute inset-0">
          <div
            className="absolute bottom-[15%] left-1/2 h-[3%] -translate-x-1/2 rounded-full bg-accent-bright/40 ring-1 ring-accent-bright/70"
            style={{ width: `${16 + depth * 46}%` }}
          />
          <div
            className="absolute left-1/2 h-[19%] w-[19%] rounded-full bg-accent-bright/40 ring-1 ring-accent-bright/70"
            style={{
              top: `${16 + depth * 56}%`,
              transform: `translateX(-50%) scaleY(${1 + (1 - depth) * 0.4}) scaleX(${1 - (1 - depth) * 0.2})`,
            }}
          />
        </div>
      )
    case 'stairs':
      // Four steps descending left-to-right that light up one at a time — the
      // most literal shape of the family, useful when the depth cue matters more
      // than the mood.
      return (
        <div className="absolute inset-0">
          {[0, 1, 2, 3].map((i) => {
            const lit = clamp01(depth * 4 - i)
            return (
              <div
                key={i}
                className="absolute h-[7%] w-[28%] rounded-full bg-accent-bright"
                style={{ left: `${18 + i * 12}%`, top: `${24 + i * 15}%`, opacity: 0.18 + lit * 0.72 }}
              />
            )
          })}
        </div>
      )
    case 'press': {
      // A plate bearing down on a block that compresses under it — weight going
      // into the stretch, held rather than bounced.
      const baseHeight = 34 - depth * 20
      return (
        <div className="absolute inset-0">
          <div
            className="absolute left-1/2 h-[8%] w-[54%] -translate-x-1/2 rounded-full bg-accent-bright/40 ring-1 ring-accent-bright/70"
            style={{ top: `${40 + depth * 20}%` }}
          />
          <div
            className="absolute bottom-[18%] left-1/2 w-[36%] -translate-x-1/2 rounded-[14%] border border-accent-bright/70 bg-accent-bright/15"
            style={{ height: `${baseHeight}%` }}
          />
        </div>
      )
    }
    case 'reach':
    default:
      // An orb that travels down a track and grows slightly as it settles low,
      // like reaching toward the floor and holding there.
      return (
        <div className="absolute inset-0">
          <div className="absolute left-1/2 top-[14%] h-[68%] w-[2px] -translate-x-1/2 rounded-full bg-accent-bright/15" />
          <div
            className="absolute left-1/2 h-[26%] w-[26%] rounded-full bg-accent-bright/40 ring-1 ring-accent-bright/70"
            style={{ top: `${20 + depth * 60}%`, transform: `translate(-50%, -50%) scale(${0.85 + depth * 0.35})` }}
          />
        </div>
      )
  }
}

/** Smooth ease-in-out so each phase accelerates then settles, like a breath. */
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

export function RhythmGuide({
  tempo,
  reps,
  running = true,
  startRep = 1,
  onRep,
}: {
  tempo: string
  reps?: number
  running?: boolean
  /** Rep to resume counting from — lets a reloaded session pick up where it left off. */
  startRep?: number
  /** Fired as each rep completes, so the caller can persist the count. */
  onRep?: (rep: number) => void
}) {
  const phases = useMemo(() => parseTempo(tempo), [tempo])
  const depths = useMemo(() => phaseDepths(phases), [phases])
  const motion = useMemo(() => motionForPhases(phases), [phases])
  const [variant] = useState<Variant>(() => pickVariant(motion))
  const [idx, setIdx] = useState(0)
  const [rep, setRep] = useState(startRep)
  // The rep count also lives in a ref so the animation loop increments from the
  // latest value without needing `rep` as an effect dependency (which would
  // restart the in-flight phase every rep).
  const repRef = useRef(startRep)
  /** How far (0–1) we are through the current phase, driven per animation frame. */
  const [progress, setProgress] = useState(0)
  // Held in a ref for the same reason: an inline callback would otherwise change
  // identity every render and restart the phase timer.
  const onRepRef = useRef(onRep)
  onRepRef.current = onRep

  useEffect(() => {
    // Hold at the very start of the first phase until the set actually begins,
    // so the guide always kicks off from the top of the motion (e.g. the "down"
    // phase descends from standing) rather than mid-cycle.
    if (!running || phases.length === 0) return
    const dur = phases[idx % phases.length].seconds * 1000
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const elapsed = now - start
      if (elapsed >= dur) {
        const next = (idx + 1) % phases.length
        setProgress(0)
        setIdx(next)
        // A full pass through every phase is one rep. Keep counting past the
        // target — the goal is shown for reference, but reps continue until you
        // tap done.
        if (next === 0) {
          repRef.current += 1
          setRep(repRef.current)
          onRepRef.current?.(repRef.current)
        }
      } else {
        setProgress(elapsed / dur)
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [idx, phases, running])

  if (phases.length === 0) return null

  const i = idx % phases.length
  // Interpolate from the previous phase's depth to this phase's depth so the
  // motion flows continuously. A breathe cycle ends back at the top (an "up"
  // phase returns to 0), so resuming from the previous phase is right. A descent
  // cycle ends deep (a passive hang holds at 1), so a NEW rep must restart from
  // the top instead of resuming from the bottom — otherwise the shape sits frozen
  // at full depth and never shows the push-down motion each rep.
  const from =
    motion === 'descent' && i === 0 ? 0 : depths[(i - 1 + depths.length) % depths.length]
  const depth = from + (depths[i] - from) * easeInOut(progress)

  // That jump back to the top is what made the loop look choppy, so crossfade
  // it: for the first moment of a descent rep the new shape fades in up top
  // while the rep that just finished lingers at full depth and dissolves. The
  // two overlap, so there's no frame where the shape teleports or blinks out.
  // The first rep of a set has nothing behind it to dissolve.
  const fadeIn = motion === 'descent' ? loopFadeIn(phases, cycleProgress(phases, i, progress)) : 1
  const showPrevRep = fadeIn < 1 && rep > startRep

  // Once you've hit the target the whole count reads in the accent colour, so
  // "done" is a single glance at the counter rather than a comparison.
  const hitTarget = reps != null && rep >= reps

  return (
    <div className="flex flex-1 flex-col items-center py-3">
      <div className="relative flex aspect-square w-[min(86vw,50vh,30rem)] items-center justify-center">
        {motion === 'descent' ? (
          <>
            {showPrevRep && (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ opacity: 1 - fadeIn }}
              >
                <DescentShape variant={variant} depth={depths[depths.length - 1]} />
              </div>
            )}
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ opacity: fadeIn }}
            >
              <DescentShape variant={variant} depth={depth} />
            </div>
          </>
        ) : (
          <BreatheShape variant={variant} scale={scaleFromDepth(depth)} />
        )}
      </div>
      {/* Sits at the bottom of the guide, under the shape: the animation carries
          the pace, so the count is the only thing worth reading. */}
      <div className="mt-auto pt-4 text-center text-4xl font-bold tabular-nums text-accent-bright">
        rep {rep}
        {reps ? (
          <span className={hitTarget ? undefined : 'text-neutral-400'}> / {reps}</span>
        ) : (
          ''
        )}
      </div>
    </div>
  )
}
