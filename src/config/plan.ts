import type { DayType, Side } from '../types'

/**
 * The workout plan model. DEFAULT_PLAN below is the seed; the live plan is
 * editable in Settings and persisted per-device (see storage.loadPlan). It's a
 * plain data structure so the AI assistant can also propose edits to it later.
 *
 * `restSec` is the prescribed rest after each set.
 * `repMin`/`repMax` define the rep range used by the progression engine
 * (double progression climbs to repMax, then adds weight and resets to repMin;
 * a weight too heavy to reach repMin is lightened rather than prescribed short).
 * `increment` is the weight step (lbs) when a weight bump is earned.
 * `bodyweight: true` means the weight field defaults to blank/"BW".
 */
/**
 * Push + Core runs as two variants that alternate through the week (see
 * lib/pushVariant). They share one exercise list — only the primary press
 * differs — so history, charts and the plan editor all keep working off a single
 * day. `byVariant` carries the per-variant deltas.
 */
export type VariantKey = 'A' | 'B'

/** Per-variant overrides for one exercise: its set count and/or its position. */
export type VariantOverride = {
  sets?: number
  /**
   * Trade places with this exercise in this variant. Relative rather than an
   * absolute index, so a user who reorders the day can't end up with the swap
   * landing on an unrelated exercise.
   */
  swapWith?: string
}

export type PlannedExercise = {
  /** Stable key — matches the `exercise` value stored in the sheet. */
  key: string
  name: string
  sets: number
  repMin: number
  repMax: number
  restSec: number
  increment?: number
  bodyweight?: boolean
  /**
   * Never loaded with extra weight — the weight field is hidden entirely rather
   * than offered as an empty "added lbs" box (hanging raises, dead bugs).
   */
  repsOnly?: boolean
  /** Optional / do-if-energy-allows. */
  optional?: boolean
  /** Grouping header shown in the UI (e.g. "Chest"). */
  group: string
  /**
   * Exercises sharing a circuit id have their sets interleaved round-robin, so
   * you rotate through the stations instead of finishing one move at a time.
   * Keeps two same-muscle movements out of back-to-back sets.
   */
  circuit?: string
  /**
   * Rest taken after a set of THIS exercise while rotating through its circuit —
   * both the change to the next station and, from the last station, the wrap into
   * the next round. Set it per station so a circuit can rest only where it needs
   * to: `0` rolls straight on to the next move, which is the point of the field.
   *
   * Absent means the built-in behaviour: a brief station change
   * ({@link CIRCUIT_STATION_REST_SEC}) between stations, and the next exercise's
   * own capped rest when a new round starts. Ignored outside a circuit.
   */
  circuitRestSec?: number
  /**
   * Exercises sharing a `sharedLoad` id are prescribed ONE weight, so a circuit
   * you rotate through doesn't ask you to re-pin the stack between stations.
   * The group loads to the lightest of its members' own suggestions — the only
   * weight that keeps every one of them inside its rep range (see
   * progression.nextTargets).
   */
  sharedLoad?: string
  /**
   * Loaded with a dumbbell in each hand, and the weight logged is the pair's
   * total. The rack steps in 5s, but both hands change at once, so the smallest
   * move available is 10 lbs — every paired movement's `increment` is 10, and one
   * added later should be too.
   *
   * A movement that shares a single dumbbell between the hands isn't one of
   * these: the lateral raise logs that one dumbbell, so it steps in the rack's
   * own smaller jumps.
   */
  dumbbellPair?: boolean
  /**
   * A movement trained one limb at a time. Each side is its own exercise — its own
   * key, its own history, its own line on the chart — so an imbalance between them
   * is visible instead of averaged away.
   *
   * The two sides ship as a pair in the day — not necessarily adjacent; the arm
   * circuit puts a tricep station between them — and which one leads flips from
   * session to session (see lib/pushSide + {@link sideOrderedExercises}), so the
   * same arm isn't always the one working second.
   */
  side?: Side
  /** Per-variant deltas; absent means the exercise is identical in both. */
  byVariant?: Partial<Record<VariantKey, VariantOverride>>
}

export type DayPlan = {
  type: DayType
  label: string
  required: boolean
  exercises: PlannedExercise[]
  /**
   * Where the day sits in the list the Today tab offers (see {@link dayOrder}),
   * set by reordering the days in Settings. Absent on a day that has never been
   * moved, which leaves it at its shipped position — so a plan saved before this
   * existed still comes up in {@link TODAY_DAY_ORDER}.
   */
  order?: number
  /**
   * Keys of *shipped* exercises deleted from this day. A deletion can't be stored
   * as an absence: {@link mergeDayExercises} reads "a default the stored day
   * doesn't have" as a newly shipped movement and splices it back in, so without
   * this list a deleted default returns on the next load — or on the next sync,
   * which re-merges the fetched copy and saves it. Recorded here instead, and
   * honoured by both merge branches so a revision bump doesn't undo it.
   *
   * Only keys the defaults own for this day need recording; a custom exercise is
   * gone the moment it leaves the list, since nothing puts it back. Re-adding an
   * exercise drops its key from here (see lib/planTools), so the list never
   * contradicts the exercises alongside it.
   */
  removed?: string[]
}

