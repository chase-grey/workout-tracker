/**
 * A reading that arrives a few times a second, turned into one that can be asked
 * for on every frame.
 *
 * The rest countdown hands its shapes a new `fraction` every 250ms. For a level
 * that creeps a few pixels a second, a CSS transition from one sample to the next
 * is plenty. For a mark that travels — the free end of the 'spiral' shape covers
 * several times the box's width over a rest — it is not: every sample restarts the
 * transition from wherever the last one had got to, so the mark's speed is set by
 * how late that particular timer tick and render happened to be, and a phone's
 * are never the same twice. It surges and stalls four times a second.
 *
 * A countdown is a straight line against the clock, though, so the samples do not
 * have to be chased one at a time. This fits the line they lie on and reads the
 * value off it at whatever instant a frame asks.
 *
 * The fit is least squares over the whole run, not a line through the newest
 * sample. A sample reaches here some milliseconds after the countdown took it —
 * a render and an effect later, and a busy phone makes that anything from one to
 * seventy — so each one sits a little off the true line, by a different amount.
 * Drawn through the newest, the line would be shoved about by exactly that error
 * four times a second, which is the fault this exists to remove. Fitted to all of
 * them, one late sample moves it by a fraction that shrinks as the run goes on.
 *
 * Things that genuinely leave the line (the rest is extended, the clock stops, the
 * countdown bottoms out at zero) start a fresh run, and the read eases across the
 * break rather than jumping it.
 */

/** A sample this long after the last one is a new run: the clock stopped between. */
const GAP_MS = 600

/** A run this short is too short to take a slope from; timer noise would swamp it. */
const MIN_FIT_MS = 200

/**
 * How far past the newest sample the line is trusted. Longer than one tick, so an
 * ordinary late sample never shows; short enough that when samples stop coming the
 * reading stops with them instead of running on.
 */
const COAST_MS = 400

/** How far off the line a sample may land, as time along it, and still belong to it. */
const SLACK_MS = 150

/** The time constant of the ease across a break in the line. */
const EASE_MS = 80

/** Closer than this to where it is going, the ease is finished. */
const SETTLED = 1e-5

type Sample = { value: number; at: number }

export type Glide = {
  /** A new sample of the reading, and when it was taken (ms, any steady clock). */
  push: (value: number, at: number) => void
  /** The reading at `now`, on the same clock. Call once a frame. */
  read: (now: number) => number
}

export function createGlide(range: { min: number; max: number } = { min: 0, max: 1 }): Glide {
  /** Where the current run started. Times and values in the sums are measured from it. */
  let origin: Sample | null = null
  let last: Sample | null = null
  // Running sums for the fit, over every sample in the run.
  let n = 0
  let sumT = 0
  let sumV = 0
  let sumTT = 0
  let sumTV = 0
  /** The fitted line: value at the origin's instant, and slope per ms. */
  let base = 0
  /** Kept across a break: the clock's pace rarely changes, only where it is. */
  let rate = 0
  /** Whether `rate` has been measured at all yet. */
  let fitted = false
  let shown: Sample | null = null

  const clamp = (n: number) => Math.max(range.min, Math.min(range.max, n))

  const lineAt = (at: number): number => {
    if (!origin || !last) return range.min
    const coasted = Math.min(at, last.at + COAST_MS)
    return clamp(base + rate * (coasted - origin.at))
  }

  const startRun = (sample: Sample) => {
    origin = sample
    last = sample
    base = sample.value
    n = 1
    sumT = sumV = sumTT = sumTV = 0
  }

  return {
    push(value, at) {
      const sample = { value, at }
      const offLine =
        fitted && Math.abs(value - lineAt(at)) > Math.abs(rate) * SLACK_MS + SETTLED
      if (!origin || !last || at - last.at > GAP_MS || at < last.at || offLine) {
        startRun(sample)
        return
      }
      last = sample
      const t = at - origin.at
      const v = value - origin.value
      n += 1
      sumT += t
      sumV += v
      sumTT += t * t
      sumTV += t * v
      if (t < MIN_FIT_MS) return
      const spread = n * sumTT - sumT * sumT
      if (spread <= 0) return
      rate = (n * sumTV - sumT * sumV) / spread
      base = origin.value + (sumV - rate * sumT) / n
      fitted = true
    },

    read(now) {
      const target = lineAt(now)
      if (!shown) {
        shown = { value: target, at: now }
        return target
      }
      const dt = Math.max(0, now - shown.at)
      let value = shown.value + (target - shown.value) * (1 - Math.exp(-dt / EASE_MS))
      if (Math.abs(target - value) < SETTLED) value = target
      shown = { value, at: now }
      return value
    },
  }
}
