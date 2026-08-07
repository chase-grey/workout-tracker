import { useEffect, useRef, useState } from 'react'
import { KebabMenu, type MenuItem } from './KebabMenu'
import { SessionProgress } from './SessionProgress'

// Time-telling shapes made for rest: each one encodes the remaining fraction
// directly in its dominant dimension — a sand level, a liquid line, a candle's
// height, a stack of lit segments — so a glance reads how much rest is left.
// Any looping motion (falling sand, rising bubbles, a flickering flame) is
// texture only and never drives that level, so the time reading stays honest.
//
// Boxed shapes live in a square in the middle of the screen. Full-bleed ones use
// the entire viewport instead, sitting behind the readout — a rest you can read
// from across the gym without looking at the numbers.
const BOX_VARIANTS = ['sandglass', 'tide', 'candle', 'pips'] as const
// 'perimeter' frames the screen edge; the other two fill it, so they sit below the
// up-next block rather than behind it.
const FILL_VARIANTS = ['curtain', 'dune'] as const
const FULL_VARIANTS = ['perimeter', ...FILL_VARIANTS] as const
const VARIANTS = [...BOX_VARIANTS, ...FULL_VARIANTS] as const
type Variant = (typeof VARIANTS)[number]
type FullVariant = (typeof FULL_VARIANTS)[number]
type FillVariant = (typeof FILL_VARIANTS)[number]

function isFullBleed(v: Variant): v is FullVariant {
  return (FULL_VARIANTS as readonly string[]).includes(v)
}

function isFill(v: Variant): v is FillVariant {
  return (FILL_VARIANTS as readonly string[]).includes(v)
}

/**
 * How long after mounting the rest screen ignores a tap-to-dismiss.
 *
 * Finishing a set fires on pointerup, and the browser follows that with a
 * synthesized mouse `click` at the same coordinates. By then this overlay is
 * mounted underneath the finger, so that stray click hit-tests onto it and
 * dismissed the rest before it was ever seen. Long enough to swallow the
 * compatibility click, short enough that a deliberate tap still works.
 */
const GHOST_CLICK_GRACE_MS = 400

// Remembered across mounts (each rest remounts the timer) so we never show the
// same shape twice in a row — rest reliably rotates through the whole set.
let lastVariant: Variant | null = null
function pickVariant(): Variant {
  const pool = VARIANTS.filter((v) => v !== lastVariant)
  lastVariant = pool[Math.floor(Math.random() * pool.length)]
  return lastVariant
}

/**
 * The rest animation itself. `fraction` is how much rest is still left (1 at the
 * start, 0 when it's up); every shape maps it straight onto its level so the
 * shape *is* the timer.
 *
 * Bright green throughout — the resting animation is meant to call attention, so
 * it reads as vividly green rather than a faint wash. Dark green (accent) stays
 * reserved for the numeric timer and bar UI.
 */
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/**
 * How the perimeter path splits its time budget across the three edges it
 * crosses on each side of the screen: out along the top to the corner, down the
 * full side, then in along the bottom to the centre. Fixed weights rather than
 * measured pixel lengths — the drain still finishes exactly at zero, and this
 * needs no knowledge of the viewport's aspect ratio.
 */
const PERIMETER_WEIGHTS = { top: 0.25, side: 0.5, bottom: 0.25 } as const

/**
 * Radius of the perimeter path's bottom corners, in CSS pixels — sized to the
 * phone's own screen curvature so the sand reads as tracing the edge of the
 * display rather than a rectangle drawn just inside it. The top corners stay
 * square: they sit up under the status bar where the curve isn't read anyway.
 */
const SCREEN_CORNER_RADIUS = 44

/** Half the perimeter stroke, so the 6px band sits fully on screen. */
const PERIMETER_INSET = 3

/**
 * The perimeter shape: sand starts along the top edge of the screen, runs down
 * both sides and settles along the bottom. The bright arc is the rest still to
 * come and always touches the top; the dim track behind it is sand already
 * fallen.
 *
 * Drawn as two mirrored SVG paths rather than eight divs so the bottom corners
 * can actually curve. Each half runs from the top centre out to its corner, down
 * the side, around the bottom curve and back in to the bottom centre; the fixed
 * time weights above are converted into a distance along that real geometry, so
 * the drain still spends a quarter of the rest on the top edge and half of it on
 * the sides no matter how tall the viewport is.
 */
