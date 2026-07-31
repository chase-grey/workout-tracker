/**
 * Population strength standards for adult MALE lifters, used to turn a lift's
 * estimated 1RM into a percentile-vs-other-men and a 0..1 "development" score
 * that colors the muscle avatar on the Progress tab.
 *
 * WHY bodyweight multiples: relative strength (1RM ÷ bodyweight) is the fairest
 * cross-lifter yardstick — it scales cleanly with size — so every threshold here
 * is stored as a MULTIPLE of bodyweight at five classic training levels
 * (Beginner → Elite), then nudged by a per-bodyweight-bracket factor because
 * relative strength declines as lifters get heavier (allometric scaling).
 *
 * SOURCE: bodyweight-multiple standards published by ExRx.net ("Strength
 * Standards", adult male tables), cross-checked against Symmetric Strength and
 * OpenPowerlifting-derived relative-strength norms. Values are rounded to the
 * nearest sensible ratio at a ~175–185 lb reference bodyweight; the bracket
 * factors below re-scale them for other bodyweights. These are bundled static
 * figures — nothing here scrapes Strength Level or any site at runtime.
 *
 * Isolation lifts (curl, tricep, leg curl) are less "standardized" than the big
 * compounds; their ratios are reasonable published proxies and are labelled as
 * approximate where surfaced.
 *
 * Pure module (no React/DOM) so the percentile + muscle-mapping logic stays
 * unit-testable.
 */

/** Standardized lift identifiers the standards table is keyed by. */
export type Lift = 'squat' | 'bench' | 'ohp' | 'row' | 'pullup' | 'curl' | 'tricep' | 'legcurl'

/** Muscle regions the avatar can color. */
export type Muscle =
  | 'chest'
  | 'shoulders'
  | 'back'
  | 'biceps'
  | 'triceps'
  | 'core'
  | 'quads'
  | 'hamstrings'

export const MUSCLES: Muscle[] = [
  'chest',
  'shoulders',
  'back',
  'biceps',
  'triceps',
  'core',
  'quads',
  'hamstrings',
]

/** Human labels for the per-lift readout. */
export const LIFT_LABELS: Record<Lift, string> = {
  squat: 'squat',
  bench: 'bench press',
  ohp: 'overhead press',
  row: 'cable row',
  pullup: 'pull-up (total load)',
  curl: 'biceps curl',
  tricep: 'triceps (isolation)',
  legcurl: 'hamstring curl',
}

/**
 * Percentile anchors for the five strength levels. Roughly: a "Novice" clears
 * ~25% of trained men, "Intermediate" ~median, "Elite" ~top few percent.
 */
const LEVEL_PCT = [5, 25, 50, 75, 95]

/**
 * est-1RM ÷ bodyweight at each level, for the ~175–185 lb reference male.
 * Order matches LEVEL_PCT: [Beginner, Novice, Intermediate, Advanced, Elite].
 */
const STANDARDS: Record<Lift, number[]> = {
  squat: [0.75, 1.25, 1.5, 2.0, 2.6],
  bench: [0.5, 0.75, 1.0, 1.5, 2.0],
  ohp: [0.35, 0.55, 0.7, 0.9, 1.15],
  row: [0.5, 0.7, 0.95, 1.25, 1.55],
  // Total load (bodyweight + any added weight) ÷ bodyweight: 1.0 ≈ a clean
  // bodyweight pull-up, ~1.65 ≈ a +65% bodyweight weighted pull-up.
  pullup: [0.8, 1.0, 1.3, 1.65, 2.1],
  curl: [0.3, 0.45, 0.6, 0.8, 1.05],
  tricep: [0.3, 0.45, 0.6, 0.8, 1.05],
  legcurl: [0.25, 0.4, 0.55, 0.75, 0.95],
}

/**
 * Bodyweight brackets and the factor applied to the reference ratios. Lighter
 * men hit higher bodyweight multiples; heavier men lower — so the same ratio
 * means different things at 140 lb vs 240 lb. Reference bracket (≈175 lb) = 1.0.
 */
const BRACKETS: { maxLb: number; factor: number }[] = [
  { maxLb: 130, factor: 1.18 },
  { maxLb: 155, factor: 1.08 },
  { maxLb: 185, factor: 1.0 },
  { maxLb: 210, factor: 0.94 },
  { maxLb: 235, factor: 0.89 },
  { maxLb: Infinity, factor: 0.84 },
]

/** Development score assigned to a muscle that's trained but has no strength standard. */
export const PRESENCE_DEV = 0.4

function bracketFactor(bodyweightLb: number): number {
  for (const b of BRACKETS) if (bodyweightLb <= b.maxLb) return b.factor
  return BRACKETS[BRACKETS.length - 1].factor
}

