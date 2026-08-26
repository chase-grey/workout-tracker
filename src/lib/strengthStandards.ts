/**
 * Strength standards for adult MALE lifters, used to turn a logged lift into a
 * band (Beginner → Elite) and a 0..1 "development" score that colors the muscle
 * avatar on the Progress tab.
 *
 * There are two kinds of comparison here, and the difference matters:
 *
 * 1. POPULATION STANDARDS — for the movements enough men log the same way that
 *    a percentile means something (squat, bench, press, row, pull-up, curl,
 *    triceps, leg curl, calf raise). Stored as a MULTIPLE of bodyweight at five
 *    classic levels, then nudged by a per-bodyweight-bracket factor, because
 *    relative strength declines as lifters get heavier (allometric scaling).
 *
 * 2. PERSONAL LADDERS — for the movements where a population number would lie.
 *    Your own first logged sessions become the "beginner" rung and the rungs
 *    above are multiples of it, so the muscle still has somewhere to climb. See
 *    LADDER_MULTIPLES.
 *
 * SOURCES for the population table: bodyweight-multiple standards published by
 * ExRx.net ("Strength Standards", adult male tables) and Strength Level, cross-
 * checked against Symmetric Strength and OpenPowerlifting-derived relative-
 * strength norms. Values are rounded to the nearest sensible ratio at a ~175–185
 * lb reference bodyweight; the bracket factors below re-scale them for other
 * bodyweights. These are bundled static figures — nothing here scrapes any site
 * at runtime.
 *
 * Isolation lifts (curl, tricep, leg curl) are less "standardized" than the big
 * compounds; their ratios are reasonable published proxies.
 *
 * Pure module (no React/DOM) so the percentile + muscle-mapping logic stays
 * unit-testable.
 */

import { exerciseName } from '../config/plan'
import { LEG_PRESS_TO_SQUAT } from './liftRatios'

/** Standardized lift identifiers the population table is keyed by. */
export type Lift =
  | 'squat'
  | 'bench'
  | 'ohp'
  | 'row'
  | 'pullup'
  | 'curl'
  | 'tricep'
  | 'legcurl'
  | 'calfraise'

/** Muscle regions the avatar can color, ordered head → feet. */
export type Muscle =
  | 'neck'
  | 'shoulders'
  | 'chest'
  | 'back'
  | 'biceps'
  | 'triceps'
  | 'core'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'adductors'
  | 'abductors'
  | 'calves'

export const MUSCLES: Muscle[] = [
  'neck',
  'shoulders',
  'chest',
  'back',
  'biceps',
  'triceps',
  'core',
  'glutes',
  'quads',
  'hamstrings',
  'adductors',
  'abductors',
  'calves',
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
  calfraise: 'calf raise (machine load)',
}

/**
 * Percentile anchors for the five strength levels. Roughly: a "Novice" clears
 * ~25% of trained men, "Intermediate" ~median, "Elite" ~top few percent. The
 * personal ladders reuse these anchors for their five rungs, so one number
 * feeds the color scale whichever comparison a muscle is scored by.
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
  // Calves carry bodyweight all day, so the loaded ratios run far above every
  // other lift here — Strength Level's male machine-calf-raise table reads
  // 110 / 198 / 317 / 463 / 629 lb at 180 lb bodyweight. This scores the LOADED
  // weight (the pin or the bar), not load + bodyweight: that's the number those
  // tables collect, and it's what the plan's paused calf raise logs. Holding a
  // pair of dumbbells instead of using a machine will therefore read low.
  calfraise: [0.6, 1.1, 1.75, 2.55, 3.5],
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

/** Development score assigned to a muscle that's trained but can't be scored. */
export const PRESENCE_DEV = 0.4

function bracketFactor(bodyweightLb: number): number {
  for (const b of BRACKETS) if (bodyweightLb <= b.maxLb) return b.factor
  return BRACKETS[BRACKETS.length - 1].factor
}

/**
 * Piecewise-linear map from a ratio to a 0..99 position on the five-level scale.
 * `thresholds` are the ratios at each level, ascending.
 */