function PerimeterFrame({ fraction }: { fraction: number }) {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const { w, h } = size
  const inset = PERIMETER_INSET
  // Never let the curve eat more than the path has room for (a short/narrow
  // viewport would otherwise produce an arc that overshoots the centre line).
  const r = Math.max(0, Math.min(SCREEN_CORNER_RADIUS, w / 2 - inset, h - inset * 2))

  const weights = PERIMETER_WEIGHTS
  const topFill = clamp01(fraction / weights.top)
  const sideFill = clamp01((fraction - weights.top) / weights.side)
  const bottomFill = clamp01((fraction - weights.top - weights.side) / weights.bottom)

  // Pixel length of each leg one half-path crosses, used only to turn the time
  // weights into a fraction of the path's total length.
  const lTop = Math.max(0, w / 2 - inset)
  const lSide = Math.max(0, h - inset * 2 - r)
  const lBottom = (Math.PI * r) / 2 + Math.max(0, w / 2 - inset - r)
  const lTotal = lTop + lSide + lBottom
  const drawn =
    lTotal > 0 ? (lTop * topFill + lSide * sideFill + lBottom * bottomFill) / lTotal : 0

  // `dir` mirrors the path: 1 sweeps down the right edge, -1 down the left.
  const halfPath = (dir: 1 | -1) => {
    const x = (fromCentre: number) => w / 2 + dir * fromCentre
    const edge = w / 2 - inset
    return [
      `M ${x(0)} ${inset}`,
      `L ${x(edge)} ${inset}`,
      `L ${x(edge)} ${h - inset - r}`,
      `A ${r} ${r} 0 0 ${dir === 1 ? 1 : 0} ${x(edge - r)} ${h - inset}`,
      `L ${x(0)} ${h - inset}`,
    ].join(' ')
  }

  return (
    <div className="pointer-events-none absolute inset-0 text-accent-bright" aria-hidden>
      <svg className="absolute inset-0" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {([1, -1] as const).map((dir) => (
          <g key={dir} fill="none" stroke="currentColor" strokeWidth={6}>
            {/* The full loop, dim: the path the sand travels. */}
            <path d={halfPath(dir)} strokeOpacity={0.12} />
            {/* pathLength normalises the dash to 0–1, so `drawn` is used directly
                and the two halves stay in step despite different pixel lengths. */}
            <path
              d={halfPath(dir)}
              pathLength={1}
              strokeDasharray={`${drawn} 1`}
              style={{ transition: 'stroke-dasharray 260ms linear' }}
            />
          </g>
        ))}
      </svg>
      {/* Grains running along whichever edge the sand is currently crossing. */}
      {fraction > 0 && fraction < 1 && (
        <div
          className="rest-perimeter-glow absolute inset-0"
          style={{ borderBottomLeftRadius: r, borderBottomRightRadius: r }}
        />
      )}
    </div>
  )
}

/**
 * Width-to-height ratio of the 'dune' pile, held constant as it grows so the
 * slope never changes. Sand rests at about 34° from horizontal, which puts the
 * base at 2 / tan(34°) ≈ 3 times the height.
 */
const DUNE_ASPECT = 3

/**
 * Full-screen rest shapes that fill rather than frame. Same contract as the boxed
 * ones: `fraction` is how much rest is left and drives the level directly. These
 * render below the up-next block rather than behind it, so the weight and reps
 * you're about to go for stay readable while the shape runs.
 */
