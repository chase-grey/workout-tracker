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