export type Plan = Record<DayType, DayPlan>

/**
 * Bumped whenever a shipped day is *restructured* — exercises reordered, set
 * counts or rep ranges changed as a deliberate programming decision, movements
 * retired.
 *
 * The ordinary merge keeps a stored day's own exercises, order and numbers, since
 * those are usually the user's edits. That's right for adding a new movement, but
 * it means a restructure never reaches a device that has already saved a plan: the
 * arm circuit would keep the two tricep movements back to back, core would stay at
 * three sets, and the hanging raise would never reach the reps that graduate it.
 * A revision bump re-adopts the shipped shape for exercises the defaults own,
 * while custom exercises the user added are always kept.
 *
 * 2 — push + core reworked: A/B press variants, arm circuit, 4 sets of core,
 *     overhead press moved before flys, lat-pulldown finisher retired, core added
 *     to pull + legs, full-body day introduced.
 *
 * 3 — pull + legs: calf raises added, a neck extension/flexion pair added as a
 *     circuit, and the hanging raise moved up to directly after pull-ups so it
 *     runs at the bar you're already hanging from.
 *
 * 4 — push + core: the lateral raise splits into a left and a right station, so
 *     each arm is logged and charted on its own. The single-arm entry is retired.
 *
 * 5 — push + core: the arm circuit interleaves its delt and tricep stations —
 *     pushdown → one arm's raise → overhead extension → the other arm's raise —
 *     rather than running the two arms back to back.
 *
 * 6 — push + core: the arm circuit rests after the lateral raises only. Both
 *     tricep stations roll straight on to the next move.
 *
 * 7 — pull + legs and full body: the leg press replaces the barbell squat, which
 *     is retired — there's no squat rack to train it in anymore. The squat's
 *     logged history stays, and still counts toward the squat goals through a
 *     conversion (see lib/liftRatios).
 */
export const PLAN_REVISION = 7

export const DAY_TYPES: DayType[] = ['push', 'pull', 'fullbody']

/**
 * The order the Today tab offers the days in until the user arranges them
 * themselves in Settings (see {@link dayOrder}). Separate from DAY_TYPES, which is
 * the canonical set (merging, validation, chat tools) and shouldn't be reshuffled
 * to serve one screen's layout.
 */
export const TODAY_DAY_ORDER: DayType[] = ['push', 'fullbody', 'pull']

/** Day types that run as alternating A/B variants. */
export const VARIANT_DAY_TYPES: DayType[] = ['push']

/** Marker exercise key for a detail-less "I trained" quick log (excluded from charts). */
export const QUICK_LOG_KEY = '__quicklog__'

/**
 * Dead Bug — core work folded into the Stretch + Core session (it no longer has
 * a standalone day). Each set is still logged as a workout row under this key so
 * historical dead-bug data and the 'reps' progress chart stay continuous, but a
 * session made up only of this move is supplemental and never counts toward the
 * weekly workout goal (see SUPPLEMENTAL_EXERCISE_KEYS).
 */
export const DEAD_BUG: PlannedExercise = {
  key: 'deadbug',
  name: 'dead bug',
  sets: 4,
  repMin: 10,
  repMax: 20,
  restSec: 60,
  bodyweight: true,
  repsOnly: true,
  group: 'core',
}

/**
 * The hanging-raise slot. Starts as KNEE raises and graduates to full leg raises
 * once 4×20 is comfortable (see GRADUATION_REPS / shouldGraduateHangingRaise) —
 * one progression, so it keeps one exercise key and one continuous history.
 */
export const HANGING_RAISE_KEY = 'hanging_leg_raise'

/** Sets × reps of hanging knee raises that earn the move up to full leg raises. */
export const GRADUATION_SETS = 4
export const GRADUATION_REPS = 20