function FullBleedShape({ variant, fraction }: { variant: FillVariant; fraction: number }) {
  const drain = { transition: 'height 260ms linear, width 260ms linear' } as const

  if (variant === 'curtain') {
    // The whole viewport is the vessel: the level falls from the top of the
    // screen to the bottom over the rest.
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute inset-x-0 top-0 bg-accent-bright/20"
          style={{ height: `${fraction * 100}%`, ...drain }}
        >
          {/* The surface line is the reading; everything else is texture. */}
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-accent-bright" />
        </div>
      </div>
    )
  }

  // 'dune': sand falls from the top of the screen and piles into a mound on the
  // floor. The mound grows taller *and* wider as it fills — the way real sand
  // spreads at its angle of repose — so its size is the time already spent, and
  // the falling stream always lands on the growing peak.
  //
  // Width comes from the height through the fixed aspect ratio rather than from
  // its own percentage of the viewport, so the pile keeps one slope the whole way
  // up. Past roughly a third of its growth that makes it wider than the screen;
  // the overflow is clipped, which is exactly how a real pile taller than the
  // frame would look — a broad slope running off both edges, not a narrow cone
  // squeezed to fit.
  const grow = 1 - fraction
  const moundH = grow * 52 // capped so the pile never climbs the whole screen
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* The stream runs from the top of the screen down to the mound's peak. */}
      {fraction > 0 && (
        <div
          className="rest-stream absolute left-1/2 top-0 w-[3px] -translate-x-1/2"
          style={{ height: `${100 - moundH}%`, transition: 'height 260ms linear' }}
        />
      )}
      {/* The mound: two stacked domes give it a brighter, denser center ridge
          and a soft rounded peak — no straight edges to read as a seam. */}
      <div
        className="absolute bottom-0 left-1/2 w-auto -translate-x-1/2"
        style={{ height: `${moundH}%`, aspectRatio: DUNE_ASPECT, ...drain }}
      >
        <div className="absolute inset-0 rounded-t-[50%] bg-accent-bright/25" />
        <div className="absolute inset-x-[20%] bottom-0 h-[66%] rounded-t-[50%] bg-accent-bright/30" />
      </div>
    </div>
  )
}