/** Piecewise-linear map from a bodyweight-ratio to a 0..99 percentile. */
function interpolatePercentile(ratio: number, thresholds: number[]): number {
  if (ratio <= 0) return 0
  if (ratio <= thresholds[0]) return (ratio / thresholds[0]) * LEVEL_PCT[0]
  for (let i = 1; i < thresholds.length; i++) {
    if (ratio <= thresholds[i]) {
      const t = (ratio - thresholds[i - 1]) / (thresholds[i] - thresholds[i - 1])
      return LEVEL_PCT[i - 1] + t * (LEVEL_PCT[i] - LEVEL_PCT[i - 1])
    }
  }
  // Beyond Elite: creep toward 99 over the next 25% of bodyweight-ratio.
  const last = thresholds[thresholds.length - 1]
  const lastPct = LEVEL_PCT[LEVEL_PCT.length - 1]
  const over = (ratio - last) / (last * 0.25)
  return Math.min(99, lastPct + over * (99 - lastPct))
}

/** Strength band label from a percentile. */
export function bandFor(percentile: number): string {
  if (percentile < 20) return 'beginner'
  if (percentile < 40) return 'novice'
  if (percentile < 65) return 'intermediate'
  if (percentile < 88) return 'advanced'
  return 'elite'
}

export type LiftResult = {
  /** Percentile vs. other men at this bodyweight, 0–99. */
  percentile: number
  /** Strength band label (Beginner … Elite). */
  band: string
  /** 0..1 development score (percentile / 100), for coloring the avatar. */
  developmentScore: number
}

/**
 * Percentile + development for one lift. `load` is the est 1RM already converted
 * to the value the standard expects (e.g. pull-ups pass bodyweight + added
 * weight — see EXERCISE_SOURCES).
 */
export function liftPercentile(lift: Lift, load: number, bodyweightLb: number): LiftResult {
  if (!(load > 0) || !(bodyweightLb > 0)) {
    return { percentile: 0, band: bandFor(0), developmentScore: 0 }
  }
  const ratio = load / bodyweightLb
  const thresholds = STANDARDS[lift].map((r) => r * bracketFactor(bodyweightLb))
  const percentile = Math.round(Math.max(0, Math.min(99, interpolatePercentile(ratio, thresholds))))
  return { percentile, band: bandFor(percentile), developmentScore: percentile / 100 }
}

/** How a plan exercise key contributes to a lift standard and a muscle region. */
type LiftSource = {
  /** Standardized lift for percentile, or null when there's no population standard. */
  lift: Lift | null
  muscle: Muscle
  /**
   * Convert a logged best est-1RM into the "load" the standard expects.
   * Defaults to identity — only pull-ups override it, adding bodyweight to the
   * added weight so the standard sees total load. (Incline bench is scored
   * as-is against the bench standard: it reads a touch conservative since incline
   * is harder than flat, but the displayed number stays a real est-1RM.)
   */
  toLoad?: (est1RM: number, bodyweightLb: number) => number
}

/**
 * Plan exercise key → lift/muscle mapping. A key present in `bestLiftsByKey`
 * (even at est-1RM 0, e.g. a bodyweight-only pull-up or dead bug) counts as
 * "trained" for its muscle. Keys not in the map simply don't feed the avatar.
 */
export const EXERCISE_SOURCES: Record<string, LiftSource> = {
  barbell_squat: { lift: 'squat', muscle: 'quads' },
  flat_bench: { lift: 'bench', muscle: 'chest' },
  incline_bench: { lift: 'bench', muscle: 'chest' },
  iso_chest: { lift: null, muscle: 'chest' }, // chest fly / pec deck — no standard
  db_overhead_press: { lift: 'ohp', muscle: 'shoulders' },
  lateral_raise: { lift: null, muscle: 'shoulders' }, // isolation — no standard
  weighted_pullups: { lift: 'pullup', muscle: 'back', toLoad: (e, bw) => e + bw },
  pullups_or_pulldown: { lift: 'pullup', muscle: 'back', toLoad: (e, bw) => e + bw },
  cable_row: { lift: 'row', muscle: 'back' },
  incline_db_curl: { lift: 'curl', muscle: 'biceps' },
  hammer_curl: { lift: 'curl', muscle: 'biceps' },
  tricep_pushdown: { lift: 'tricep', muscle: 'triceps' },
  overhead_tricep_ext: { lift: 'tricep', muscle: 'triceps' },
  hamstring_curl: { lift: 'legcurl', muscle: 'hamstrings' },
  deadbug: { lift: null, muscle: 'core' }, // core work — no strength standard
}

/** Every plan key the avatar reads, for building `bestLiftsByKey`. */
export const AVATAR_EXERCISE_KEYS: string[] = Object.keys(EXERCISE_SOURCES)