function interpolateLevel(ratio: number, thresholds: number[]): number {
  if (ratio <= 0) return 0
  if (ratio <= thresholds[0]) return (ratio / thresholds[0]) * LEVEL_PCT[0]
  for (let i = 1; i < thresholds.length; i++) {
    if (ratio <= thresholds[i]) {
      const t = (ratio - thresholds[i - 1]) / (thresholds[i] - thresholds[i - 1])
      return LEVEL_PCT[i - 1] + t * (LEVEL_PCT[i] - LEVEL_PCT[i - 1])
    }
  }
  // Beyond Elite: creep toward 99 over the next 25% of ratio.
  const last = thresholds[thresholds.length - 1]
  const lastPct = LEVEL_PCT[LEVEL_PCT.length - 1]
  const over = (ratio - last) / (last * 0.25)
  return Math.min(99, lastPct + over * (99 - lastPct))
}

/** Strength band label from a 0..99 position on the five-level scale. */
export function bandFor(percentile: number): string {
  if (percentile < 20) return 'beginner'
  if (percentile < 40) return 'novice'
  if (percentile < 65) return 'intermediate'
  if (percentile < 88) return 'advanced'
  return 'elite'
}

/**
 * Where each band above beginner starts, matching bandFor's cutoffs. These are
 * NOT the five level anchors: "advanced" begins at 65, between the 50 and 75
 * anchors. Reading the next tier off the anchors instead would both overstate
 * what it takes and, mid-band, name the band you're already in.
 */
const BAND_CUTS: { pct: number; band: string }[] = [
  { pct: 20, band: 'novice' },
  { pct: 40, band: 'intermediate' },
  { pct: 65, band: 'advanced' },
  { pct: 88, band: 'elite' },
]

/** Inverse of interpolateLevel: the ratio that lands exactly on `percentile`. */
function ratioAtLevel(percentile: number, thresholds: number[]): number {
  if (percentile <= 0) return 0
  if (percentile <= LEVEL_PCT[0]) return (percentile / LEVEL_PCT[0]) * thresholds[0]
  for (let i = 1; i < thresholds.length; i++) {
    if (percentile <= LEVEL_PCT[i]) {
      const t = (percentile - LEVEL_PCT[i - 1]) / (LEVEL_PCT[i] - LEVEL_PCT[i - 1])
      return thresholds[i - 1] + t * (thresholds[i] - thresholds[i - 1])
    }
  }
  const last = thresholds[thresholds.length - 1]
  const lastPct = LEVEL_PCT[LEVEL_PCT.length - 1]
  return last + ((percentile - lastPct) / (99 - lastPct)) * last * 0.25
}

/**
 * The band above `percentile` and the ratio that unlocks it, or null at elite.
 * The ratio is rounded up by the caller, so the number shown is always enough.
 */
function nextBand(percentile: number, thresholds: number[]): { band: string; ratio: number } | null {
  const cut = BAND_CUTS.find((c) => c.pct > percentile)
  if (cut == null) return null
  return { band: cut.band, ratio: ratioAtLevel(cut.pct, thresholds) }
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
  const percentile = Math.round(Math.max(0, Math.min(99, interpolateLevel(ratio, thresholds))))
  return { percentile, band: bandFor(percentile), developmentScore: percentile / 100 }
}

/**
 * What a personal ladder measures: a load in lbs, or reps in the best single set.
 */
export type LadderKind = 'load' | 'reps'

/**
 * Rungs of a personal ladder, as multiples of your own starting performance.
 * Rung one IS where you started, so a muscle reads Beginner from its very first
 * session and climbs from there.
 *
 * WHY these numbers: on a movement you're genuinely untrained at, the loaded
 * ladder (neck, weighted core work) is the honest one — men who train direct
 * neck or cable-crunch work commonly end up handling four to five times the
 * weight they opened with, so Elite sits at 4.5× and Intermediate — 2.25×, a
 * doubling — is already a real milestone.
 *
 * Reps climb far less than load does, because a set has a practical ceiling
 * before it stops being strength work: tripling your best set of hanging raises
 * is the equivalent achievement. The plan's hanging knee raise graduates to full
 * leg raises at 20 reps (see GRADUATION_REPS), which from a 10-rep opener sits
 * mid-Intermediate — right for clearing the easier variation but not the harder
 * one. Graduation then makes the movement harder under the same exercise key, so
 * reps drop; the score is taken from the best session ever, which is why it
 * stalls rather than falling back down the ladder.
 */