export const DEFAULT_PLAN: Plan = {
  push: {
    type: 'push',
    label: 'push + core',
    required: true,
    exercises: [
      { key: 'cable_crunch', name: 'cable crunch', sets: 4, repMin: 12, repMax: 15, restSec: 60, increment: 5, group: 'abs' },
      { key: HANGING_RAISE_KEY, name: 'hanging knee raise', sets: GRADUATION_SETS, repMin: 10, repMax: GRADUATION_REPS, restSec: 60, bodyweight: true, repsOnly: true, group: 'abs' },

      // Incline leads variant A (upper-chest emphasis is the aesthetic priority);
      // flat leads variant B. The non-primary press drops to 3 sets that day,
      // keeping weekly chest volume near 16 sets instead of an unproductive 20+.
      // Either press can carry the bench-bodyweight goal's reading, so whichever
      // one leads, the day counts (see goals.BENCH_ALSO_KEYS).
      { key: 'incline_bench', name: 'incline bench press', sets: 4, repMin: 6, repMax: 10, restSec: 150, increment: 5, group: 'chest', byVariant: { B: { sets: 3 } } },
      { key: 'flat_bench', name: 'flat bench press', sets: 3, repMin: 8, repMax: 12, restSec: 120, increment: 5, group: 'chest', byVariant: { B: { sets: 4, swapWith: 'incline_bench' } } },

      // Overhead press is a compound, so it goes before chest isolation — three
      // sets done fresh beat four done after flys, and front delts already take
      // heavy work from seven press sets above.
      { key: 'db_overhead_press', name: 'dumbbell overhead press', sets: 3, repMin: 8, repMax: 12, restSec: 120, increment: 10, dumbbellPair: true, group: 'shoulders' },
      { key: 'iso_chest', name: 'chest fly / pec deck', sets: 3, repMin: 12, repMax: 15, restSec: 75, increment: 2.5, group: 'chest finisher' },

      // Circuit: pushdown → one arm's raise → overhead extension → the other arm's
      // raise, rotating. Alternating delt and tricep the whole way round is the
      // point: neither tricep movement runs pre-fatigued by the other, and neither
      // does either arm of the raise, so nothing in the block ever follows itself.
      // It also shortens the block, since each muscle recovers while the other
      // works.
      //
      // Both tricep moves work off the same cable stack, so they share one load —
      // rotating through the circuit would otherwise mean re-pinning it twice a
      // round.
      //
      // The raise runs one arm at a time, so each side is its own station and its
      // own history: side-to-side differences in a delt are both common and worth
      // seeing. They're one dumbbell between them, hence the shared load, and the
      // leading arm alternates each session (see lib/pushSide).
      //
      // The break sits after each raise and nowhere else: coming off a tricep
      // station the next move is a delt, which is rested and ready, so the block
      // rolls straight on (`circuitRestSec: 0`) instead of standing around. The
      // raise is the only station worth a real rest after — you go from it to the
      // other arm or back to the pushdown, and both want the shoulder settled.
      { key: 'tricep_pushdown', name: 'tricep pushdown', sets: 3, repMin: 10, repMax: 15, restSec: 60, increment: 2.5, group: 'delts + triceps circuit', circuit: 'arms', circuitRestSec: 0, sharedLoad: 'triceps' },
      { key: 'lateral_raise_l', name: 'lateral raise (left)', side: 'left', sets: 3, repMin: 12, repMax: 20, restSec: 60, increment: 2.5, group: 'delts + triceps circuit', circuit: 'arms', circuitRestSec: 60, sharedLoad: 'lateral' },
      { key: 'overhead_tricep_ext', name: 'overhead tricep extension', sets: 3, repMin: 10, repMax: 15, restSec: 60, increment: 2.5, group: 'delts + triceps circuit', circuit: 'arms', circuitRestSec: 0, sharedLoad: 'triceps' },
      { key: 'lateral_raise_r', name: 'lateral raise (right)', side: 'right', sets: 3, repMin: 12, repMax: 20, restSec: 60, increment: 2.5, group: 'delts + triceps circuit', circuit: 'arms', circuitRestSec: 60, sharedLoad: 'lateral' },
    ],
  },
  pull: {
    type: 'pull',
    label: 'pull + legs',
    required: false,
    exercises: [
      // The day's heavy leg movement. It's the leg press rather than a barbell
      // squat because there's no rack to squat in — the press is what's actually
      // trainable, and the squat goals read it through a conversion rather than
      // being abandoned (see lib/liftRatios). The load steps in 10s: a sled moves
      // in bigger jumps than a bar, and 5 lbs on a press this strong is inside
      // the noise of how the pad was set.
      { key: 'leg_press', name: 'leg press', sets: 4, repMin: 6, repMax: 10, restSec: 120, increment: 10, group: 'legs' },
      { key: 'hamstring_curl', name: 'hamstring curl', sets: 3, repMin: 10, repMax: 15, restSec: 90, increment: 5, group: 'legs' },
      { key: 'leg_adductor', name: 'leg adductor machine', sets: 3, repMin: 12, repMax: 15, restSec: 75, increment: 5, group: 'legs' },
      { key: 'leg_abductor', name: 'leg abductor machine', sets: 3, repMin: 12, repMax: 15, restSec: 75, increment: 5, group: 'legs' },
      // Pressing never takes the calves through range, so they get the only direct
      // work they see all week. A hard pause at the bottom is the point — bouncing
      // the stretch turns the whole set into tendon rebound.
      { key: 'calf_raise', name: 'calf raise', sets: 3, repMin: 10, repMax: 15, restSec: 60, increment: 5, group: 'legs' },

      { key: 'weighted_pullups', name: 'weighted pull-ups', sets: 4, repMin: 6, repMax: 10, restSec: 120, bodyweight: true, group: 'back' },

      // Straight off the pull-up bar and into the raises — same station, nothing
      // to walk to. Three sets, not the push day's four: it takes abs to 3× a week
      // without tipping weekly volume past the point where more sets stop paying.
      // Still after the leg press, so nothing pre-fatigues the core under the bar.
      { key: HANGING_RAISE_KEY, name: 'hanging knee raise', sets: 3, repMin: 10, repMax: GRADUATION_REPS, restSec: 60, bodyweight: true, repsOnly: true, group: 'core' },

      { key: 'cable_row', name: 'cable row (neutral grip)', sets: 2, repMin: 10, repMax: 12, restSec: 90, increment: 5, group: 'back' },

      // Both are a dumbbell in each hand, so both step in 10s (see dumbbellPair).
      { key: 'incline_db_curl', name: 'incline dumbbell curl', sets: 3, repMin: 8, repMax: 12, restSec: 90, increment: 10, dumbbellPair: true, group: 'biceps' },
      { key: 'hammer_curl', name: 'hammer curl', sets: 3, repMin: 10, repMax: 15, restSec: 60, increment: 10, dumbbellPair: true, group: 'biceps' },

      // Extension and flexion are antagonists, so they rotate as a circuit and the
      // pair costs about as long as one of them would alone. Two directions is what
      // changes how the neck reads front and back; lateral flexion is the slow
      // third and isn't worth the sets yet. Load stays light and the reps stay
      // high — the neck is the one place where grinding a heavy single is a bad bet.
      { key: 'neck_extension', name: 'neck extension', sets: 3, repMin: 12, repMax: 20, restSec: 45, increment: 2.5, group: 'neck circuit', circuit: 'neck' },
      { key: 'neck_flexion', name: 'neck flexion', sets: 3, repMin: 12, repMax: 20, restSec: 45, increment: 2.5, group: 'neck circuit', circuit: 'neck' },
    ],
  },
  fullbody: {
    type: 'fullbody',
    label: 'full body',
    required: false,
    // The everything-at-once option: for a day with extra time, or to front-load
    // a week you know gets busy later. One heavy movement per pattern plus a
    // little arm and core work — ~20 sets, so it runs a touch longer than a
    // push + core day rather than shorter.
    exercises: [
      { key: 'leg_press', name: 'leg press', sets: 3, repMin: 6, repMax: 10, restSec: 150, increment: 10, group: 'legs' },
      { key: 'flat_bench', name: 'flat bench press', sets: 3, repMin: 6, repMax: 10, restSec: 150, increment: 5, group: 'chest' },
      { key: 'weighted_pullups', name: 'weighted pull-ups', sets: 3, repMin: 6, repMax: 10, restSec: 120, bodyweight: true, group: 'back' },
      { key: 'db_overhead_press', name: 'dumbbell overhead press', sets: 3, repMin: 8, repMax: 12, restSec: 120, increment: 10, dumbbellPair: true, group: 'shoulders' },

      { key: 'hammer_curl', name: 'hammer curl', sets: 2, repMin: 10, repMax: 15, restSec: 60, increment: 10, dumbbellPair: true, group: 'arms circuit', circuit: 'arms' },
      { key: 'overhead_tricep_ext', name: 'overhead tricep extension', sets: 2, repMin: 10, repMax: 15, restSec: 60, increment: 2.5, group: 'arms circuit', circuit: 'arms' },

      { key: 'cable_crunch', name: 'cable crunch', sets: 3, repMin: 12, repMax: 15, restSec: 60, increment: 5, group: 'core' },
      { key: HANGING_RAISE_KEY, name: 'hanging knee raise', sets: 3, repMin: 10, repMax: GRADUATION_REPS, restSec: 60, bodyweight: true, repsOnly: true, group: 'core' },
    ],
  },
}

