import type { WorkoutRow } from '../types'
import type { VariantKey } from '../config/plan'
import { parseISODate, toISODate } from './dates'
import { epley1RM } from './epley'
import { isMaxAttempt } from './maxAttempt'

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
 * The same shared-1RM solve as {@link weightForRepMin}, run the other way: the
 * reps that make `weight` about as hard as `topWeight`×`topReps` was.
 *
 * Held inside [repMin, repMax] — lighten a lift far enough and the honest answer
 * is "more reps than this exercise is programmed for", which is repMax.
 */
function repsAtWeight(
  topWeight: number,
  topReps: number,
  weight: number,
  repMin: number,
  repMax: number,
): number {
  if (weight <= 0) return repMin
  const reps = Math.floor(30 * (epley1RM(topWeight, topReps) / weight - 1))
  return Math.max(repMin, Math.min(repMax, reps))
}

/**
 * How long a gap makes the last session a poor basis for a step up. Come back
 * from a break, an illness or a holiday and the plan repeats what you last
 * actually did rather than demanding more on top of it — you re-pace upward from
 * a real number instead of chasing one you set while fresh.
 */
export const STALE_HISTORY_DAYS = 21

/**
 * The reps a session actually SUSTAINED: the lowest of its sets once the single
 * worst one is set aside.
 *
 * A target is a prescription for EVERY set, so reading a session by its best set
 * asks the next one to repeat, four times over, a number it managed once. Pull-ups
 * of 8, 6, 5, 5 read as "8" and get told to go for 9 — a 50% jump in volume wearing
 * the costume of one more rep. Read as "5", the same session gets told to go for 6
 * across the board, which is the set of four it was actually close to.
 *
 * The worst set is dropped so one collapsed set can't erase a good day: 8, 8, 8, 3
 * sustained 8, and the 3 was a set taken past the point of usefulness rather than
 * the story of the session. Below three sets there's nothing to drop and still have
 * a reading left, so the best set stands.
 */
function sustainedReps(reps: number[]): number {
  if (reps.length === 0) return 0
  const sorted = [...reps].sort((a, b) => a - b)
  return sorted[reps.length > 1 ? 1 : 0]
}

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
 * The WORKING set of a session: the weight you actually trained at, and the reps
 * you sustained at it (see sustainedReps — not the best single set, which is a
 * number the next session would then be asked to hit on every set).
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

  const repsAt = (weight: number): number =>
    sustainedReps(weighted.filter((s) => s.weight === weight).map((s) => s.reps))

  // Heaviest weight that carried a set into the prescribed range.
  const inRange = weighted.filter((s) => s.reps >= repMin)
  if (inRange.length > 0) {
    const weight = Math.max(...inRange.map((s) => s.weight))
    return { weight, reps: repsAt(weight) }
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
  return { weight, reps: repsAt(weight) }
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
 * WORKING set — the weight it genuinely trained at and the reps it sustained
 * there (see workingSet), rather than its single heaviest or best set. For a
 * bodyweight exercise (every set has a null weight) topWeight is null and
 * topReps is the reps the session sustained.
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
    // A max attempt is a single, not training (see maxAttempt). Left in, a session
    // that was nothing but an attempt becomes the latest one and hands the next
    // session its max weight to do six reps with; {@link workingSet} only sets a
    // single aside when the same session held real sets to read instead.
    if (isMaxAttempt(r)) continue
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
    // Bodyweight session: no weight anywhere, so the reading is the reps alone.
    const topReps = sustainedReps(latest.sets.map((s) => s.reps))
    return { date: latest.date, topWeight: null, topReps, sameSlot }
  }
  return { date: latest.date, topWeight: working.weight, topReps: working.reps, sameSlot }
}

/**
 * Suggest the next target for an exercise using double progression within
 * [repMin, repMax].
 *
 * The target is one prescription for every set of the exercise, so it steps up
 * from the reps the last session SUSTAINED across its sets rather than from its
 * best single set (see sustainedReps). Read the best set instead and a session
 * that drops off — 8, 6, 5, 5 — is credited with an 8 it hit once and asked for
 * four sets of 9.
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
 *
 * `opts.weightCapLbs` is the other exception, at the opposite end. A lift already
 * working at the heaviest load it can be given has no weight bump left to earn, so
 * once it's there the rep range stops bounding it and the reps become the ladder:
 * one more than last time, indefinitely (see PlannedExercise.weightCapLbs).
 */