export type MuscleScore =
  | { hasData: false }
  | {
      hasData: true
      /** 0..1, drives the region's green fill. */
      developmentScore: number
      /** Percentile vs. men, or null when the muscle has no population standard. */
      percentile: number | null
      band: string
      /** Whether this score came from a real strength standard vs. mere presence. */
      hasStandard: boolean
    }

/**
 * Per-muscle development from a map of best est-1RM by plan exercise key.
 *
 * A muscle with none of its exercises logged is "no data" (not 0). A muscle
 * whose only logged exercises lack a standard (fly, lateral raise, dead bug) is
 * marked trained at a modest PRESENCE_DEV. Otherwise the muscle takes the best
 * (highest) percentile across its standard-backed exercises.
 */
export function muscleDevelopment(
  bestLiftsByKey: Record<string, number>,
  bodyweightLb: number,
): Record<Muscle, MuscleScore> {
  const out = {} as Record<Muscle, MuscleScore>
  for (const muscle of MUSCLES) {
    const keys = Object.keys(EXERCISE_SOURCES).filter(
      (k) => EXERCISE_SOURCES[k].muscle === muscle && k in bestLiftsByKey,
    )
    if (keys.length === 0) {
      out[muscle] = { hasData: false }
      continue
    }
    let best: LiftResult | null = null
    for (const k of keys) {
      const src = EXERCISE_SOURCES[k]
      if (src.lift == null) continue
      const load = (src.toLoad ?? ((e) => e))(bestLiftsByKey[k], bodyweightLb)
      const r = liftPercentile(src.lift, load, bodyweightLb)
      if (best == null || r.developmentScore > best.developmentScore) best = r
    }
    out[muscle] =
      best != null
        ? { hasData: true, developmentScore: best.developmentScore, percentile: best.percentile, band: best.band, hasStandard: true }
        : { hasData: true, developmentScore: PRESENCE_DEV, percentile: null, band: 'trained', hasStandard: false }
  }
  return out
}

export type LiftReadout = {
  lift: Lift
  label: string
  /** The load scored against the standard (est 1RM, total for pull-ups). */
  load: number
  percentile: number
  band: string
}

/** Order lifts appear in the readout. */
const READOUT_ORDER: Lift[] = ['squat', 'bench', 'ohp', 'pullup', 'row', 'curl', 'tricep', 'legcurl']

/**
 * One percentile readout per standardized lift the user has data for, taking the
 * best (highest-load) contributing exercise for each.
 */
export function liftReadouts(bestLiftsByKey: Record<string, number>, bodyweightLb: number): LiftReadout[] {
  const bestLoad = {} as Partial<Record<Lift, number>>
  for (const [key, src] of Object.entries(EXERCISE_SOURCES)) {
    if (src.lift == null || !(key in bestLiftsByKey)) continue
    const load = (src.toLoad ?? ((e) => e))(bestLiftsByKey[key], bodyweightLb)
    if (!(load > 0)) continue
    const prev = bestLoad[src.lift]
    if (prev == null || load > prev) bestLoad[src.lift] = load
  }
  const out: LiftReadout[] = []
  for (const lift of READOUT_ORDER) {
    const load = bestLoad[lift]
    if (load == null) continue
    const r = liftPercentile(lift, load, bodyweightLb)
    out.push({ lift, label: LIFT_LABELS[lift], load: Math.round(load), percentile: r.percentile, band: r.band })
  }
  return out
}

const LEG_MUSCLES: Muscle[] = ['quads', 'hamstrings']
const UPPER_MUSCLES: Muscle[] = ['chest', 'shoulders', 'back', 'biceps', 'triceps']

function avgDev(scores: Record<Muscle, MuscleScore>, muscles: Muscle[]): number | null {
  const vals = muscles
    .map((m) => scores[m])
    .filter((s): s is Extract<MuscleScore, { hasData: true }> => s.hasData)
    .map((s) => s.developmentScore)
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

export type Balance = { legs: number; upper: number; verdict: string }

/**
 * "Legs vs upper body" balance line, derived from the muscle development scores.
 * Returns null until there's at least one leg and one upper-body data point.
 */
export function legsVsUpper(scores: Record<Muscle, MuscleScore>): Balance | null {
  const legs = avgDev(scores, LEG_MUSCLES)
  const upper = avgDev(scores, UPPER_MUSCLES)
  if (legs == null || upper == null) return null
  const diff = legs - upper
  const verdict =
    Math.abs(diff) < 0.08
      ? 'your legs and upper body are developing in balance.'
      : diff > 0
        ? 'your legs are proportionally ahead of your upper body.'
        : 'your upper body is proportionally ahead of your legs.'
  return { legs, upper, verdict }
}