function RestShape({ variant, fraction }: { variant: Variant; fraction: number }) {
  const level = `${fraction * 100}%`
  const filled = `${(1 - fraction) * 100}%`
  // Smooth the 250ms wall-clock steps into one continuous drain.
  const drain = { transition: 'height 260ms linear' } as const
  switch (variant) {
    case 'tide':
      // A vessel that empties: the liquid line drops from full to nothing. The
      // surface glint and slow bubbles read as liquid without moving the line.
      return (
        <div className="absolute h-[74%] w-[74%] overflow-hidden rounded-full ring-1 ring-accent-bright/50">
          <div className="absolute inset-0 bg-accent-bright/12" />
          <div className="absolute inset-x-0 bottom-0 bg-accent-bright/70" style={{ height: level, ...drain }}>
            <div className="absolute inset-x-0 top-0 h-[3px] bg-accent-bright" />
            <div className="rest-bubble absolute bottom-[8%] left-[34%] h-[6%] w-[6%] rounded-full bg-accent-bright/70" />
            <div
              className="rest-bubble absolute bottom-[8%] left-[62%] h-[4%] w-[4%] rounded-full bg-accent-bright/70"
              style={{ animationDelay: '1.6s' }}
            />
          </div>
        </div>
      )
    case 'candle':
      // A candle burning down: the wax column (darker green) is squared off like
      // a real candle and its height is the time left; the flame (brighter green)
      // rides its top downward, shedding embers, and gutters out at the base.
      return (
        <div className="absolute bottom-[12%] left-1/2 h-[74%] w-[24%] -translate-x-1/2">
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-[16%] rounded-b-[8%] bg-accent-deep/70"
            style={{ height: level, ...drain }}
          >
            {/* Melted rim across the wax top, so it reads as a candle's flat top. */}
            <div className="absolute inset-x-[10%] top-0 h-[9%] -translate-y-1/2 rounded-[50%] bg-accent-deep" />
          </div>
          {fraction > 0 && (
            <div
              className="pointer-events-none absolute left-1/2 h-[30%] w-[64%] -translate-x-1/2"
              style={{ bottom: level, marginBottom: '-4%', transition: 'bottom 260ms linear' }}
            >
              {/* Flame: a pointed teardrop with a denser inner core for depth. The
                  wide, faint outer body reads as the flame's glow. */}
              <svg
                className="rest-flame absolute bottom-0 left-1/2 h-[66%] w-[88%] -translate-x-1/2 text-accent-bright"
                viewBox="0 0 100 100"
                fill="currentColor"
                aria-hidden
              >
                <path d="M50 4 C 70 30 84 44 74 68 C 68 84 60 92 50 96 C 40 92 32 84 26 68 C 16 44 30 30 50 4 Z" opacity="0.4" />
                <path d="M50 34 C 60 46 66 54 61 68 C 58 80 54 86 50 91 C 46 86 42 80 39 68 C 34 54 40 46 50 34 Z" />
              </svg>
              {/* Embers lifting off the flame's tip and winking out. */}
              <span className="rest-ember absolute bottom-[56%] left-[42%] h-[8%] w-[8%] rounded-full bg-accent-bright" />
              <span
                className="rest-ember absolute bottom-[62%] left-[56%] h-[6%] w-[6%] rounded-full bg-accent-bright"
                style={{ animationDelay: '0.7s' }}
              />
              <span
                className="rest-ember absolute bottom-[58%] left-[50%] h-[5%] w-[5%] rounded-full bg-accent-bright"
                style={{ animationDelay: '1.3s' }}
              />
            </div>
          )}
        </div>
      )
    case 'pips': {
      // A meter that empties bottom-up: lit segments are the time left, and the
      // leading one breathes so the boundary is easy to find at a glance.
      //
      // The leading segment *drains* rather than switching off — its fill sinks
      // to nothing before the segment below takes over as the leading one. A lit
      // pip never vanishes mid-pulse at full brightness, so the boundary slides
      // down the meter continuously instead of hopping segment to segment.
      const total = 6
      const exact = fraction * total
      const leading = Math.floor(exact)
      return (
        <div className="absolute inset-y-[10%] left-1/2 flex w-[26%] -translate-x-1/2 flex-col-reverse gap-1.5">
          {Array.from({ length: total }, (_, i) => (
            <div key={i} className="relative flex-1 overflow-hidden rounded-full bg-accent-bright/12">
              <div
                className={`absolute inset-x-0 bottom-0 rounded-full bg-accent-bright/80 ${
                  i === leading ? 'rest-pip' : ''
                }`}
                style={{ height: `${clamp01(exact - i) * 100}%`, ...drain }}
              />
            </div>
          ))}
        </div>
      )
    }
    case 'sandglass':
    default:
      // An hourglass: the top chamber's sand drains out the neck (its surface
      // descending as time runs out) and piles up in the bottom chamber.
      return (
        <div className="absolute inset-[8%]">
          {/* Caps frame the glass as a timer object. */}
          <div className="absolute inset-x-[6%] top-0 h-[4%] rounded-full bg-accent-bright/60" />
          <div className="absolute inset-x-[6%] bottom-0 h-[4%] rounded-full bg-accent-bright/60" />
          <div
            className="absolute inset-x-0 top-[4%] h-[46%] overflow-hidden"
            style={{ clipPath: 'polygon(2% 0, 98% 0, 55% 100%, 45% 100%)' }}
          >
            <div className="absolute inset-0 bg-accent-bright/12" />
            <div className="absolute inset-x-0 bottom-0 bg-accent-bright/80" style={{ height: level, ...drain }} />
          </div>
          <div
            className="absolute inset-x-0 bottom-[4%] h-[46%] overflow-hidden"
            style={{ clipPath: 'polygon(45% 0, 55% 0, 98% 100%, 2% 100%)' }}
          >
            <div className="absolute inset-0 bg-accent-bright/12" />
            <div className="absolute inset-x-0 bottom-0 bg-accent-bright/80" style={{ height: filled, ...drain }} />
          </div>
          {/* A thin stream through the neck while sand is still falling. */}
          {fraction > 0 && fraction < 1 && (
            <div className="rest-stream absolute left-1/2 top-1/2 h-[12%] w-[2.5%] -translate-x-1/2 -translate-y-1/2 rounded-full" />
          )}
        </div>
      )
  }
}

