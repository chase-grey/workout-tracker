import { useEffect, useMemo, useRef, useState } from 'react'
import { MdKeyboardArrowDown } from 'react-icons/md'
import { parseTempo } from '../lib/tempo'
import {
  cycleCloses,
  cycleProgress,
  hitRepTarget,
  loopFadeIn,
  motionForPhases,
  phaseDepths,
  phaseEfforts,
  repGlow,
  strain,
  type MotionKind,
  type RepGlow,
} from '../lib/rhythmMotion'
import { createRotation, type Rotation } from '../lib/variantRotation'

/**
 * An abstract, nature-inspired rhythm animation that paces a stretch's tempo.
 * The shape family is chosen from the stretch's motion (see rhythmMotion):
 * - 'breathe' shapes expand/contract for down · hold · up reps (Tailor's Pose).
 * - 'descent' shapes drive downward and then release for push-and-rest reps
 *   (Pancake Hang) rather than forcing a breathing shape to fit them. Their two
 *   segments are told apart by more than position: working is bright, crisp and
 *   faintly straining, resting is dim, soft and still.
 * A random variant within the family is chosen per mount, so it varies from one
 * set to the next.
 *
 * No rep count on screen: mid-stretch you're upside down or eyes-closed, and a
 * number you have to focus on to read is worse than useless there. The reps are
 * still counted (the caller persists them, and the target still ends the set) —
 * the guide just says it by brightening once the set is done.
 */
const BREATHE_VARIANTS = ['orb', 'square', 'rings', 'tide', 'petals', 'bars', 'halo'] as const
const DESCENT_VARIANTS = ['reach', 'fold', 'dive', 'drip', 'stairs', 'press'] as const
type Variant = (typeof BREATHE_VARIANTS)[number] | (typeof DESCENT_VARIANTS)[number]

// One rotation per family, held across mounts (each set remounts the guide): the
// order stays random, but a shape never follows itself and none of them sits out
// for long. See lib/variantRotation.
const rotations: Record<MotionKind, Rotation<Variant>> = {
  breathe: createRotation(BREATHE_VARIANTS),
  descent: createRotation(DESCENT_VARIANTS),
}
function pickVariant(kind: MotionKind): Variant {
  return rotations[kind].next()
}

/** Depth 0–1 (0 = neutral/top, 1 = deepest) mapped to a breathing orb's scale. */
const SCALE_MIN = 0.55
const scaleFromDepth = (depth: number) => 1 - depth * (1 - SCALE_MIN)

/**
 * Every shape draws from the same palette so that hitting the set's target lights
 * the whole guide up at once: the accent goes from a washed-out fill to near-full
 * opacity, which over the dark background is the difference between a dim green
 * and an unmistakably bright one. 'final' sits between the two — a set that ends
 * itself lifts its closing rep just enough to notice without pre-empting the
 * brightening that marks the set actually being done.
 */
const TONES: Record<RepGlow, {
  fill: string
  ring: string
  border: string
  track: string
  /** Floor for shapes that fade parts in with depth — never fully dim. */
  dimmest: number
}> = {
  base: {
    fill: 'bg-accent-bright/40',
    ring: 'ring-1 ring-accent-bright/70',
    border: 'border-accent-bright/70',
    track: 'bg-accent-bright/15',
    dimmest: 0.2,
  },
  final: {
    fill: 'bg-accent-bright/55',
    ring: 'ring-1 ring-accent-bright/85',
    border: 'border-accent-bright/85',
    track: 'bg-accent-bright/25',
    dimmest: 0.33,
  },
  done: {
    fill: 'bg-accent-bright/80',
    ring: 'ring-1 ring-accent-bright',
    border: 'border-accent-bright',
    track: 'bg-accent-bright/40',
    dimmest: 0.5,
  },
}