/**
 * The days in the order they're offered: a day the user has moved carries its own
 * {@link DayPlan.order}, and one that has never been moved keeps its shipped
 * {@link TODAY_DAY_ORDER} position. Ties — two days that
 * have never been moved, or a hand-edited plan with duplicate numbers — fall back
 * to the shipped order too, so the list is always all of DAY_TYPES exactly once.
 */
export function dayOrder(plan: Plan): DayType[] {
  const shipped = (t: DayType) => {
    const i = TODAY_DAY_ORDER.indexOf(t)
    return i < 0 ? TODAY_DAY_ORDER.length : i
  }
  return [...DAY_TYPES].sort((a, b) => {
    const oa = plan[a]?.order ?? shipped(a)
    const ob = plan[b]?.order ?? shipped(b)
    return oa === ob ? shipped(a) - shipped(b) : oa - ob
  })
}

/**
 * A copy of the plan with the days numbered into `order`. Every day is numbered,
 * including ones that keep their place, so the arrangement can't be half-stated —
 * a day left without a number would otherwise be sorted by where it once shipped.
 */
export function withDayOrder(plan: Plan, order: DayType[]): Plan {
  const positions = [...order, ...DAY_TYPES.filter((t) => !order.includes(t))]
  const next = { ...plan }
  positions.forEach((type, i) => {
    if (next[type]) next[type] = { ...next[type], order: i }
  })
  return next
}