/**
 * Full-screen rest countdown. Wall-clock based: it tracks a target end time and
 * derives the remaining seconds from `Date.now()`, so it stays accurate even
 * when the browser throttles/pauses timers in the background — switch apps and
 * come back and it reflects the real elapsed time. Counts into overtime until
 * dismissed. No system notifications by design.
 *
 * The rest animation is the timer: a restful shape (a sandglass, a draining
 * vessel, a burning-down candle) encodes the time left directly in its level — a
 * calm, glanceable cue for how much rest is left — while the numeric countdown
 * (in dark green) sits at the bottom of the screen. Because the level is derived
 * from the wall-clock end time (not a CSS loop), it stays in sync after
 * backgrounding or a reload. Optional `upNext` tells the resting
 * user what's coming; `progress` + `timeLeftLabel` (rendered verbatim, so the
 * caller phrases it — "~5 min left in workout") show the same session progress
 * bar as the session header — pinned to the top of the rest screen — so rest says
 * how far in you are and not just how long is left. `nextSet` puts the numbers you
 * came here for on the screen you're already looking at: what to load and how many
 * reps to go for on the set this rest is leading into. `menu` keeps the session's
 * overflow actions reachable without ending rest first.
 */
export function RestTimer({
  seconds,
  endsAt,
  onClose,
  upNext,
  nextSet,
  progress,
  timeLeftLabel,
  autoAdvance,
  menu,
}: {
  seconds: number
  /**
   * When this rest ends (epoch ms). Pass a saved value to resume a rest that was
   * already running — e.g. after a page reload. Defaults to a fresh `seconds`
   * countdown starting now.
   */
  endsAt?: number
  onClose: () => void
  upNext?: string | null
  /**
   * What to go for on the set this rest leads into — `target` is the load and reps
   * ("135 × 8"), `position` is where that set falls in its exercise ("set 2/4").
   */
  nextSet?: { target: string | null; position: string } | null
  /** Session position for the progress bar — completed sets out of the total. */
  progress?: { done: number; total: number; unit?: string }
  timeLeftLabel?: string | null
  /**
   * Roll into the next set the moment rest is up, with no tap. Set per exercise
   * from the overflow menu; the countdown and shape are unchanged, they just stop
   * waiting at zero.
   */
  autoAdvance?: boolean
  /** Overflow actions for the 3-dots menu, mirroring the session header's. */
  menu?: MenuItem[]
}) {
  const endRef = useRef<number>(endsAt ?? Date.now() + seconds * 1000)
  // When this overlay mounted, so a tap that belongs to the *previous* screen
  // can't dismiss it. The set-advance button fires on pointerup (see
  // usePressAction) and the browser then emits a compatibility mouse `click` at
  // the same coordinates — which now hit-tests onto this freshly-mounted overlay
  // and closed the rest instantly, so no rest screen appeared at all.
  const mountedAt = useRef(Date.now())
  // Kept in milliseconds, not whole seconds: the shape's level is derived from
  // this, and rounding here would step it once a second — a staircase the drain
  // transition can't smooth over. The readout rounds for display instead.
  const [remainingMs, setRemainingMs] = useState(() => endRef.current - Date.now())
  const [variant] = useState<Variant>(pickVariant)
  const buzzed = useRef(false)
  // The ticker runs on a mount-only effect, so auto-advance reads its trigger and
  // its callback through refs rather than re-subscribing whenever either changes.
  const autoRef = useRef(autoAdvance)
  autoRef.current = autoAdvance
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const advanced = useRef(false)

  useEffect(() => {
    const tick = () => {
      const ms = endRef.current - Date.now()
      setRemainingMs(ms)
      if (ms <= 0 && !buzzed.current) {
        buzzed.current = true
        navigator.vibrate?.(400)
      }
      // On auto, zero is the tap: the buzz still fires, then rest ends itself.
      if (ms <= 0 && autoRef.current && !advanced.current) {
        advanced.current = true
        closeRef.current()
      }
    }
    tick()
    const id = setInterval(tick, 250)
    // Recompute immediately when returning to the app (timers throttle while hidden).
    const onWake = () => tick()
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [])

  const remaining = Math.round(remainingMs / 1000)
  const over = remaining < 0
  const abs = Math.abs(remaining)
  const label = `${over ? '+' : ''}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`
  // How much of the rest is still left (1 at the start, 0 when rest is up). Each
  // shape encodes this directly as its level — a sand column, a liquid line, a
  // candle's height — so the animation itself reads as the timer. Taken from the
  // millisecond value so the level advances every tick and the drain transition
  // has a small, continuous step to smooth rather than a full second's jump.
  const remainingFraction = seconds > 0 ? clamp01(remainingMs / (seconds * 1000)) : 0
  const full = isFullBleed(variant)
  const fills = isFill(variant)

  /**
   * Wrap a handler so the ghost click that ended the previous set can't trigger it.
   * Applied to tap-to-dismiss so a stray click can't skip the rest entirely.
   */
  const afterGrace = (fn: () => void) => () => {
    if (Date.now() - mountedAt.current < GHOST_CLICK_GRACE_MS) return
    fn()
  }
  const dismiss = afterGrace(onClose)

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center overflow-hidden bg-black px-6"
      onClick={dismiss}
    >
      {/* The perimeter shape frames the screen edge, so it spans the whole overlay
          and passes behind everything without covering any of it. */}
      {variant === 'perimeter' && <PerimeterFrame fraction={remainingFraction} />}

      {/* Top region: the "how far through the workout" bar sits at the very top,
          with the up-next/menu row and then the numbers for the coming set. This is
          the part you're resting to read, so it gets the top of the screen and the
          filling shapes start below it. */}
      <div className="relative z-10 w-full pt-[calc(0.75rem+env(safe-area-inset-top))]">
        {progress && (
          <SessionProgress
            done={progress.done}
            total={progress.total}
            unit={progress.unit ?? 'sets'}
            timeLeftLabel={timeLeftLabel}
            className="w-full"
          />
        )}
        {(upNext || menu) && (
          // One row: the menu sits at the right with "up next" still centered
          // between the edges, so a long exercise name can't run underneath it.
          <div className="mt-3 flex w-full items-start gap-2">
            <div className="w-11 shrink-0" aria-hidden />
            <p className="flex-1 pt-2.5 text-center text-base font-semibold text-neutral-200">{upNext}</p>
            {/* Tapping the overlay ends rest, so the menu keeps its taps to itself. */}
            <div className="w-11 shrink-0" onClick={(e) => e.stopPropagation()}>
              {menu && <KebabMenu items={menu} />}
            </div>
          </div>
        )}
        {nextSet && (
          // The load and the rep target for the set you're about to do, big enough
          // to read at arm's length while you're walking back to the bar.
          <div className="mt-3 flex flex-col items-center gap-1">
            {nextSet.target && (
              <span className="text-4xl font-bold tabular-nums text-white">{nextSet.target}</span>
            )}
            <span className="text-sm font-semibold tracking-wide text-neutral-400">
              {nextSet.position}
            </span>
          </div>
        )}
      </div>

      {/* The animation is the timer: the shape's level carries the countdown
          (full at the start, empty when rest is up); any looping motion is just
          texture and never drives the level. A filling shape and a boxed one both
          take the space under the numbers above rather than running behind them. */}
      <div className="relative flex w-full flex-1 items-center justify-center">
        {fills && <FullBleedShape variant={variant} fraction={remainingFraction} />}
        {!full && (
          <div className="relative flex aspect-square w-[min(86vw,30rem)] items-center justify-center">
            <RestShape variant={variant} fraction={remainingFraction} />
          </div>
        )}
      </div>

      <div className="relative z-10 flex flex-col items-center gap-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {/* Dark green for the timer UI, overtime included — the leading "+" says
            you're past due without the number brightening to grab at you. */}
        <div className="font-mono text-7xl font-bold tabular-nums text-accent">{label}</div>
        {/* The session progress bar now lives at the top; when there's no bar to
            show, fall back to the bare time-left line here. */}
        {!progress && timeLeftLabel && (
          <p className="text-sm font-medium text-neutral-400">{timeLeftLabel}</p>
        )}
      </div>
    </div>
  )
}