/** Breathing family: a shape that expands (neutral) and contracts (deep). */
function BreatheShape({ variant, scale, glow }: { variant: Variant; scale: number; glow: RepGlow }) {
  // Scale is interpolated per animation frame by the parent, so the shape needs
  // no CSS transition of its own — that would only lag behind the live value.
  const tone = TONES[glow]
  switch (variant) {
    case 'square':
      return (
        <div
          className={`absolute h-[73%] w-[73%] rounded-[14%] ${tone.fill} ${tone.ring}`}
          style={{ transform: `scale(${scale}) rotate(${(scale - 0.55) * 25}deg)` }}
        />
      )
    case 'rings':
      return (
        <>
          {[73, 53, 33].map((pct, i) => (
            <div
              key={i}
              className={`absolute rounded-full border ${tone.border}`}
              style={{ width: `${pct}%`, height: `${pct}%`, transform: `scale(${scale})` }}
            />
          ))}
        </>
      )
    case 'tide':
      return (
        <div className={`absolute h-[73%] w-[73%] overflow-hidden rounded-full ${tone.ring}`}>
          <div className={`absolute bottom-0 left-0 w-full ${tone.fill}`} style={{ height: `${scale * 100}%` }} />
        </div>
      )
    case 'petals':
      // Six dots drawn in toward the center and pushed back out — the breath
      // read as a ring closing rather than a single body shrinking.
      return (
        <div className="absolute h-[73%] w-[73%]">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="absolute inset-0" style={{ transform: `rotate(${i * 60}deg) scale(${scale})` }}>
              <div
                className={`absolute left-1/2 top-0 h-[21%] w-[21%] -translate-x-1/2 rounded-full ${tone.fill} ${tone.ring}`}
              />
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
              className={`w-[9%] rounded-full ${tone.fill} ${tone.ring}`}
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
            className={`absolute h-[58%] w-[58%] rounded-full blur-2xl ${tone.fill}`}
            style={{ transform: `scale(${scale})` }}
          />
          <div
            className={`absolute h-[73%] w-[73%] rounded-full border ${tone.border}`}
            style={{ transform: `scale(${1 + SCALE_MIN - scale})` }}
          />
        </>
      )
    case 'orb':
    default:
      return (
        <div
          className={`absolute h-[73%] w-[73%] rounded-full ${tone.fill} ${tone.ring}`}
          style={{ transform: `scale(${scale})` }}
        />
      )
  }
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** Descent family: a shape that reaches/folds downward and settles deep. */
function DescentShape({ variant, depth, glow }: { variant: Variant; depth: number; glow: RepGlow }) {
  const tone = TONES[glow]
  switch (variant) {
    case 'fold':
      // A panel that hinges shut — upright when neutral, folded flat when deep,
      // like the body folding forward over the legs.
      return (
        <div
          className={`absolute h-[70%] w-[58%] rounded-[16%] ${tone.fill} ${tone.ring}`}
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
                style={{
                  opacity: tone.dimmest + lit * (1 - tone.dimmest),
                  transform: `translateY(${lit * 10}%)`,
                }}
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
            className={`absolute bottom-[15%] left-1/2 h-[3%] -translate-x-1/2 rounded-full ${tone.fill} ${tone.ring}`}
            style={{ width: `${16 + depth * 46}%` }}
          />
          <div
            className={`absolute left-1/2 h-[19%] w-[19%] rounded-full ${tone.fill} ${tone.ring}`}
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
                style={{
                  left: `${18 + i * 12}%`,
                  top: `${24 + i * 15}%`,
                  opacity: tone.dimmest + lit * (1 - tone.dimmest),
                }}
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
            className={`absolute left-1/2 h-[8%] w-[54%] -translate-x-1/2 rounded-full ${tone.fill} ${tone.ring}`}
            style={{ top: `${40 + depth * 20}%` }}
          />
          <div
            className={`absolute bottom-[18%] left-1/2 w-[36%] -translate-x-1/2 rounded-[14%] border ${tone.border} ${tone.track}`}
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
          <div
            className={`absolute left-1/2 top-[14%] h-[68%] w-[2px] -translate-x-1/2 rounded-full ${tone.track}`}
          />
          <div
            className={`absolute left-1/2 h-[26%] w-[26%] rounded-full ${tone.fill} ${tone.ring}`}
            style={{ top: `${20 + depth * 60}%`, transform: `translate(-50%, -50%) scale(${0.85 + depth * 0.35})` }}
          />
        </div>
      )
  }
}

/** Smooth ease-in-out so each phase accelerates then settles, like a breath. */
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
/** Working: commit fast, then grind the last of the range out against resistance. */
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
/** Resting: leave and arrive unhurried, like letting the tension bleed off. */
const easeInOutSine = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2

/**
 * How the descent family reads its two kinds of segment, on top of the depth it
 * travels: working is bright, crisp and faintly shaky, resting is dim, soft and
 * still. The floors matter — a rest segment has to stay clearly visible, since
 * you're still holding the stretch through it.
 */
const REST_DIM = 0.55
const REST_BLUR_PX = 1.5
const STRAIN_PCT = 0.7

export function RhythmGuide({
  tempo,
  reps,
  running = true,
  startRep = 1,
  onRep,
  onTargetHit,
  endsOnTarget = false,
}: {
  tempo: string
  reps?: number
  running?: boolean
  /** Rep to resume counting from — lets a reloaded session pick up where it left off. */
  startRep?: number
  /** Fired as each rep completes, so the caller can persist the count. */
  onRep?: (rep: number) => void
  /**
   * Fired once, when the last target rep finishes and the count moves past it —
   * the same instant the guide brightens. The guide keeps pacing either way; this
   * only lets the caller act on the set being done (see the stretch session's
   * auto-advance into rest). Never fired for a set resumed past its target.
   */
  onTargetHit?: () => void
  /**
   * The set ends on its own when the target rep does (hands-free), which the
   * guide gives away by lighting that last rep a step brighter than the ones
   * before it — see `repGlow`.
   */
  endsOnTarget?: boolean
}) {
  const phases = useMemo(() => parseTempo(tempo), [tempo])
  const depths = useMemo(() => phaseDepths(phases), [phases])
  const efforts = useMemo(() => phaseEfforts(phases), [phases])
  const closes = useMemo(() => cycleCloses(phases), [phases])
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
  const onTargetRef = useRef(onTargetHit)
  onTargetRef.current = onTargetHit
  // The target is crossed once per set (the guide is remounted per set), so the
  // reps that keep counting past it don't fire it again.
  const hitOnce = useRef(false)

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
        // target — the goal is shown for reference, and reps continue until the
        // set is ended, by a tap or by `onTargetHit` rolling it into rest.
        if (next === 0) {
          repRef.current += 1
          setRep(repRef.current)
          onRepRef.current?.(repRef.current)
          if (hitRepTarget(repRef.current, reps) && !hitOnce.current) {
            hitOnce.current = true
            onTargetRef.current?.()
          }
        }
      } else {
        setProgress(elapsed / dur)
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [idx, phases, running, reps])

  if (phases.length === 0) return null

  const i = idx % phases.length
  const prev = (i - 1 + depths.length) % depths.length
  // Interpolate from the previous phase's depth to this phase's depth so the motion
  // flows continuously — and, because the previous phase of the first one is the
  // last, continuously around the rep boundary too. A push · rest tempo therefore
  // loops on itself with nothing to hide: it ends the rest segment at exactly the
  // depth the next push starts from. Only a curve that never moves needs the reset
  // below, and then the first phase has to restart from the top by hand.
  const from = motion === 'descent' && i === 0 && !closes ? 0 : depths[prev]
  // Each segment is eased in its own character: driving deeper commits fast and
  // then grinds, releasing drifts off and settles. Half the work/rest read is here,
  // in how the same travel is spent.
  const ease =
    motion !== 'descent' ? easeInOut : depths[i] > from ? easeOutCubic : easeInOutSine
  const depth = from + (depths[i] - from) * ease(progress)

  // Effort crosses between segments on its own gentle curve, so the shape brightens
  // and sharpens as you push and goes soft and still as you let go.
  const effort = efforts[prev] + (efforts[i] - efforts[prev]) * easeInOut(progress)
  const tremor = strain(effort, progress)

  // Fallback for the frozen-curve case only: for the first moment of the new rep
  // the shape fades in up top while the finished one lingers deep and dissolves, so
  // there's no frame where it teleports. The first rep has nothing behind it.
  const fadeIn =
    motion === 'descent' && !closes ? loopFadeIn(phases, cycleProgress(phases, i, progress)) : 1
  const showPrevRep = fadeIn < 1 && rep > startRep

  // Once you've finished the target the shape brightens, and that is the whole of
  // how the guide says you're done — a change you catch out of the corner of your
  // eye rather than a number to read. It waits for the last rep to end, not to
  // begin, so the brightening lands as the set closes. When the set will close
  // itself, the last rep is already lit a step above the others on its way there.
  const glow = repGlow(rep, reps, endsOnTarget)

  return (
    <div className="flex flex-1 flex-col items-center justify-center py-3">
      <div className="relative flex aspect-square w-[min(86vw,50vh,30rem)] items-center justify-center">
        {motion === 'descent' ? (
          <>
            {showPrevRep && (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ opacity: 1 - fadeIn }}
              >
                <DescentShape variant={variant} depth={depths[depths.length - 1]} glow={glow} />
              </div>
            )}
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                opacity: fadeIn * (REST_DIM + effort * (1 - REST_DIM)),
                filter: `blur(${(1 - effort) * REST_BLUR_PX}px)`,
                transform: `translateY(${tremor * STRAIN_PCT}%)`,
              }}
            >
              <DescentShape variant={variant} depth={depth} glow={glow} />
            </div>
          </>
        ) : (
          <BreatheShape variant={variant} scale={scaleFromDepth(depth)} glow={glow} />
        )}
      </div>
    </div>
  )
}