const LADDER_MULTIPLES: Record<LadderKind, number[]> = {
  load: [1, 1.5, 2.25, 3.25, 4.5],
  reps: [1, 1.4, 1.9, 2.5, 3.2],
}

/**
 * How many of the earliest sessions set the "beginner" anchor. One session would
 * do, but a first outing is often a feeler set at whatever weight was already on
 * the machine — taking the median of the first few keeps a single fluke, light or
 * heavy, from fixing the whole ladder in the wrong place for good.
 */
export const BASELINE_SESSIONS = 3

/** The "beginner" anchor: median of the first few non-zero sessions, or 0. */
export function baselineOf(earliest: number[]): number {
  const vals = earliest
    .filter((v) => v > 0)
    .slice(0, BASELINE_SESSIONS)
    .sort((a, b) => a - b)
  if (vals.length === 0) return 0
  const mid = vals.length >> 1
  return vals.length % 2 === 1 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2
}

export type LadderResult = {
  /** 0..99 position on the five rungs — a personal scale, NOT a percentile. */
  position: number
  band: string
  developmentScore: number
  /** The band above and what it takes to reach it; null once at Elite. */
  next: { band: string; value: number } | null
}

/**
 * Where `best` sits on a personal ladder anchored at `baseline`. Returns null
 * when there's no usable anchor yet (nothing logged, or reps-only work with no
 * reps recorded).
 */
export function ladderPosition(
  kind: LadderKind,
  baseline: number,
  best: number,
): LadderResult | null {
  if (!(baseline > 0)) return null
  const mults = LADDER_MULTIPLES[kind]
  const position = Math.round(Math.max(0, Math.min(99, interpolateLevel(best / baseline, mults))))
  const up = nextBand(position, mults)
  return {
    position,
    band: bandFor(position),
    developmentScore: position / 100,
    next: up && { band: up.band, value: Math.ceil(baseline * up.ratio) },
  }
}

/** How a plan exercise key contributes to a band and one or more muscle regions. */
type ExerciseSource = {
  /**
   * Every region the movement colors. Usually one; the squat lists two, since it
   * drives the glutes as hard as it drives the quads and there's no separate
   * glute lift in the plan to score them from.
   */
  muscles: Muscle[]
  /** Population standard to rank against, when one fits this movement. */
  lift?: Lift
  /**
   * Personal-ladder basis, for movements no population table can rank fairly.
   * `'reps'` reads the best single set's reps instead of an est-1RM.
   */
  ladder?: LadderKind
  /**
   * Convert a logged best est-1RM into the "load" the standard expects.
   * Defaults to identity. Pull-ups override it to add bodyweight to the added
   * weight, so the standard sees total load; the leg press overrides it to read as
   * the squat it implies, since that's the table it's ranked against. (Incline bench is scored
   * as-is against the bench standard: it reads a touch conservative since incline
   * is harder than flat, but the displayed number stays a real est-1RM.)
   */
  toLoad?: (est1RM: number, bodyweightLb: number) => number
}

/**
 * Plan exercise key → band/muscle mapping. A key present in the logs (even at
 * est-1RM 0, e.g. a bodyweight-only pull-up) counts as "trained" for its muscle.
 * An entry with neither `lift` nor `ladder` scores presence only. Keys not in the
 * map simply don't feed the avatar.
 *
 * WHY the neck rides a personal ladder rather than a population one: Strength
 * Level does publish male neck-extension figures (6 / 28 / 69 / 127 / 199 lb at
 * 180 lb bodyweight), but they span a 33× range — wider than any real lift —
 * because "neck extension" pools a plate balanced on the head, a harness, and a
 * four-way machine whose lever arm does most of the work. Ranking the plan's
 * light, high-rep neck work against that mixture would be a made-up number.
 *
 * The hip machines are laddered for a different reason: there is no population
 * table worth ranking against. Published abduction/adduction figures come from
 * seated machines whose pad position, start angle and pulley ratio differ from
 * gym to gym, so the same hips read wildly differently on two machines — a
 * percentile off that is noise dressed as a number. Measured against where YOU
 * started on YOUR machine, the climb is real.
 */
