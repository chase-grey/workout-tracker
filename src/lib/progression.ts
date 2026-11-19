import type { WorkoutRow } from '../types'
import type { VariantKey } from '../config/plan'
import { parseISODate, toISODate } from './dates'
import { epley1RM } from './epley'
import { isMaxAttempt } from './maxAttempt'

export type Target = { weightLbs: number | null; reps: number }

/**
 * The prescription in words, for the set screen. A timed hold's number is seconds
 * rather than reps (see PlannedExercise.timed), so it reads as a hold to make
 * rather than a count to reach, and a movement with no weight suggestion asks only
 * for the reps.
 */
export function targetLabel(target: Target | undefined, timed = false): string | null {
  if (!target) return null
  if (timed) return `hold ${target.reps}s`
  if (target.weightLbs == null) return `target ${target.reps} reps`
  return `target ${target.weightLbs} × ${target.reps}`
}

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
 * The reps a session was WORKING AT: the lowest of its sets once the single worst
 * one is set aside.
 *
 * A target is a prescription for EVERY set, so reading a session by its best set
 * asks the next one to repeat, four times over, a number it managed once. Pull-ups
 * of 8, 6, 5, 5 read as "8" and get told to go for 9 — a 50% jump in volume wearing
 * the costume of one more rep. Read as "5", the same session gets told to go for 6
 * across the board, which is the set of four it was actually close to.
 *
 * The worst set is dropped so one collapsed set can't erase a good day: 8, 8, 8, 3
 * was working at 8, and the 3 was a set taken past the point of usefulness rather
 * than the story of the session. Below three sets there's nothing to drop and still
 * have a reading left, so the best set stands.
 *
 * This is the number the next session is asked for; whether it's asked for that
 * number again or one more than it is {@link heldEverySet}'s call.
 */
function sustainedReps(reps: number[]): number {
  if (reps.length === 0) return 0
  const sorted = [...reps].sort((a, b) => a - b)
  return sorted[reps.length > 1 ? 1 : 0]
}

/**
 * Did EVERY set hold the reps the session was working at, or did one fall short?
 *
 * This is the gate on stepping up, and the whole of double progression's first
 * half: you earn the next rep by finishing all of your sets at this one. Incline
 * bench at 100×8, 8, 8, 6 got three of the four it was asked for — moving the ask
 * to 9 there raises a bar that was just missed, and the fourth set falls further
 * short than it did before. Nothing is lost by waiting: the same 8 comes back, and
 * the step up arrives the week it's hit clean across the board.
 *
 * The reading this is measured against already sets one bad set aside (see
 * {@link sustainedReps}), which is what keeps the two rules from fighting. 8, 8, 8, 3
 * is still a session working at 8 — it simply hasn't finished four sets there, so it
 * repeats 8 rather than being credited with 9 or dropped to 4. Equivalently: at most
 * one set may fall short, and even that one costs the step up.
 */