/** Human-readable rep range, e.g. "6–10" or "12". */
export function repRangeLabel(e: Pick<PlannedExercise, 'repMin' | 'repMax'>): string {
  return e.repMin === e.repMax ? `${e.repMin}` : `${e.repMin}–${e.repMax}`
}

/**
 * A copy of `day` with one exercise's {@link PlannedExercise.circuitRestSec} set.
 *
 * `null` clears the field rather than storing a number, which is the only way to
 * get the built-in station timing back: `0` is a real setting ("no rest here"),
 * so the two can't share a value.
 */
export function withCircuitRest(day: DayPlan, key: string, sec: number | null): DayPlan {
  return {
    ...day,
    exercises: day.exercises.map((e) => {
      if (e.key !== key) return e
      if (sec != null) return { ...e, circuitRestSec: sec }
      const cleared = { ...e }
      delete cleared.circuitRestSec
      return cleared
    }),
  }
}

/**
 * All exercises across every day of the DEFAULT plan, for import matching + name
 * fallback. Dead Bug is appended even though it's no longer a plan day, so its
 * key still resolves to "Dead Bug" in charts, the AI prompt, and records. Keys
 * repeat across days (leg press and bench appear on Full Body too), so the first
 * occurrence of each key wins.
 */
export const ALL_EXERCISES: PlannedExercise[] = (() => {
  const seen = new Set<string>()
  const out: PlannedExercise[] = []
  for (const e of [
    ...DEFAULT_PLAN.push.exercises,
    ...DEFAULT_PLAN.pull.exercises,
    ...DEFAULT_PLAN.fullbody.exercises,
    DEAD_BUG,
  ]) {
    if (seen.has(e.key)) continue
    seen.add(e.key)
    out.push(e)
  }
  return out
})()

/**
 * Day labels the defaults used to ship with. A plan saved under an old name
 * keeps that label forever, so a rename here would never reach a device that
 * had already stored one — these get upgraded to the current default instead.
 * A label the user actually chose is left alone.
 */
const LEGACY_LABELS: Record<DayType, string[]> = {
  push: ['Push Day', 'Push', 'push'],
  pull: ['Pull + Legs Day', 'Pull + Legs'],
  fullbody: ['Full Body', 'Full Body Day'],
}

/**
 * Exercise names the defaults used to ship with, per key. Same problem as
 * LEGACY_LABELS: mergeDayExercises only re-adopts a default name when the stored
 * one differs by case alone, so a genuine rename (hanging LEG raise → hanging
 * KNEE raise) would otherwise look like a user edit and never reach a device
 * that had already saved a plan.
 */
const LEGACY_EXERCISE_NAMES: Record<string, string[]> = {
  [HANGING_RAISE_KEY]: ['hanging leg raise'],
  // The tempo cue read as a status — "calf raise (paused)" looked like a movement
  // the app had suspended rather than one to pause at the bottom of.
  calf_raise: ['calf raise (paused)'],
}

/**
 * Same idea again, for the weight step. The two-dumbbell movements shipped
 * stepping in 5s before {@link PlannedExercise.dumbbellPair} was understood, and
 * that's half a step — a pair of dumbbells only changes 10 lbs at a time. A
 * stored 5 on one of these is the old default rather than a choice, so it follows
 * the defaults up to 10; any other number is the user's own and is left alone.
 */
const LEGACY_EXERCISE_INCREMENTS: Record<string, number[]> = {
  db_overhead_press: [5],
  incline_db_curl: [5],
  hammer_curl: [5],
}

/** Same idea as LEGACY_EXERCISE_NAMES, for the display group. */
const LEGACY_EXERCISE_GROUPS: Record<string, string[]> = {
  db_overhead_press: ['shoulders & triceps'],
  iso_chest: ['chest'],
  tricep_pushdown: ['shoulders & triceps'],
  overhead_tricep_ext: ['shoulders & triceps'],
}

/**
 * Default exercises that have been retired from a day, per day type. A stored
 * day keeps the user's own exercises, so a removal here would never reach a
 * device that had already saved a plan — these are dropped explicitly instead.
 * Their logged history is untouched; only the plan entry goes away.
 */
const RETIRED_EXERCISES: Partial<Record<DayType, string[]>> = {
  // Superseded by the regular pull + legs day, which trains back properly; and
  // the both-arms lateral raise, now split into a left and a right station.
  push: ['pullups_or_pulldown', 'lateral_raise'],
  // The barbell squat, replaced by the leg press on both leg days: there's no
  // rack to squat in. Retiring it rather than leaving it means a device that
  // already saved a plan doesn't end up prescribing both.
  pull: ['barbell_squat'],
  fullbody: ['barbell_squat'],
}

/**
 * Merge the default exercise list into a stored day's list: the user's own
 * exercises (with their edits and ordering) are kept untouched, and any default
 * exercise the stored day is missing — e.g. a newly shipped move like Lateral
 * Raise — is spliced in next to its default neighbour so it lands in a sensible
 * spot. Existing (possibly customized) exercises are never overwritten.
 */
