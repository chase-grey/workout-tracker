/**
 * What a typed weight field means.
 *
 * Blank is not zero: a set logged with the field cleared was done at bodyweight,
 * or on a machine whose load nobody wrote down, and `null` is how the row says
 * that — zero would chart as a real 0 lbs and drag every weight-based metric down
 * with it. Anything unparseable is treated the same way, since a half-typed
 * number is not a load either.
 *
 * Pure module — no React/DOM.
 */

/** The weight a typed field means: a number, or null for blank/unparseable. */
export function toWeight(v: string): number | null {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
