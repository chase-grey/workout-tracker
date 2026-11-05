/**
 * Ordinary least squares of y on x, with how sure the slope is.
 *
 * `slopeSE` is the standard error of the slope under the usual assumptions —
 * residuals independent with a common spread — which is what a run of
 * morning weigh-ins or scale readings roughly is. It needs a third point to
 * exist at all (two points fit any line exactly and say nothing about scatter),
 * so the fit is null under three points, and null when every x is the same.
 */
export type LineFit = {
  slope: number
  intercept: number
  slopeSE: number
  /** The fitted value at the mean x — the line's centre. */
  meanY: number
  n: number
}

export function fitLine(xs: number[], ys: number[]): LineFit | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return null
  let sx = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]
    sy += ys[i]
  }
  const mx = sx / n
  const my = sy / n
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    sxx += dx * dx
    sxy += dx * (ys[i] - my)
  }
  if (sxx === 0) return null
  const slope = sxy / sxx
  const intercept = my - slope * mx
  let sse = 0
  for (let i = 0; i < n; i++) {
    const r = ys[i] - (intercept + slope * xs[i])
    sse += r * r
  }
  const slopeSE = Math.sqrt(sse / (n - 2) / sxx)
  return { slope, intercept, slopeSE, meanY: my, n }
}

/** The fitted value at `x`. */
export const lineAt = (fit: LineFit, x: number): number => fit.intercept + fit.slope * x

/**
 * A trend that follows the data instead of ruling one line across all of it:
 * at any x, a straight line is fitted through the points nearby, each weighted
 * by how near it is, and read at that x. Far from the ends it behaves like a
 * moving average that keeps up with a slope; at the ends it is a line through
 * the last stretch of points, read at the edge, so the trend ends where the
 * latest points are instead of where the whole span's line would have put it
 * (which, after a fast fortnight, is pounds under the scale).
 *
 * Nearness is a tricube window `halfWidth` wide each side — a point at the
 * edge counts for nothing, one at the centre for everything — opened wider
 * wherever it would hold fewer than {@link LOCAL_MIN_POINTS}, so a sparse run
 * still gets a line and not a wobble through three readings.
 *
 * Every reading of the trend is a weighted sum of the points, and the weights
 * come back with it as `kernel`: with them and the residual scatter `sigma2`,
 * the error on a reading — or on the difference between two readings, whose
 * errors share the points they were read from — is a sum of squares (see
 * {@link localDiffSE}). Null under three points or with every x the same.
 */
export type LocalTrend = {
  n: number
  /** Residual variance about the trend. */
  sigma2: number
  at(x: number): LocalFit
}

export type LocalFit = {
  value: number
  slope: number
  /** The weight each input point carried in `value`; they sum to one. */
  kernel: number[]
}

export const LOCAL_MIN_POINTS = 6

export function localTrend(xs: number[], ys: number[], halfWidth: number): LocalTrend | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 3 || xs.slice(0, n).every((x) => x === xs[0])) return null
  const x = xs.slice(0, n)
  const y = ys.slice(0, n)

  const at = (x0: number): LocalFit => {
    // Open the window out to the k-th nearest point when the fixed one is too empty.
    const dists = x.map((xi) => Math.abs(xi - x0)).sort((a, b) => a - b)
    const k = Math.min(LOCAL_MIN_POINTS, n) - 1
    const h = Math.max(halfWidth, dists[k] * 1.01, 1e-9)
    let s0 = 0
    let s1 = 0
    let s2 = 0
    const w = new Array<number>(n)
    for (let i = 0; i < n; i++) {
      const u = Math.abs(x[i] - x0) / h
      w[i] = u < 1 ? (1 - u * u * u) ** 3 : 0
      const d = x[i] - x0
      s0 += w[i]
      s1 += w[i] * d
      s2 += w[i] * d * d
    }
    let det = s0 * s2 - s1 * s1
    // Every weighted point on one x: fall back to their weighted mean, no slope.
    const flat = det <= 1e-12 * Math.max(1, s0 * s2)
    if (flat) det = s0
    const kernel = new Array<number>(n)
    let value = 0
    let slope = 0
    for (let i = 0; i < n; i++) {
      const d = x[i] - x0
      kernel[i] = flat ? w[i] / det : (w[i] * (s2 - s1 * d)) / det
      value += kernel[i] * y[i]
      if (!flat) slope += ((w[i] * (s0 * d - s1)) / det) * y[i]
    }
    return { value, slope, kernel }
  }

  // Scatter about the trend, read at every point: the squared residuals over
  // the points left after the trend has used up its share of them.
  let sse = 0
  let df = 0
  for (let i = 0; i < n; i++) {
    const fit = at(x[i])
    sse += (y[i] - fit.value) ** 2
    df += fit.kernel[i]
  }
  const sigma2 = n - df > 0.5 ? sse / (n - df) : 0

  return { n, sigma2, at }
}

/** Standard error of `a.value - b.value`, two readings of the same trend. */
export function localDiffSE(trend: LocalTrend, a: LocalFit, b: LocalFit): number {
  let sum = 0
  for (let i = 0; i < a.kernel.length; i++) sum += (a.kernel[i] - b.kernel[i]) ** 2
  return Math.sqrt(trend.sigma2 * sum)
}