function mergeDayExercises(
  defaults: PlannedExercise[],
  stored: PlannedExercise[],
  retired: string[] = [],
  /**
   * A shipped restructure the stored day hasn't seen yet: re-adopt the defaults'
   * order and numbers for exercises the defaults own, keeping only the user's own
   * added exercises. See PLAN_REVISION.
   */
  restructure = false,
  /** Shipped exercises the user deleted; see {@link DayPlan.removed}. */
  removed: string[] = [],
): PlannedExercise[] {
  const retiredSet = new Set(retired)
  // A deletion outranks both ways a default gets re-adopted: the splice below and
  // a restructure's wholesale re-adoption. A restructure is a change of shipped
  // programming, not grounds to hand back a movement that was turned down.
  //
  // It also outranks the stored list itself. A deletion has to hold against a copy
  // that still lists the movement — the fetched one from a device that hadn't made
  // the deletion yet, which is the copy that kept resurrecting it. Safe because a
  // deletion is taken back by clearing the key rather than by re-listing the
  // exercise, so a plan never says both at once (see lib/planTools).
  const goneSet = new Set([...retiredSet, ...removed])
  if (restructure) {
    const defaultKeys = new Set(defaults.map((e) => e.key))
    // Exercises the user added themselves are theirs to keep; they go after the
    // shipped list rather than being dropped.
    const custom = stored.filter((e) => !defaultKeys.has(e.key) && !goneSet.has(e.key))
    return [...defaults.filter((e) => !goneSet.has(e.key)).map((e) => ({ ...e })), ...custom]
  }
  const kept = stored.filter((e) => !goneSet.has(e.key))
  const storedKeys = new Set(kept.map((e) => e.key))
  // Re-adopt the default name/group/weight step when a stored one differs only by
  // case (so a device that saved the old Title Case names picks up the lowercase
  // ones) or when it still matches a value the defaults used to ship with. A name
  // or a step the user actually chose reads as neither and is left alone.
  //
  // The structural fields (circuit, sharedLoad, dumbbellPair, side, byVariant,
  // repsOnly) are program design rather than user preference, and the plan editor
  // doesn't expose them, so they always come from the defaults — otherwise a
  // stored day would never pick up the arm circuit, the shared tricep load, which
  // arm a raise trains, or the push A/B split.
  const out = kept.map((e) => {
    const def = defaults.find((d) => d.key === e.key)
    if (!def) return e
    const wasDefaultName =
      def.name.toLowerCase() === e.name.toLowerCase() ||
      (LEGACY_EXERCISE_NAMES[e.key] ?? []).some((n) => n.toLowerCase() === e.name.toLowerCase())
    const wasDefaultGroup =
      def.group.toLowerCase() === e.group.toLowerCase() ||
      (LEGACY_EXERCISE_GROUPS[e.key] ?? []).some((g) => g.toLowerCase() === e.group.toLowerCase())
    const wasDefaultIncrement =
      e.increment != null && (LEGACY_EXERCISE_INCREMENTS[e.key] ?? []).includes(e.increment)
    return {
      ...e,
      name: wasDefaultName ? def.name : e.name,
      group: wasDefaultGroup ? def.group : e.group,
      increment: wasDefaultIncrement ? def.increment : e.increment,
      circuit: def.circuit,
      sharedLoad: def.sharedLoad,
      dumbbellPair: def.dumbbellPair,
      side: def.side,
      byVariant: def.byVariant,
      repsOnly: def.repsOnly,
    }
  })
  defaults.forEach((def, i) => {
    if (storedKeys.has(def.key) || goneSet.has(def.key)) return
    // Insert after the nearest earlier default exercise that the stored list has,
    // so a new move keeps its intended neighbour; otherwise append.
    let insertAt = out.length
    for (let j = i - 1; j >= 0; j--) {
      const idx = out.findIndex((e) => e.key === defaults[j].key)
      if (idx >= 0) {
        insertAt = idx + 1
        break
      }
    }
    out.splice(insertAt, 0, { ...def })
  })
  return out
}

/**
 * Merge a stored/fetched plan onto the defaults so a day saved before a new
 * exercise shipped still gains that exercise. Stored days/exercises win; missing
 * ones fall back to the default. Only the current DAY_TYPES are kept, so a plan
 * saved with a now-removed day (e.g. the old standalone `abs`/Core day) has that
 * day silently dropped rather than resurfacing a stale button.
 *
 * `storedRevision` is the {@link PLAN_REVISION} the stored plan was last
 * reconciled with (absent for plans saved before revisions existed). When it's
 * behind, the plan has missed a shipped restructure, so the days the defaults own
 * are re-adopted whole — order and numbers included — and only the user's own
 * added exercises are carried across. Without that, a deliberate programming
 * change like the arm circuit or four sets of core would never reach a device that
 * had already saved a plan.
 */
