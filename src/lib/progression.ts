import type { WorkoutRow } from '../types'
import type { VariantKey } from '../config/plan'
import { parseISODate, toISODate } from './dates'
import { epley1RM } from './epley'

export type Target = { weightLbs: number | null; reps: number }

/** Round a weight to the nearest 0.5 lb. */
function roundHalf(n: number): number {
  return Math.round(n * 2) / 2
}

/**
 * A lighter weight at which `repMin` reps is about as hard as `topWeight`×`topReps`
 * was — the two share an estimated 1RM, solved back for the higher rep count.
 *
 * Used when a lift is being worked too heavy for its own rep range. Rounded DOWN
 * to a whole `increment` step so the suggestion is a load that exists on the rack
 * and errs toward achievable; below a single increment there's no step to land on,
 * so the estimate itself is used.
 */
function weightForRepMin(
  topWeight: number,
  topReps: number,
  repMin: number,
  increment: number,
): number {
  const est = epley1RM(topWeight, topReps) / (1 + repMin / 30)
  const stepped = Math.floor(est / increment) * increment
  return roundHalf(stepped > 0 ? stepped : est)
}

/**
 * How long a gap makes the last session a poor basis for a step up. Come back
 * from a break, an illness or a holiday and the plan repeats what you last
 * actually did rather than demanding more on top of it — you re-pace upward from
 * a real number instead of chasing one you set while fresh.
 */
export const STALE_HISTORY_DAYS = 21

type SessionGroup = {
  date: string
  /** The A/B slot the session trained in, or undefined when none was recorded. */
  variant?: VariantKey
  sets: { weight: number | null; reps: number }[]
}

/** Whole days between two ISO dates (negative if `b` precedes `a`). */
function daysBetween(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000)
}

/**
 * The WORKING set of a session: the weight you actually trained at, and the best
 * reps you managed at it.
 *
 * Deliberately not simply the heaviest set. A session of 135×8, 135×8, 135×7,
 * 150×1 has a top set of 150×1, and building the next target off that asks for
 * 150×2 — a prescription outside the exercise's own rep range that no
 * double-progression scheme would ever produce.
 *
 * So: the heaviest weight at which a set actually reached the bottom of the
 * prescribed range. That excludes the heavy single (1 rep of an 8–12 exercise
 * isn't training that range) while still crediting the heaviest weight genuinely
 * worked, so back-off sets can't ratchet the target downward the way a plain
 * modal weight would.
 *
 * When no set reached repMin — a bad day, or a lift being worked below its range —
 * there's no in-range weight to read, so it falls back to the modal weight: the
 * one appearing in the most sets, which is robust to a single outlier. Ties go to
 * the heavier weight, since sets were completed there too.
 */
function workingSet(
  sets: { weight: number | null; reps: number }[],
  repMin: number,
): { weight: number; reps: number } | null {
  const weighted = sets.filter((s): s is { weight: number; reps: number } => s.weight != null)
  if (weighted.length === 0) return null

  const bestRepsAt = (weight: number): number =>
    weighted.reduce((best, s) => (s.weight === weight ? Math.max(best, s.reps) : best), 0)

  // Heaviest weight that carried a set into the prescribed range.
  const inRange = weighted.filter((s) => s.reps >= repMin)
  if (inRange.length > 0) {
    const weight = Math.max(...inRange.map((s) => s.weight))
    return { weight, reps: bestRepsAt(weight) }
  }

  // Nothing reached the range: fall back to the weight most sets used.
  const counts = new Map<number, number>()
  for (const s of weighted) counts.set(s.weight, (counts.get(s.weight) ?? 0) + 1)
  let weight = -Infinity
  let bestCount = 0
  for (const [w, count] of counts) {
    if (count > bestCount || (count === bestCount && w > weight)) {
      bestCount = count
      weight = w
    }
  }
  return { weight, reps: bestRepsAt(weight) }
}

/**
 * Sessions comparable to `variant`: those trained in the same A/B slot, plus any
 * whose slot wasn't recorded.
 *
 * An unrecorded slot counts as comparable rather than being thrown away — it's
 * imported history, a day that doesn't run variants, or a session logged before
 * the split shipped, none of which sat behind a second press of the same lift.
 * Passing no variant compares against everything.
 */
function comparableSessions(groups: SessionGroup[], variant?: VariantKey | null): SessionGroup[] {
  if (variant == null) return groups
  return groups.filter((g) => g.variant == null || g.variant === variant)
}

export type LastPerformance = {
  date: string
  topWeight: number | null
  topReps: number
  /**
   * True when the reading came from a session trained in the slot the caller
   * asked for — i.e. under comparable fatigue. False when no such session exists
   * and the number had to be borrowed from the other slot, which tells callers
   * not to demand a step up on top of it (see nextTarget).
   */
  sameSlot: boolean
}

/**
 * The most recent session's performance for one exercise (null if no history).
 *
 * Rows are grouped by session (session_id, falling back to date), and the group
 * with the latest date wins. `topWeight`/`topReps` describe that session's
 * WORKING set — the modal weight and the best reps at it (see workingSet), not
 * its single heaviest set. For a bodyweight exercise (every set has a null
 * weight) topWeight is null and topReps is the max reps in the session.
 */