export const EXERCISE_SOURCES: Record<string, ExerciseSource> = {
  barbell_squat: { lift: 'squat', muscles: ['quads', 'glutes'] },
  // The plan's heavy leg movement, ranked against the squat table through the same
  // conversion the squat goals use (see liftRatios.LEG_PRESS_TO_SQUAT) — a raw
  // press number against squat standards would read Elite on ordinary legs. It
  // colors the glutes as well as the quads for the reason the squat does: there's
  // no separate glute lift in the plan to score them from.
  leg_press: {
    lift: 'squat',
    muscles: ['quads', 'glutes'],
    toLoad: (e) => e * LEG_PRESS_TO_SQUAT,
  },
  flat_bench: { lift: 'bench', muscles: ['chest'] },
  incline_bench: { lift: 'bench', muscles: ['chest'] },
  iso_chest: { muscles: ['chest'] }, // chest fly / pec deck — no standard
  db_overhead_press: { lift: 'ohp', muscles: ['shoulders'] },
  // The push day's press. Ranked against the same overhead-press table as the
  // dumbbell version and with no conversion: a fixed path is easier than free
  // weight, so the reading runs a little generous, but every gym's press machine
  // has its own lever arm and inventing a ratio per machine would be a made-up
  // number. The displayed load stays a real est-1RM either way.
  machine_overhead_press: { lift: 'ohp', muscles: ['shoulders'] },
  // Isolation — no standard. The single-arm key is retired from the plan but kept
  // here so the sessions logged under it still count toward the delts.
  lateral_raise: { muscles: ['shoulders'] },
  lateral_raise_l: { muscles: ['shoulders'] },
  lateral_raise_r: { muscles: ['shoulders'] },
  weighted_pullups: { lift: 'pullup', muscles: ['back'], toLoad: (e, bw) => e + bw },
  pullups_or_pulldown: { lift: 'pullup', muscles: ['back'], toLoad: (e, bw) => e + bw },
  // Retired from the plan — pull + legs trains back with weighted pull-ups alone
  // now — but back still reads the rows already logged, so the muscle keeps the
  // better of its two lifts rather than losing one outright.
  cable_row: { lift: 'row', muscles: ['back'] },
  incline_db_curl: { lift: 'curl', muscles: ['biceps'] },
  hammer_curl: { lift: 'curl', muscles: ['biceps'] },
  tricep_pushdown: { lift: 'tricep', muscles: ['triceps'] },
  overhead_tricep_ext: { lift: 'tricep', muscles: ['triceps'] },
  hamstring_curl: { lift: 'legcurl', muscles: ['hamstrings'] },
  calf_raise: { lift: 'calfraise', muscles: ['calves'] },
  // Both machines are retired from the plan, and kept here for the same reason the
  // single-arm raise is: the sessions logged under them are the only reading the
  // hips have, so retiring the movement shouldn't blank the avatar's inner thigh
  // and outer hip. Nothing new gets logged to them, so their ladder rungs simply
  // stop where they stopped.
  leg_adductor: { ladder: 'load', muscles: ['adductors'] },
  leg_abductor: { ladder: 'load', muscles: ['abductors'] },
  // The sideways leg raise, which trains the outer hip the abductor machine used to
  // and is the only movement still logging to it. A rep ladder rather than a load
  // one — it takes no weight at all (see PlannedExercise.repLadder), so reps in the
  // best set are the whole measure. A side each, and each reads its own hip.
  sideways_leg_raise_l: { ladder: 'reps', muscles: ['abductors'] },
  sideways_leg_raise_r: { ladder: 'reps', muscles: ['abductors'] },
  neck_extension: { ladder: 'load', muscles: ['neck'] },
  neck_flexion: { ladder: 'load', muscles: ['neck'] },
  cable_crunch: { ladder: 'load', muscles: ['core'] },
  weighted_situp: { ladder: 'load', muscles: ['core'] },
  // The stretch block's mat sit-up: the same muscles and the same load ladder as
  // the incline one above, and a separate reading, because it's a separate movement
  // trained with a separate weight (see plan.MAT_SITUP_KEY). Both feed the core, so
  // whichever is further along is what the avatar's midsection shows.
  mat_situp: { ladder: 'load', muscles: ['core'] },
  hanging_leg_raise: { ladder: 'reps', muscles: ['core'] },
  // Retired, and kept for the reason the hip machines are: the sessions logged
  // under it are part of what the core has to show, and the weighted sit-up that
  // took its slot ladders by load rather than by reps.
  deadbug: { ladder: 'reps', muscles: ['core'] },
}