export function withPlanDefaults(
  p: Partial<Plan> | null | undefined,
  storedRevision?: number,
): Plan {
  const stored = (p ?? {}) as Partial<Record<string, DayPlan>>
  const restructure = (storedRevision ?? 0) < PLAN_REVISION
  const merged = {} as Plan
  for (const type of DAY_TYPES) {
    const storedDay = stored[type]
    const day = storedDay ?? DEFAULT_PLAN[type]
    // Deletions are pruned to the keys the defaults still ship, since those are
    // the only ones anything would put back — a movement the defaults have since
    // retired needs no headstone, and the list is written back on every save.
    const removed = readRemoved(storedDay).filter((key) =>
      DEFAULT_PLAN[type].exercises.some((e) => e.key === key),
    )
    // A day taken from storage keeps its exercises but gains any new defaults.
    const exercises = storedDay
      ? mergeDayExercises(
          DEFAULT_PLAN[type].exercises,
          day.exercises,
          RETIRED_EXERCISES[type],
          restructure,
          removed,
        )
      : day.exercises
    // A restructure also restores the shipped label, since a stored one may name a
    // day whose contents have changed ("push" for what is now push + core).
    const label =
      restructure || LEGACY_LABELS[type].includes(day.label) ? DEFAULT_PLAN[type].label : day.label
    // Repair slug-as-name entries on the way through, so a plan already saved with
    // one stops showing the raw key everywhere it's read.
    const named = exercises.map((e) => {
      const name = displayName(e)
      return name === e.name ? e : { ...e, name }
    })
    merged[type] = { ...day, type, label, exercises: named }
    // Left off entirely when there's nothing to record, so a plan that has never
    // had a deletion doesn't start carrying an empty array around.
    if (removed.length) merged[type].removed = removed
    else delete merged[type].removed
  }
  return merged
}

/** A day's {@link DayPlan.removed}, tolerating the shapes storage can hand back. */
function readRemoved(day: DayPlan | undefined): string[] {
  if (!day || !Array.isArray(day.removed)) return []
  return day.removed.filter((key): key is string => typeof key === 'string' && key !== '')
}

/**
 * A fetched plan with each day's deletions unioned with what this device already
 * knew was deleted.
 *
 * The backend keeps the plan as one JSON blob, so `removed` normally survives the
 * round trip. What doesn't survive is a copy pushed before this shipped, or from a
 * device that hasn't updated: it carries no list, and merging it would splice every
 * deleted default back in and then save that. Deletions are unioned rather than
 * overwritten for the same reason a lock is (see lib/settingsSync) — a device can
 * only report the removals it knows about, never that another device's are stale.
 */
export function withRemovedFrom(fetched: Partial<Plan>, local: Plan): Partial<Plan> {
  const out: Partial<Record<DayType, DayPlan>> = { ...fetched }
  for (const type of DAY_TYPES) {
    const day = out[type]
    if (!day) continue
    const removed = [...new Set([...readRemoved(day), ...readRemoved(local[type])])]
    out[type] = removed.length ? { ...day, removed } : day
  }
  return out
}

/**
 * Extra names that should resolve to an exercise key when matching imported logs.
 * The hanging-raise slot is the main case: it's named for knee raises today and
 * full leg raises later, and an old log could call it either.
 */
export const EXERCISE_ALIASES: Record<string, string[]> = {
  [HANGING_RAISE_KEY]: ['hanging leg raise', 'leg raise', 'knee raise', 'hanging raise'],
  iso_chest: ['pec fly', 'pec deck', 'chest fly'],
  db_overhead_press: ['shoulder press', 'overhead press'],
}

/**
 * Display names for movements the defaults have retired (see RETIRED_EXERCISES).
 * The plan entry goes away but the logged history stays, so PRs, the challenge
 * readout and the AI prompt all still ask for these keys by name.
 */
const RETIRED_EXERCISE_NAMES: Record<string, string> = {
  lateral_raise: 'lateral raise',
  pullups_or_pulldown: 'weighted pull-ups or lat pulldown',
  barbell_squat: 'barbell squat',
}

/**
 * A key spaced back out into words: `lateral_raise` -> `lateral raise`. The
 * last-resort display name for a movement nothing else knows, and the repair for
 * a stored name that is really just a key (see {@link displayName}).
 */
export function unslugKey(key: string): string {
  return key.replace(/[_-]+/g, ' ').trim()
}

/**
 * Lookup an exercise's display name by key: the plan defaults first, then the
 * retired movements above. A key that's in neither — one the user added, or one
 * that arrived from an import — has its separators spaced out rather than being
 * shown raw, so no exercise ever surfaces with its underscores intact.
 */
export function exerciseName(key: string): string {
  return (
    ALL_EXERCISES.find((e) => e.key === key)?.name ??
    RETIRED_EXERCISE_NAMES[key] ??
    unslugKey(key)
  )
}

/**
 * The name a stored plan exercise should show. An exercise added through the AI
 * chat can land with its key as its name (`lateral_raise`), and once that's saved
 * the key is what every screen reads — the plan editor, the session, PRs. A blank
 * name or a name identical to a separator-bearing key is that mistake rather than
 * a choice, so both are spaced back out; a name the user picked is left alone.
 */