function heldEverySet(reps: number[]): boolean {
  return reps.length > 0 && Math.min(...reps) >= sustainedReps(reps)
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
 *
 * `heldEverySet` reports whether every set AT THAT WEIGHT held those reps, which is
 * what decides between repeating the number and stepping up (see heldEverySet).
 */
function workingSet(
  sets: { weight: number | null; reps: number }[],
  repMin: number,
): { weight: number; reps: number; heldEverySet: boolean } | null {
  const weighted = sets.filter((s): s is { weight: number; reps: number } => s.weight != null)
  if (weighted.length === 0) return null

  // Read one weight's sets alone, so a back-off set at a lighter load neither
  // lowers the working reps nor counts as a set that fell short of them.
  const readAt = (weight: number) => {
    const reps = weighted.filter((s) => s.weight === weight).map((s) => s.reps)
    return { weight, reps: sustainedReps(reps), heldEverySet: heldEverySet(reps) }
  }

  // Heaviest weight that carried a set into the prescribed range.
  const inRange = weighted.filter((s) => s.reps >= repMin)
  if (inRange.length > 0) {
    return readAt(Math.max(...inRange.map((s) => s.weight)))
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
  return readAt(weight)
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
  /**
   * True when every set at the working weight held `topReps` — the session
   * finished the job it was given. False when one fell short, which is what tells
   * nextTarget to ask for the same number again rather than one more (see
   * heldEverySet).
   */
  heldEverySet: boolean
}

/**
 * The most recent session's performance for one exercise (null if no history).
 *
 * Rows are grouped by session (session_id, falling back to date), and the group
 * with the latest date wins. `topWeight`/`topReps` describe that session's
 * WORKING set — the weight it genuinely trained at and the reps it sustained
 * there (see workingSet), rather than its single heaviest or best set, and
 * `heldEverySet` says whether it held those reps on all of them. For a
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
  return recentPerformances(workouts, exerciseKey, repMin, variant)[0] ?? null
}

/**
 * Every comparable session's performance for one exercise, newest first — what
 * {@link lastPerformance} reads the head of, and what {@link nextTarget} reads the
 * session before it from (see heldFloor). Same grouping, same slot rule: when the
 * slot asked for has no sessions, the other slot's are read and every reading is
 * flagged `sameSlot: false`.
 */
function recentPerformances(
  workouts: WorkoutRow[],
  exerciseKey: string,
  repMin: number,
  variant?: VariantKey | null,
): LastPerformance[] {
  const { sessions, sameSlot } = comparableHistory(workouts, exerciseKey, variant)
  return sessions.map((session) => {
    const working = workingSet(session.sets, repMin)
    if (working === null) {
      // Bodyweight session: no weight anywhere, so the reading is the reps alone.
      const reps = session.sets.map((s) => s.reps)
      return {
        date: session.date,
        topWeight: null,
        topReps: sustainedReps(reps),
        heldEverySet: heldEverySet(reps),
        sameSlot,
      }
    }
    return {
      date: session.date,
      topWeight: working.weight,
      topReps: working.reps,
      heldEverySet: working.heldEverySet,
      sameSlot,
    }
  })
}

/**
 * Every session of one exercise that the slot asked for can be compared with,
 * newest first, each with the sets it logged. `sameSlot` is false when the slot
 * has no sessions of its own and the other slot's are handed back instead.
 */
function comparableHistory(
  workouts: WorkoutRow[],
  exerciseKey: string,
  variant?: VariantKey | null,
): { sessions: SessionGroup[]; sameSlot: boolean } {
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

  if (bySession.size === 0) return { sessions: [], sameSlot: true }

  const groups = [...bySession.values()]
  const comparable = comparableSessions(groups, variant)
  // Nothing in this slot yet — the lift's first session in it, or its first since
  // the split shipped. Read the other slot rather than treating a known lift as
  // brand new, and flag it so the target repeats instead of stepping up.
  const sameSlot = comparable.length > 0
  const pool = sameSlot ? comparable : groups

  // Newest first (YYYY-MM-DD sorts lexicographically). Two sessions on one date
  // keep the order they were first logged in, so the earlier-logged one still
  // reads as the latest, as it always has.
  const ordered = pool
    .map((g, i) => ({ g, i }))
    .sort((a, b) => (a.g.date === b.g.date ? a.i - b.i : b.g.date.localeCompare(a.g.date)))
    .map(({ g }) => g)

  return { sessions: ordered, sameSlot }
}

/** The best an exercise has ever been held at — see {@link bestPerformance}. */
export type BestPerformance = {
  date: string
  /** Null for a lift that carries no weight. */
  weightLbs: number | null
  /** The reps held on at least `sets` sets of one session. */
  reps: number
  /** How many sets had to hold them: the `sets` asked for. */
  sets: number
}

/**
 * How many sets a performance has to span when the caller doesn't say: the set
 * count most of the lift's sessions ran to, the larger on a tie.
 */
function usualSetCount(sessions: SessionGroup[]): number {
  const counts = new Map<number, number>()
  for (const s of sessions) counts.set(s.sets.length, (counts.get(s.sets.length) ?? 0) + 1)
  let usual = 1
  let seen = 0
  for (const [n, count] of counts) {
    if (count > seen || (count === seen && n > usual)) {
      usual = n
      seen = count
    }
  }
  return usual
}

/**
 * The best the lift has EVER been held at: the highest weight × reps that one
 * session carried across `sets` sets — 100×12, 12, 12, 12 is 100×12×4, whenever
 * it happened and whatever the sessions since looked like.
 *
 * "Held" is what keeps a freak set out of it. A session is read at each weight it
 * used, by the reps its `sets`-th best set there reached, so 100×14, 10, 10, 9 is
 * 100×9×4 and a lone 120×8 beside three sets at 100 is no reading at 120 at all.
 * A set at a heavier weight counts toward a lighter one, since the same reps with
 * more on the bar is that performance and then some. A weighted reading also has
 * to reach `repMin`: three heavy triples of an 8–12 lift were never a session of
 * that lift's training, the same line {@link workingSet} draws.
 *
 * Across weights the order is double progression's own (see isHigher): heavier
 * wins, and at one weight the more reps. `bodyweight` reads every set by its reps
 * alone. Max attempts are no part of it, and neither is the day's other A/B slot,
 * exactly as for {@link lastPerformance}; a slot with no sessions of its own has
 * no best to speak of.
 */
export function bestPerformance(
  workouts: WorkoutRow[],
  exerciseKey: string,
  opts: {
    repMin?: number
    /** Sets the performance has to span. Omitted, the lift's usual count is used. */
    sets?: number
    bodyweight?: boolean
    variant?: VariantKey | null
  } = {},
): BestPerformance | null {
  const { sessions, sameSlot } = comparableHistory(workouts, exerciseKey, opts.variant)
  if (!sameSlot || sessions.length === 0) return null
  const need = Math.max(1, opts.sets ?? usualSetCount(sessions))
  const repMin = opts.repMin ?? 1

  /** The reps the `need`-th best of these sets reached; 0 when they are too few. */
  const heldReps = (reps: number[]) =>
    reps.length < need ? 0 : [...reps].sort((a, b) => b - a)[need - 1]

  let best: BestPerformance | null = null
  const offer = (date: string, weightLbs: number | null, reps: number) => {
    if (reps <= 0) return
    if (best == null || isHigher({ weightLbs, reps }, best)) {
      best = { date, weightLbs, reps, sets: need }
    }
  }

  // Oldest first, so the day a best was first set is the one it is dated to.
  for (const session of [...sessions].reverse()) {
    const weighted = opts.bodyweight
      ? []
      : session.sets.filter((s): s is { weight: number; reps: number } => s.weight != null)
    if (weighted.length === 0) {
      offer(session.date, null, heldReps(session.sets.map((s) => s.reps)))
      continue
    }
    for (const weight of new Set(weighted.map((s) => s.weight))) {
      const reps = heldReps(weighted.filter((s) => s.weight >= weight).map((s) => s.reps))
      if (reps >= repMin) offer(session.date, weight, reps)
    }
  }
  return best
}

/**
 * Suggest the next target for an exercise using double progression within
 * [repMin, repMax].
 *
 * The target is one prescription for every set of the exercise, so it reads the
 * last session by the reps it was WORKING AT across its sets rather than by its
 * best single set (see sustainedReps). Read the best set instead and a session
 * that drops off — 8, 6, 5, 5 — is credited with an 8 it hit once and asked for
 * four sets of 9.
 *
 * And it only adds a rep to that number once the session held it on every set (see
 * heldEverySet). 100×8, 8, 8, 6 stays at 100×8 until all four sets land, because a
 * target that climbs while a set is still being missed just widens the gap. This is
 * the rep half of double progression: finish all your sets, then ask for more.
 *
 * Re-pacing note: the recent sessions say what to ask for only where it's MORE
 * than the lift has ever held. The step up on the best ever held (see bestTarget)
 * is the least the target asks for, so worse days since don't bring it down: a
 * number already beaten is not a challenge. Below that, the most recent session
 * is read with the one before it as a floor (see heldFloor), which is what
 * decides a lift that has never yet held a number inside its range. After a gap
 * of more than STALE_HISTORY_DAYS it stops asking for a step up at all and simply
 * repeats the last working set, so coming back from a break starts from something
 * achievable.
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
 *
 * `opts.repLadder` is that same exception without the wait: a movement that can't
 * be loaded at all (a sideways leg raise) never had a weight bump to earn, so the
 * reps are its ladder from the first session rather than from the session that
 * arrives at the top of the stack.
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
    /** Can't be loaded, so the reps are the ladder — see PlannedExercise.repLadder. */
    repLadder?: boolean
    /** The prescription is a hold in seconds — see PlannedExercise.timed. */
    timed?: boolean
    /** Sets being asked for today, which a best has to have spanned — see bestPerformance. */
    sets?: number
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

  const [last, prev] = recentPerformances(workouts, exerciseKey, repMin, opts.variant)

  // Brand-new exercise: no weight suggestion, start at the bottom of the range.
  if (last == null) {
    return { weightLbs: null, reps: repMin }
  }

  const stale = daysBetween(last.date, toISODate(today)) > STALE_HISTORY_DAYS
  const fromLast = targetFrom(last, opts, increment, stale)
  const floor = heldFloor(last, prev, opts, increment, stale)
  const recent = floor != null && isHigher(floor, fromLast) ? floor : fromLast
  const fromBest = bestTarget(workouts, exerciseKey, opts, increment, stale)
  return fromBest != null && isHigher(fromBest, recent) ? fromBest : recent
}

/**
 * The step up on the best the lift has ever been held at (see bestPerformance),
 * which is the least the target ever asks for; null when there's no such best or
 * it has no say.
 *
 * The last two sessions alone decided the target, so two ordinary days in a row
 * were enough to forget a better one: flat bench held at 100×12 across four sets,
 * then 100×10 and 100×9, was asked for 100×10 — a number beaten weeks ago, sold
 * as today's challenge. The challenge is the next thing never yet done, so it's
 * read from the best ever held: 100×12×4 asks for 100×13 until 100×13 is held,
 * however the days in between went.
 *
 * It's a step up rather than a repeat because the best is by construction a
 * number every one of its sets held, which is all a step up ever waited for (see
 * heldEverySet). The recent sessions still speak when they ask for more — a
 * session that outdid the old best is itself the best, and a number repeated for
 * a set that fell short of it stands if it's the higher.
 *
 * A layoff is the one thing that silences it: past STALE_HISTORY_DAYS the plan
 * repeats what was last done, and a best set before the break is not what a
 * first day back should be measured against.
 */
function bestTarget(
  workouts: WorkoutRow[],
  exerciseKey: string,
  opts: TargetRules & { sets?: number; variant?: VariantKey | null },
  increment: number,
  stale: boolean,
): Target | null {
  if (stale) return null
  const best = bestPerformance(workouts, exerciseKey, {
    repMin: opts.repMin,
    sets: opts.sets,
    bodyweight: opts.bodyweight,
    variant: opts.variant,
  })
  if (best == null) return null
  return targetFrom(
    { date: best.date, topWeight: best.weightLbs, topReps: best.reps, heldEverySet: true, sameSlot: true },
    opts,
    increment,
    false,
  )
}

/**
 * How far the session before the latest one holds the target up: what that
 * session earned as a number to repeat, or null when it has no say.
 *
 * Reading only the latest session let one bad day write the next one's
 * prescription. Bench at 100×10 on Monday and 100×6 on Thursday (a bad night's
 * sleep, a cold, a long day) dropped the
 * next ask below the range and solved it back to 90×8 — ten pounds and a week of
 * work gone on the strength of one session, which the next good day then had to
 * climb back through one rep at a time.
 *
 * So the target is never lower than a plain repeat of the session before: the
 * better of the last two sessions sets it. One weak session holds the number the
 * one before it earned; two in a row are a trend, and the target comes down to
 * the better of the two — which is how far the lifter has actually slipped, not
 * how far one day slipped. The floor never climbs: it's the previous session's
 * working set repeated, never a step up on it, so a good session still has to be
 * followed by its own to be built on, and a better latest session is read as it
 * always was (see isHigher) — rising stays a session away.
 *
 * It has no say when the latest session can't be built on in the first place —
 * a layoff since (the stale rule repeats it instead), or a reading borrowed from
 * the other A/B slot — or when the two sessions were themselves more than
 * STALE_HISTORY_DAYS apart: then the latest is a comeback, and a comeback that
 * came in light is the real number rather than a bad day.
 */
function heldFloor(
  last: LastPerformance,
  prev: LastPerformance | undefined,
  opts: TargetRules,
  increment: number,
  stale: boolean,
): Target | null {
  if (prev == null || stale || !last.sameSlot) return null
  if (daysBetween(prev.date, last.date) > STALE_HISTORY_DAYS) return null
  // A bodyweight reading and a loaded one aren't the same ladder to compare.
  if ((prev.topWeight == null) !== (last.topWeight == null)) return null
  return targetFrom(prev, opts, increment, true)
}

/**
 * Whether target `a` asks for more than `b`: more weight, or the same weight for
 * more reps. Weight first because that's double progression's own order — a bump
 * from 100×12 to 105×8 is a step up, though it's four reps fewer.
 */
function isHigher(a: Target, b: Target): boolean {
  const aw = a.weightLbs ?? -Infinity
  const bw = b.weightLbs ?? -Infinity
  return aw !== bw ? aw > bw : a.reps > b.reps
}

/** The plan fields a single target is worked out from — see {@link nextTarget}. */
type TargetRules = {
  repMin: number
  repMax: number
  bodyweight?: boolean
  weightCapLbs?: number
  repLadder?: boolean
}

/**
 * The target one session's performance calls for (see {@link nextTarget}).
 * `repeatOnly` asks for that session again rather than anything on top of it —
 * the stale rule's answer, and the floor's (see heldFloor).
 */
function targetFrom(
  last: LastPerformance,
  opts: TargetRules,
  increment: number,
  repeatOnly: boolean,
): Target {
  const { repMin, repMax } = opts
  const cap = opts.weightCapLbs
  /**
   * Already training at the heaviest load this movement has — or, for a movement
   * that can't be loaded, at the only one it will ever have. Either way double
   * progression's weight bump has nowhere to go, so the reps take over as the
   * ladder: the top of the range stops applying, and there's no point lightening a
   * load that's the only one on offer.
   */
  const atCap =
    opts.repLadder === true || (cap != null && last.topWeight != null && last.topWeight >= cap)
  /** Top of the rep range — gone once reps are the ladder. */
  const repCeiling = atCap ? Infinity : repMax

  /** One more rep than last time, never past the top of the range. */
  const oneMoreRep = Math.min(last.topReps + 1, repCeiling)
  /** What you last actually managed, for repeating rather than stepping up. */
  const repeatReps = Math.max(1, Math.min(last.topReps, repCeiling))
  // Checked before the bodyweight branch, so reps-only lifts re-pace after a
  // layoff too rather than being asked for a rep they haven't earned in months.
  /**
   * Repeat the last working set rather than step up. Three cases share the reason:
   * the number hasn't been earned as a baseline to add to. Either it wasn't set
   * under conditions this session can build on — a layoff ago, or in the day's
   * other slot, where the lift was fresh (or tired) and this one isn't — or it was
   * set here but not on every set, so it's still the number to finish rather than
   * the one to beat (see heldEverySet). Each is a starting point; the session that
   * holds it clean across the board sets the real one.
   */
  const repeat = repeatOnly || !last.sameSlot || !last.heldEverySet

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
  /** Can't be loaded, so the reps are the ladder — see PlannedExercise.repLadder. */
  repLadder?: boolean
  /** The prescription is a hold in seconds — see PlannedExercise.timed. */
  timed?: boolean
  /** Sets being asked for today — see bestPerformance. */
  sets?: number
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
        repLadder: e.repLadder,
        timed: e.timed,
        sets: e.sets,
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