/** Every plan key the avatar reads, for building the logs map. */
export const AVATAR_EXERCISE_KEYS: string[] = Object.keys(EXERCISE_SOURCES)

/**
 * What the avatar knows about one exercise. `best` and `earliest` are est-1RMs in
 * lbs, except for `ladder: 'reps'` sources where they're reps in the best single
 * set of a session (protocol-independent, unlike a session total — the plan trains
 * hanging raises for four sets some days and three others).
 */
export type ExerciseLog = {
  best: number
  /** The earliest sessions' values, oldest first (see BASELINE_SESSIONS). */
  earliest: number[]
}

export type MuscleScore =
  | { hasData: false }
  | {
      hasData: true
      /** 0..1, drives the region's green fill. */
      developmentScore: number
      band: string
      /** How the band was arrived at. */
      basis: 'standard' | 'ladder' | 'presence'
      /** Percentile vs. men at this bodyweight; only set when basis is 'standard'. */
      percentile: number | null
    }

/** Score one exercise, or null when it can't be scored (presence only). */
function scoreSource(
  key: string,
  log: ExerciseLog,
  bodyweightLb: number,
): { developmentScore: number; band: string; basis: 'standard' | 'ladder'; percentile: number | null } | null {
  const src = EXERCISE_SOURCES[key]
  if (src.lift != null) {
    const load = (src.toLoad ?? ((e) => e))(log.best, bodyweightLb)
    const r = liftPercentile(src.lift, load, bodyweightLb)
    return { developmentScore: r.developmentScore, band: r.band, basis: 'standard', percentile: r.percentile }
  }
  if (src.ladder != null) {
    const r = ladderPosition(src.ladder, baselineOf(log.earliest), log.best)
    if (r == null) return null
    return { developmentScore: r.developmentScore, band: r.band, basis: 'ladder', percentile: null }
  }
  return null
}

/**
 * Per-muscle development from the logs of each avatar exercise.
 *
 * A muscle with none of its exercises logged is "no data" (not 0). A muscle whose
 * only logged exercises can't be scored (fly, lateral raise) is marked trained at
 * a modest PRESENCE_DEV. Otherwise the muscle takes its best-developed exercise —
 * the strongest lift for a standard-backed muscle, the highest rung for a
 * laddered one.
 */