export function nextTarget(
  workouts: WorkoutRow[],
  exerciseKey: string,
  opts: {
    repMin: number
    repMax: number
    bodyweight?: boolean
    increment?: number
    /** Heaviest load available — see PlannedExercise.weightCapLbs. */
    weightCapLbs?: number
    /** The prescription is a hold in seconds — see PlannedExercise.timed. */
    timed?: boolean
    today?: Date
    /** The A/B slot being trained — see lastPerformance. */
    variant?: VariantKey | null
  },
): Target {
  const { repMin, repMax } = opts
  const increment = opts.increment ?? 5
  const today = opts.today ?? new Date()

  // A hold with a single number rather than a range: the prescription IS that
  // number, so it neither steps up after a good set nor re-paces down after a short
  // one. A 30-second plank is a 30-second plank next week too — the clock reads the
  // same 30 either way, and what was actually held is logged beside it. A hold given
  // a real range still climbs it the way reps do.
  if (opts.timed && repMin === repMax) {
    return { weightLbs: null, reps: repMax }
  }

  const last = lastPerformance(workouts, exerciseKey, repMin, opts.variant)

  // Brand-new exercise: no weight suggestion, start at the bottom of the range.
  if (last === null) {
    return { weightLbs: null, reps: repMin }
  }

  const cap = opts.weightCapLbs
  /**
   * Already training at the heaviest load this movement has. Double progression's
   * weight bump has nowhere left to go, so the reps take over as the ladder: the
   * top of the range stops applying, and there's no point lightening a load that's
   * the only one on offer.
   */
  const atCap = cap != null && last.topWeight != null && last.topWeight >= cap
  /** Top of the rep range — gone once the load is capped and reps are the ladder. */
  const repCeiling = atCap ? Infinity : repMax

  /** One more rep than last time, never past the top of the range. */
  const oneMoreRep = Math.min(last.topReps + 1, repCeiling)
  /** What you last actually managed, for repeating rather than stepping up. */
  const repeatReps = Math.max(1, Math.min(last.topReps, repCeiling))
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

  // Weighted double progression: earned a weight bump at the top of the range. A
  // step is never taken past the cap — the last one lands ON it, and from there
  // `atCap` sends the progression into reps.
  if (!atCap && !repeat && last.topReps >= repMax) {
    const bumped = last.topWeight + increment
    return { weightLbs: roundHalf(cap == null ? bumped : Math.min(bumped, cap)), reps: repMin }
  }

  const reps = repeat ? repeatReps : oneMoreRep

  // Too heavy for the range: the reps this weight allows fall short of repMin, so
  // drop to a load that carries the bottom of the range rather than prescribing a
  // set outside it. Not at the cap, where there's no lighter load to move to and a
  // session short of the floor is a bad day rather than a mis-set weight.
  if (!atCap && reps < repMin) {
    return {
      weightLbs: weightForRepMin(last.topWeight, last.topReps, repMin, increment),
      reps: repMin,
    }
  }

  return { weightLbs: roundHalf(last.topWeight), reps: Math.max(1, reps) }
}

/** The plan fields a batch of targets is read from, per exercise. */
export type TargetInputs = {
  key: string
  repMin: number
  repMax: number
  bodyweight?: boolean
  increment?: number
  /** Heaviest load available — see PlannedExercise.weightCapLbs. */
  weightCapLbs?: number
  /** The prescription is a hold in seconds — see PlannedExercise.timed. */
  timed?: boolean
  /** Load-sharing group id — see {@link nextTargets}. */
  sharedLoad?: string
}

/** The weighted members of each load-sharing group that has more than one. */
function sharedLoadGroups(exercises: TargetInputs[]): TargetInputs[][] {
  const byId = new Map<string, TargetInputs[]>()
  for (const e of exercises) {
    // A bodyweight move has no load to share, so it never joins a group.
    if (!e.sharedLoad || e.bodyweight) continue
    const members = byId.get(e.sharedLoad) ?? []
    members.push(e)
    byId.set(e.sharedLoad, members)
  }
  return [...byId.values()].filter((members) => members.length > 1)
}

/**
 * Targets for a whole day at once, with load-sharing groups reconciled to a
 * single weight (see PlannedExercise.sharedLoad). Every exercise outside a group
 * gets exactly what {@link nextTarget} would give it on its own.
 *
 * A group loads to the LIGHTEST of its members' own suggestions. That's the only
 * choice that keeps every member inside its rep range: the stronger movement's
 * weight would leave the weaker one several reps short of repMin, and
 * prescribing a set short of the range is precisely what nextTarget refuses to
 * do. The stronger movement takes the difference in reps instead, up to the top
 * of its range. From the next session on both are logged at the same load, so
 * the pair climbs together once the weaker one earns the bump — which is the
 * point of sharing: one weight to set, and it only moves when both movements are
 * ready for it.
 *
 * A member with no history of its own joins at the group's weight rather than
 * blank, since the stack is already pinned there.
 */
export function nextTargets(
  workouts: WorkoutRow[],
  exercises: TargetInputs[],
  opts: {
    today?: Date
    /** The A/B slot to read each exercise's history in — see {@link nextTarget}. */
    variantFor?: (key: string) => VariantKey | null | undefined
  } = {},
): Map<string, Target> {
  const out = new Map<string, Target>()
  for (const e of exercises) {
    out.set(
      e.key,
      nextTarget(workouts, e.key, {
        repMin: e.repMin,
        repMax: e.repMax,
        bodyweight: e.bodyweight,
        increment: e.increment,
        weightCapLbs: e.weightCapLbs,
        timed: e.timed,
        today: opts.today,
        variant: opts.variantFor?.(e.key),
      }),
    )
  }

  for (const members of sharedLoadGroups(exercises)) {
    const weights = members
      .map((e) => out.get(e.key)?.weightLbs)
      .filter((w): w is number => w != null)
    // Nothing logged for any member yet: no weight to share, so all stay blank.
    if (weights.length === 0) continue
    const weight = Math.min(...weights)

    for (const e of members) {
      const own = out.get(e.key)
      if (!own || own.weightLbs === weight) continue
      // Reps are re-read from the last SESSION rather than scaled off this
      // exercise's own (heavier) target: at an unchanged weight that hands back
      // the reps already managed there, so holding the group down can never ask
      // for fewer reps than the last time this exact load was lifted.
      const last = lastPerformance(workouts, e.key, e.repMin, opts.variantFor?.(e.key))
      const reps =
        last?.topWeight == null
          ? e.repMin
          : repsAtWeight(last.topWeight, last.topReps, weight, e.repMin, e.repMax)
      out.set(e.key, { weightLbs: weight, reps })
    }
  }

  return out
}