export function lastPerformance(
  workouts: WorkoutRow[],
  exerciseKey: string,
  /**
   * Bottom of the exercise's prescribed rep range, used to tell a real working set
   * from a heavy single. Defaults to 1, which makes every set count as in-range —
   * i.e. plain "heaviest set" behaviour for callers that don't know the range.
   */
  repMin = 1,
  /**
   * The A/B slot being read for, so a lift trained twice a week under different
   * fatigue is compared against itself. Push + Core's flat bench leads variant B
   * but follows four other exercises in variant A, and reading the fresh session
   * for the tired one prescribes a weight there's no chance of hitting (and the
   * reverse under-prescribes). Omit for exercises the variants train alike.
   */
  variant?: VariantKey | null,
): LastPerformance | null {
  const bySession = new Map<string, SessionGroup>()
  for (const r of workouts) {
    if (r.exercise !== exerciseKey) continue
    const key = r.session_id || r.date
    const g = bySession.get(key) ?? { date: r.date, sets: [] }
    // A blank from the sheet or a CSV round-trip reads as "no slot recorded".
    if (g.variant == null && r.variant) g.variant = r.variant
    g.sets.push({ weight: r.weight_lbs, reps: r.reps })
    bySession.set(key, g)
  }

  if (bySession.size === 0) return null

  const groups = [...bySession.values()]
  const comparable = comparableSessions(groups, variant)
  // Nothing in this slot yet — the lift's first session in it, or its first since
  // the split shipped. Read the other slot rather than treating a known lift as
  // brand new, and flag it so the target repeats instead of stepping up.
  const sameSlot = comparable.length > 0
  const pool = sameSlot ? comparable : groups

  // Pick the session with the latest date (YYYY-MM-DD sorts lexicographically).
  let latest: SessionGroup | null = null
  for (const g of pool) {
    if (latest === null || g.date > latest.date) latest = g
  }
  if (latest === null) return null

  const working = workingSet(latest.sets, repMin)
  if (working === null) {
    // Bodyweight session: no weight anywhere, so the top set is simply most reps.
    let topReps = 0
    for (const s of latest.sets) topReps = Math.max(topReps, s.reps)
    return { date: latest.date, topWeight: null, topReps, sameSlot }
  }
  return { date: latest.date, topWeight: working.weight, topReps: working.reps, sameSlot }
}

/**
 * Suggest the next target for an exercise using double progression within
 * [repMin, repMax].
 *
 * Re-pacing note: the target is always derived from the MOST RECENT session, so
 * if the user logs below target one week, next week's target is computed from that
 * lower actual — the plan automatically re-paces to reality rather than compounding
 * an aspirational number the user never actually hit. After a gap of more than
 * STALE_HISTORY_DAYS it stops asking for a step up at all and simply repeats the
 * last working set, so coming back from a break starts from something achievable.
 *
 * `opts.variant` scopes that most-recent session to the A/B slot being trained,
 * so a lift the week hits twice under different fatigue climbs on two independent
 * ladders. Without it, the fresh press would be prescribed off a tired session and
 * the tired one asked to beat a fresh session it can't.
 *
 * The prescribed reps always land inside [repMin, repMax]. A weight you can't
 * carry to repMin is simply too heavy for the range the exercise is meant to be
 * trained in — 75×5 of an 8–12 press is a strength prescription on a hypertrophy
 * slot — so the answer is to lighten the load, not to prescribe out-of-range reps.
 * When even a step up wouldn't reach repMin, the weight drops to one that makes
 * repMin a realistic ask (see weightForRepMin) and the reps go to repMin.
 *
 * Reps-only lifts are the exception: with no load to shed, a bodyweight exercise
 * below its range can only climb back a rep at a time.
 */
export function nextTarget(
  workouts: WorkoutRow[],
  exerciseKey: string,
  opts: {
    repMin: number
    repMax: number
    bodyweight?: boolean
    increment?: number
    today?: Date
    /** The A/B slot being trained — see lastPerformance. */
    variant?: VariantKey | null
  },
): Target {
  const { repMin, repMax } = opts
  const increment = opts.increment ?? 5
  const today = opts.today ?? new Date()

  const last = lastPerformance(workouts, exerciseKey, repMin, opts.variant)

  // Brand-new exercise: no weight suggestion, start at the bottom of the range.
  if (last === null) {
    return { weightLbs: null, reps: repMin }
  }

  /** One more rep than last time, never past the top of the range. */
  const oneMoreRep = Math.min(last.topReps + 1, repMax)
  /** What you last actually managed, for repeating rather than stepping up. */
  const repeatReps = Math.max(1, Math.min(last.topReps, repMax))
  // Checked before the bodyweight branch, so reps-only lifts re-pace after a
  // layoff too rather than being asked for a rep they haven't earned in months.
  const stale = daysBetween(last.date, toISODate(today)) > STALE_HISTORY_DAYS
  /**
   * Repeat the last working set rather than step up. Two cases share the reason:
   * the number wasn't set under conditions this session can build on — a layoff
   * ago, or in the day's other slot, where the lift was fresh (or tired) and this
   * one isn't. Either way it's a starting point, not a baseline to add to; the
   * first session in the slot sets the real one.
   */
  const repeat = stale || !last.sameSlot

  // Bodyweight (flagged, or no weight recorded): progress reps only. Nothing to
  // lighten, so this is the one case where the target may sit below repMin.
  if (opts.bodyweight || last.topWeight == null) {
    return { weightLbs: null, reps: repeat ? repeatReps : Math.max(1, oneMoreRep) }
  }

  // Weighted double progression: earned a weight bump at the top of the range.
  if (!repeat && last.topReps >= repMax) {
    return { weightLbs: roundHalf(last.topWeight + increment), reps: repMin }
  }

  const reps = repeat ? repeatReps : oneMoreRep

  // Too heavy for the range: the reps this weight allows fall short of repMin, so
  // drop to a load that carries the bottom of the range rather than prescribing a
  // set outside it.
  if (reps < repMin) {
    return {
      weightLbs: weightForRepMin(last.topWeight, last.topReps, repMin, increment),
      reps: repMin,
    }
  }

  return { weightLbs: roundHalf(last.topWeight), reps: Math.max(1, reps) }
}