export function muscleDevelopment(
  logs: Record<string, ExerciseLog>,
  bodyweightLb: number,
): Record<Muscle, MuscleScore> {
  const out = {} as Record<Muscle, MuscleScore>
  for (const muscle of MUSCLES) {
    const keys = AVATAR_EXERCISE_KEYS.filter(
      (k) => EXERCISE_SOURCES[k].muscles.includes(muscle) && k in logs,
    )
    if (keys.length === 0) {
      out[muscle] = { hasData: false }
      continue
    }
    let best: ReturnType<typeof scoreSource> = null
    for (const k of keys) {
      const r = scoreSource(k, logs[k], bodyweightLb)
      if (r != null && (best == null || r.developmentScore > best.developmentScore)) best = r
    }
    out[muscle] =
      best != null
        ? { hasData: true, ...best }
        : {
            hasData: true,
            developmentScore: PRESENCE_DEV,
            band: 'trained',
            basis: 'presence',
            percentile: null,
          }
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
  /**
   * The band above and the load that unlocks it, in the same units as `load`
   * (so pull-ups read as a total, matching the row above it). Null at elite.
   */
  next: { band: string; value: number } | null
}

/** Order lifts appear in the population readout. */
const READOUT_ORDER: Lift[] = [
  'squat',
  'bench',
  'ohp',
  'pullup',
  'row',
  'curl',
  'tricep',
  'legcurl',
  'calfraise',
]

/**
 * One percentile readout per standardized lift the user has data for, taking the
 * best (highest-load) contributing exercise for each.
 */
export function liftReadouts(logs: Record<string, ExerciseLog>, bodyweightLb: number): LiftReadout[] {
  const bestLoad = {} as Partial<Record<Lift, number>>
  for (const [key, src] of Object.entries(EXERCISE_SOURCES)) {
    if (src.lift == null || !(key in logs)) continue
    const load = (src.toLoad ?? ((e) => e))(logs[key].best, bodyweightLb)
    if (!(load > 0)) continue
    const prev = bestLoad[src.lift]
    if (prev == null || load > prev) bestLoad[src.lift] = load
  }
  const out: LiftReadout[] = []
  for (const lift of READOUT_ORDER) {
    const load = bestLoad[lift]
    if (load == null) continue
    const r = liftPercentile(lift, load, bodyweightLb)
    const up = nextBand(r.percentile, STANDARDS[lift].map((s) => s * bracketFactor(bodyweightLb)))
    out.push({
      lift,
      label: LIFT_LABELS[lift],
      load: Math.round(load),
      percentile: r.percentile,
      band: r.band,
      next: up && { band: up.band, value: Math.ceil(up.ratio * bodyweightLb) },
    })
  }
  return out
}

export type LadderReadout = {
  /** Plan exercise key. */
  key: string
  label: string
  unit: 'lbs' | 'reps'
  /** Best logged result. */
  best: number
  /** The "beginner" anchor it's measured from. */
  baseline: number
  /** Which rung `best` sits on. */
  band: string
  /** The rung above and what it takes; null once past Elite. */
  next: { band: string; value: number } | null
}

/** Order the personal-ladder rows appear in — the muscle order, then plan order. */
const LADDER_ORDER: string[] = [
  'neck_extension',
  'neck_flexion',
  'cable_crunch',
  'weighted_situp',
  'mat_situp',
  'hanging_leg_raise',
  'deadbug',
  'leg_adductor',
  'leg_abductor',
  'sideways_leg_raise_l',
  'sideways_leg_raise_r',
]

/**
 * One row per laddered exercise with a usable anchor: where you started, where
 * you are, and what the next rung takes.
 */
export function ladderReadouts(logs: Record<string, ExerciseLog>): LadderReadout[] {
  const out: LadderReadout[] = []
  for (const key of LADDER_ORDER) {
    const src = EXERCISE_SOURCES[key]
    const log = logs[key]
    if (src?.ladder == null || log == null) continue
    const baseline = baselineOf(log.earliest)
    const r = ladderPosition(src.ladder, baseline, log.best)
    if (r == null) continue
    out.push({
      key,
      label: exerciseName(key),
      unit: src.ladder === 'reps' ? 'reps' : 'lbs',
      best: Math.round(log.best),
      baseline: Math.round(baseline),
      band: r.band,
      next: r.next,
    })
  }
  return out
}

/**
 * Calves carry the body the same way quads and hamstrings do, so they count as
 * legs. The hips (adductors, abductors) don't appear here: like the neck and
 * core they ride personal ladders, and averaging a ladder rung in with a
 * percentile would make the comparison meaningless (see legsVsUpper).
 */
const LEG_MUSCLES: Muscle[] = ['glutes', 'quads', 'hamstrings', 'calves']
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
 * Neck and core sit in neither column: they ride personal ladders, so their
 * scores say how far you've come rather than how you rank, and averaging the two
 * kinds together would make the comparison meaningless.
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