function displayName(e: PlannedExercise): string {
  const name = typeof e.name === 'string' ? e.name.trim() : ''
  if (name && name !== e.key) return name
  return exerciseName(e.key)
}

/**
 * Keys of every exercise that trains the core, across all days of the plan —
 * matched by group ("Abs" or "Core") so ab work counts wherever it's logged
 * (e.g. cable crunches / hanging leg raises on Push day, or a Core session),
 * not just the dedicated Core-day move. Derived from the live plan so edits and
 * added ab exercises are picked up automatically.
 */
export function absExerciseKeys(plan: Plan): Set<string> {
  // Dead Bug lives in the Stretch + Core session now, not the plan, so seed it
  // explicitly to keep its reps in the combined core series.
  const keys = new Set<string>([DEAD_BUG.key])
  for (const day of Object.values(plan)) {
    for (const e of day.exercises) {
      if (/^(abs|core)$/i.test(e.group)) keys.add(e.key)
    }
  }
  return keys
}

/** Display groups that name lower-body work, for {@link legExerciseKeys}. */
const LEG_GROUP_RE = /^(legs?|quads?|hamstrings?|glutes?|calf|calves)$/i

/**
 * Keys of every exercise that trains the legs, matched by group the same way
 * {@link absExerciseKeys} matches core work, so a lower-body movement the user
 * adds is picked up automatically.
 *
 * The defaults' own leg movements are seeded regardless of how the live plan
 * groups them: a squat filed under "compound" is still leg work, and the point of
 * the set is to keep lower-body progress from standing in for what a progress
 * photo actually shows (see lib/photoReminder).
 */
export function legExerciseKeys(plan: Plan): Set<string> {
  const keys = new Set<string>(
    DEFAULT_PLAN.pull.exercises.filter((e) => LEG_GROUP_RE.test(e.group)).map((e) => e.key),
  )
  for (const day of Object.values(plan)) {
    for (const e of day.exercises) {
      if (LEG_GROUP_RE.test(e.group)) keys.add(e.key)
    }
  }
  return keys
}

/**
 * A day's exercise list as it should actually be performed, with the variant's
 * set counts and ordering applied. `variant` is null for days that don't run A/B
 * variants, in which case the list is returned untouched.
 */
export function variantExercises(day: DayPlan, variant: VariantKey | null): PlannedExercise[] {
  if (variant == null) return day.exercises

  // Set counts first — a pure per-exercise substitution.
  const out = day.exercises.map((ex) => {
    const sets = ex.byVariant?.[variant]?.sets
    return sets != null ? { ...ex, sets } : ex
  })

  // Then the swaps. Each pair is applied once (guarded by `done`), so declaring it
  // on both sides — or on neither — behaves the same, and an exercise the day no
  // longer contains is simply skipped.
  const done = new Set<string>()
  for (const ex of day.exercises) {
    const partnerKey = ex.byVariant?.[variant]?.swapWith
    if (!partnerKey || done.has(ex.key) || done.has(partnerKey)) continue
    const i = out.findIndex((e) => e.key === ex.key)
    const j = out.findIndex((e) => e.key === partnerKey)
    if (i < 0 || j < 0) continue
    ;[out[i], out[j]] = [out[j], out[i]]
    done.add(ex.key)
    done.add(partnerKey)
  }
  return out
}

/**
 * The same list with each one-limb-at-a-time pair ordered so `side` goes first.
 *
 * A sided movement ships as two entries — left then right — and the arm that leads
 * is the one done fresh, before the other side (and, inside the arm circuit, before
 * another trip round the stations). Flipping which of the two leads every session
 * is what keeps that advantage from always landing on the same arm; the caller
 * decides whose turn it is (see lib/pushSide).
 *
 * The two halves needn't be neighbours: in the arm circuit a tricep station sits
 * between them, so the arms land on opposite halves of every round. A pair is
 * therefore a sided entry plus the next one facing the other way, and the scan
 * resumes past that second half — so two unrelated sided movements in one day
 * still can't reorder each other. `side` of null leaves the list exactly as the
 * plan declares it.
 */
export function sideOrderedExercises(
  exercises: PlannedExercise[],
  side: Side | null | undefined,
): PlannedExercise[] {
  if (side == null) return exercises
  const out = [...exercises]
  for (let i = 0; i < out.length; i++) {
    const a = out[i]
    if (!a.side) continue
    const j = out.findIndex((e, k) => k > i && e.side && e.side !== a.side)
    if (j < 0) continue
    // Trade the pair's two positions, leaving whatever sits between them put.
    if (a.side !== side) [out[i], out[j]] = [out[j], out[i]]
    // Past the pair either way — its second half isn't the start of another one.
    i = j
  }
  return out
}

/** Backwards-compatible alias for modules still importing PLAN. */
export const PLAN = DEFAULT_PLAN
