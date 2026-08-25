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
   * than offered as an empty "added lbs" box (hanging raises, the Copenhagen
   * plank).
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
   * Rest taken when this station wraps the circuit into a NEW ROUND, as opposed to
   * the change to the next station that {@link circuitRestSec} covers. Set both and
   * a circuit can hold a brief switch between its stations and a real rest between
   * its rounds — which is what the Copenhagen pair needs: ten seconds to turn over
   * onto the other side, two minutes before doing the pair again.
   *
   * Absent leaves the round boundary exactly as it was: the station's own
   * `circuitRestSec` if it has one, else the next exercise's capped rest. Unlike
   * that capped fallback this is taken at face value — it's a rest prescribed for
   * this boundary rather than one carried over from the coming exercise.
   */
  circuitRoundRestSec?: number
  /**
   * A HOLD rather than a count of reps: what gets logged for each set is the
   * seconds held, so `repMin`/`repMax` are a seconds range and the set screen
   * offers a hold timer in place of the reps box (see components/HoldTimer). Equal
   * min and max is a fixed hold — a 30-second plank stays a 30-second plank —
   * while a range lets the progression engine climb the hold the way it climbs
   * reps.
   *
   * Timed movements are kept out of the `abs`/`core` and leg groups that
   * {@link absExerciseKeys} and {@link legExerciseKeys} match, since those sum
   * their members as reps and 30 seconds is not 30 of anything.
   */
  timed?: boolean
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
   * The heaviest load this movement can actually be given — the top of the stack,
   * the last plate on the rack. Once a session is working at it, double progression
   * has no weight left to add, so the reps become the ladder instead: the top of the
   * rep range stops applying and the prescription is simply one more rep than last
   * time, session after session (see progression.nextTarget).
   *
   * Only worth setting where the ceiling is real and already reached. A movement
   * with room left on the stack progresses in weight the ordinary way, and the cap
   * does nothing until the load arrives at it.
   */
  weightCapLbs?: number
  /**
   * A movement that can't be loaded at all, so the reps are the only ladder it
   * has: the top of the rep range stops applying and the prescription is one more
   * rep than last time, session after session, with no top to arrive at (see
   * progression.nextTarget). `repMin` is where it starts and the floor it re-paces
   * to, so a range isn't needed — set both ends to the opening number.
   *
   * The same end of double progression that {@link weightCapLbs} reaches, arrived
   * at from the other direction: the capped lift ran out of stack, this one never
   * had any. A sideways leg raise is held up by nothing but the hip — there's no
   * plate to add and nowhere to hang one — so asking for more of them is the whole
   * progression.
   *
   * Only for movements that genuinely can't take weight. A bodyweight exercise
   * you could load later (the hanging raise, which graduates to a harder variation
   * instead) keeps its range.
   */
  repLadder?: boolean
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
 *
 * 8 — push + core: the weighted sit-up replaces the hanging raise, and the
 *     machine press replaces the dumbbell overhead press. Both movements are
 *     retired from this day only — the raise still runs on pull + legs and full
 *     body, and the dumbbells still press on full body.
 *
 * 9 — pull + legs trimmed to what it's actually training: the adductor and
 *     abductor machines and the cable row are retired, the weighted sit-up takes
 *     the hanging raise's core slot the way it did on push, and the calf raise is
 *     capped at the gym's heaviest 100 lbs so it climbs in reps from here.
 *
 * 10 — pull + legs: the Copenhagen plank ships as a left and a right station of a
 *     timed circuit — a 30-second hold each side, ten seconds to switch, and a full
 *     rest after the pair. It was a hand-added exercise before this, so the
 *     single-entry versions of it are retired.
 *
 * 11 — pull + legs: the sideways leg raise ships beside the Copenhagen pair as its
 *     own left and right circuit, trained on a rep ladder with no load and no top
 *     (see PlannedExercise.repLadder). Hand-added before this, so its single-entry
 *     versions are retired too.
 */
export const PLAN_REVISION = 11

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
 * The core work at the end of the Stretch + Core session: the weighted sit-up,
 * under the same key the push and pull days train it with, so one movement keeps
 * one history and one progression no matter which session it was done in.
 *
 * Its own sets and rest, though — this is a block appended to a mobility routine
 * rather than a copy of either day's slot. Each set is logged as a workout row of
 * weight × reps (see DataContext.logCore), and a session made up only of those
 * rows is supplemental: it feeds the charts and never counts toward the weekly
 * workout goal (see session.CORE_SESSION_NOTE).
 */
export const STRETCH_CORE: PlannedExercise = {
  key: 'weighted_situp',
  name: 'weighted sit-up',
  sets: 4,
  repMin: 10,
  repMax: 15,
  restSec: 60,
  increment: 5,
  group: 'core',
}

/**
 * The dead bug, retired: it held the Stretch + Core session's core slot until the
 * weighted sit-up took it over. A key rather than an exercise now — nothing new is
 * logged to it, but the sets it did log still need a name, still belong in the
 * combined core rep series, and are still supplemental (see
 * session.SUPPLEMENTAL_EXERCISE_KEYS).
 */
export const DEAD_BUG_KEY = 'deadbug'

/**
 * The hanging-raise slot. Starts as KNEE raises and graduates to full leg raises
 * once 3×20 is comfortable (see GRADUATION_REPS / shouldGraduateHangingRaise) —
 * one progression, so it keeps one exercise key and one continuous history.
 */
export const HANGING_RAISE_KEY = 'hanging_leg_raise'

/**
 * Sets × reps of hanging knee raises that earn the move up to full leg raises.
 *
 * The set count tracks the most any day actually prescribes, which is what makes
 * the standard reachable: it was four while push + core trained the raise, and is
 * three now that full body is the only day that trains it. Leaving it above what
 * any day asks for would make graduation impossible to earn.
 */
export const GRADUATION_SETS = 3
export const GRADUATION_REPS = 20

/**
 * The Copenhagen plank: a timed hold, one side at a time, with the two sides
 * rotated as a circuit (see the pull + legs day below).
 *
 * A fixed 30 seconds rather than a range — the hold is hard enough at 30 that the
 * thing worth progressing is how well it's held, and the actual time is logged
 * either way, so a set that only made 22 reads as 22 rather than as a failure to
 * reach a target.
 *
 * The switch is the whole rest between the sides: there's nothing to do between
 * them but turn over onto the other elbow, and resting the left adductor while the
 * right one works is what makes the pair a circuit in the first place. The real
 * rest lands after both sides, and is long because a 30-second adductor hold is
 * closer to a heavy set than to an ab exercise.
 */
export const COPENHAGEN_HOLD_SEC = 30
export const COPENHAGEN_SWITCH_SEC = 10
export const COPENHAGEN_ROUND_REST_SEC = 150

/**
 * The sideways leg raise: a hip abduction raise done lying on one side, a side at
 * a time, and rotated as a circuit the way the Copenhagen pair is.
 *
 * Fifteen is where the ladder starts rather than a range it climbs inside — there
 * is no load to earn at the top of a range, so the number itself is the
 * progression and it has no top (see PlannedExercise.repLadder). A session that
 * holds it on every set is asked for one more next time.
 *
 * Ten seconds to roll over onto the other side, and a minute's rest after the pair
 * — less than the Copenhagen's, since a set of raises is closer to an ab exercise
 * than to the near-maximal hold that one is.
 */
export const SIDE_RAISE_START_REPS = 15
export const SIDE_RAISE_SWITCH_SEC = 10
export const SIDE_RAISE_ROUND_REST_SEC = 60

export const DEFAULT_PLAN: Plan = {
  push: {
    type: 'push',
    label: 'push + core',
    required: true,
    exercises: [
      { key: 'cable_crunch', name: 'cable crunch', sets: 4, repMin: 12, repMax: 15, restSec: 60, increment: 5, group: 'abs' },

      // The day's second ab movement is loaded rather than reps-only: a plate held
      // at the chest gives the abs somewhere to progress once the reps are there,
      // which a hanging raise capped at 20 doesn't. The raise isn't gone — it still
      // runs on pull + legs and full body, so it's trained twice a week.
      { key: 'weighted_situp', name: 'weighted sit-up', sets: 4, repMin: 10, repMax: 15, restSec: 60, increment: 5, group: 'abs' },

      // Incline leads variant A (upper-chest emphasis is the aesthetic priority);
      // flat leads variant B. The non-primary press drops to 3 sets that day,
      // keeping weekly chest volume near 16 sets instead of an unproductive 20+.
      // Either press can carry the bench-bodyweight goal's reading, so whichever
      // one leads, the day counts (see goals.BENCH_ALSO_KEYS).
      { key: 'incline_bench', name: 'incline bench press', sets: 4, repMin: 6, repMax: 10, restSec: 150, increment: 5, group: 'chest', byVariant: { B: { sets: 3 } } },
      { key: 'flat_bench', name: 'flat bench press', sets: 3, repMin: 8, repMax: 12, restSec: 120, increment: 5, group: 'chest', byVariant: { B: { sets: 4, swapWith: 'incline_bench' } } },

      // Overhead press follows the presses directly now that the fly is gone —
      // front delts already take heavy work from seven press sets above, so three
      // sets is what the shoulders are here for rather than a fourth press.
      //
      // The machine rather than the dumbbells: coming off seven sets of pressing,
      // what limits the dumbbell version is getting them overhead and holding the
      // path, not the delts. A fixed path takes that out, and the stack steps in
      // 5s where a pair of dumbbells can only move 10 at a time — twice the
      // resolution on the movement that needs it most. The dumbbell press keeps
      // its place on full body, where it's pressed fresh.
      { key: 'machine_overhead_press', name: 'machine overhead press', sets: 3, repMin: 8, repMax: 12, restSec: 120, increment: 5, group: 'shoulders' },

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

      // Pressing never takes the calves through range, so they get the only direct
      // work they see all week. A hard pause at the bottom is the point — bouncing
      // the stretch turns the whole set into tendon rebound.
      //
      // 100 lbs is the whole stack on this machine, and it's already a comfortable
      // 3×20, so the cap is where the load stays and the reps are the ladder from
      // here — one more every session, with no top (see weightCapLbs). 20 is
      // therefore the floor rather than a range: a target under it means the day
      // went badly, not that the load needs lightening, which is the one thing the
      // machine can't offer anyway.
      { key: 'calf_raise', name: 'calf raise', sets: 3, repMin: 20, repMax: 20, restSec: 60, increment: 5, weightCapLbs: 100, group: 'legs' },

      // A hold rather than a count of reps (see PlannedExercise.timed), trained one
      // side at a time so each adductor is logged and charted on its own — an
      // imbalance here is both common and the thing the movement is for.
      //
      // The two sides rotate as a circuit rather than running one side's sets
      // through and then the other's: the resting adductor is recovering while the
      // working one holds, so the only break the switch needs is the time it takes
      // to turn over onto the other elbow. The full rest goes after the pair instead
      // (see COPENHAGEN_ROUND_REST_SEC) — declared on both stations, since which
      // side leads flips every session and either of them can be the one wrapping
      // into the next round.
      //
      // Grouped as adductors rather than core: it's what the movement actually
      // trains, and it keeps a hold measured in seconds out of the aggregates that
      // sum their members as reps (see absExerciseKeys / legExerciseKeys).
      { key: 'copenhagen_plank_l', name: 'copenhagen plank (left)', side: 'left', sets: 3, repMin: COPENHAGEN_HOLD_SEC, repMax: COPENHAGEN_HOLD_SEC, restSec: COPENHAGEN_ROUND_REST_SEC, timed: true, bodyweight: true, repsOnly: true, group: 'adductors', circuit: 'copenhagen', circuitRestSec: COPENHAGEN_SWITCH_SEC, circuitRoundRestSec: COPENHAGEN_ROUND_REST_SEC },
      { key: 'copenhagen_plank_r', name: 'copenhagen plank (right)', side: 'right', sets: 3, repMin: COPENHAGEN_HOLD_SEC, repMax: COPENHAGEN_HOLD_SEC, restSec: COPENHAGEN_ROUND_REST_SEC, timed: true, bodyweight: true, repsOnly: true, group: 'adductors', circuit: 'copenhagen', circuitRestSec: COPENHAGEN_SWITCH_SEC, circuitRoundRestSec: COPENHAGEN_ROUND_REST_SEC },

      // The other half of the hip, and the abductor machine's replacement now that
      // the machine is retired: the same outer hip, trained by lifting the leg
      // against nothing but its own weight.
      //
      // No load, ever — a leg lifted sideways is held up by the hip alone, and
      // there's nowhere to hang a plate on it. So the reps are the whole ladder
      // (see PlannedExercise.repLadder): fifteen to open with, and one more every
      // session that holds fifteen clean across all three sets, with no top.
      //
      // A side each, like the Copenhagen pair above and for the same reason — an
      // imbalance between hips is what the movement is for, and it can't be seen if
      // the two sides share a history. They rotate as a circuit too: the resting hip
      // recovers while the other works, so the switch is just the time it takes to
      // roll over, and the real rest lands after both sides.
      { key: 'sideways_leg_raise_l', name: 'sideways leg raise (left)', side: 'left', sets: 3, repMin: SIDE_RAISE_START_REPS, repMax: SIDE_RAISE_START_REPS, restSec: SIDE_RAISE_ROUND_REST_SEC, bodyweight: true, repsOnly: true, repLadder: true, group: 'abductors', circuit: 'side_raise', circuitRestSec: SIDE_RAISE_SWITCH_SEC, circuitRoundRestSec: SIDE_RAISE_ROUND_REST_SEC },
      { key: 'sideways_leg_raise_r', name: 'sideways leg raise (right)', side: 'right', sets: 3, repMin: SIDE_RAISE_START_REPS, repMax: SIDE_RAISE_START_REPS, restSec: SIDE_RAISE_ROUND_REST_SEC, bodyweight: true, repsOnly: true, repLadder: true, group: 'abductors', circuit: 'side_raise', circuitRestSec: SIDE_RAISE_SWITCH_SEC, circuitRoundRestSec: SIDE_RAISE_ROUND_REST_SEC },

      { key: 'weighted_pullups', name: 'weighted pull-ups', sets: 4, repMin: 6, repMax: 10, restSec: 120, bodyweight: true, group: 'back' },

      // The same swap push + core made, for the same reason: a plate at the chest
      // gives the abs somewhere to keep progressing, where the hanging raise tops
      // out at the 20 reps that graduate it. Three sets, not push's four — abs are
      // trained 3× a week and this is the second of those days. The raise still runs
      // on full body, which is what carries it to graduation now.
      { key: 'weighted_situp', name: 'weighted sit-up', sets: 3, repMin: 10, repMax: 15, restSec: 60, increment: 5, group: 'core' },

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

      // The only day that trains the raise now, so it's the day graduation has to
      // be earned on — hence the set count comes from the standard itself rather
      // than being written out beside it (see GRADUATION_SETS).
      { key: HANGING_RAISE_KEY, name: 'hanging knee raise', sets: GRADUATION_SETS, repMin: 10, repMax: GRADUATION_REPS, restSec: 60, bodyweight: true, repsOnly: true, group: 'core' },
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

/**
 * Human-readable rep range, e.g. "6–10", "12", or "20+".
 *
 * A movement whose reps are the ladder gets the open-ended form: there's no weight
 * to earn by reaching the top of its range — either because the stack has run out
 * or because the movement can't be loaded at all — so the reps go on climbing past
 * it and a closed range would be describing a ceiling that isn't there (see
 * {@link PlannedExercise.weightCapLbs} and {@link PlannedExercise.repLadder}).
 */
export function repRangeLabel(
  e: Pick<PlannedExercise, 'repMin' | 'repMax' | 'weightCapLbs' | 'repLadder'>,
): string {
  if (e.weightCapLbs != null || e.repLadder) return `${e.repMax}+`
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
 * A copy of `day` with {@link PlannedExercise.circuitRoundRestSec} set on every
 * station of one circuit.
 *
 * The whole circuit at once, unlike {@link withCircuitRest}, because the round
 * boundary isn't a property of any one station: whichever station happens to run
 * last is the one that wraps, and for a sided pair that's a different station every
 * session. Setting it in one place is also how it reads — "rest between rounds" is
 * one rest, not one per move.
 *
 * `null` clears it, handing the boundary back to the stations' own
 * {@link PlannedExercise.circuitRestSec} (see lib/rest.restBeforeNextSet).
 */
export function withCircuitRoundRest(
  day: DayPlan,
  circuit: string,
  sec: number | null,
): DayPlan {
  return {
    ...day,
    exercises: day.exercises.map((e) => {
      if (e.circuit !== circuit) return e
      if (sec != null) return { ...e, circuitRoundRestSec: sec }
      const cleared = { ...e }
      delete cleared.circuitRoundRestSec
      return cleared
    }),
  }
}

/**
 * All exercises across every day of the DEFAULT plan, for import matching + name
 * fallback. Keys repeat across days (leg press and bench appear on Full Body too),
 * so the first occurrence of each key wins. The Stretch + Core session's core move
 * needs no appending — it's the weighted sit-up the plan days already train (see
 * STRETCH_CORE).
 */
export const ALL_EXERCISES: PlannedExercise[] = (() => {
  const seen = new Set<string>()
  const out: PlannedExercise[] = []
  for (const e of [
    ...DEFAULT_PLAN.push.exercises,
    ...DEFAULT_PLAN.pull.exercises,
    ...DEFAULT_PLAN.fullbody.exercises,
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
  //
  // The last two are retired from THIS day only — both are still shipped
  // elsewhere (the raise on full body, the dumbbell press on full body), which is
  // fine: retirement is per day, and their logged history is untouched either way.
  push: [
    'pullups_or_pulldown',
    'lateral_raise',
    HANGING_RAISE_KEY,
    'db_overhead_press',
    // The chest fly / pec deck. Seven sets of pressing across two variants, plus
    // three more on full body, is already more chest work than the fly was adding
    // to — and it was the slot that made the day run long. Its logged history
    // stays; only the plan entry goes.
    'iso_chest',
  ],
  pull: [
    // The barbell squat, replaced by the leg press on both leg days: there's no
    // rack to squat in. Retiring it rather than leaving it means a device that
    // already saved a plan doesn't end up prescribing both.
    'barbell_squat',
    // The hip machines. Two more machines and six more sets for the two muscles
    // the day was least interested in training, and the leg press already works
    // both through the range it moves them in.
    'leg_adductor',
    'leg_abductor',
    // The row. Back is trained by four sets of weighted pull-ups here, which is
    // the movement worth the day's pulling volume; two sets of a row on the end
    // were the part of the day that got dropped when time ran short anyway.
    'cable_row',
    // Replaced by the weighted sit-up, as on push. Still shipped on full body.
    HANGING_RAISE_KEY,
    // The hand-added Copenhagen plank, now shipped as a left and a right station
    // (see COPENHAGEN_HOLD_SEC). It was only ever a custom entry, so what it was
    // keyed as depends on the name it was added under — the plausible slugs are all
    // listed, and a key nothing ever stored costs nothing to retire. Its logged
    // history stays either way; only the plan entry goes.
    'copenhagen_plank',
    'copenhagen_planks',
    'copenhagen',
    'copenhagen_side_plank',
    'copenhagen_plank_hold',
    // The sideways leg raise, same story as the plank above: a hand-added entry
    // until it shipped as a left and a right station, so which key it's under
    // depends on the name it was added with. Every plausible slug is listed, and
    // retiring one nothing ever stored costs nothing. The logged history stays.
    'sideways_leg_raise',
    'sideways_leg_raises',
    'side_leg_raise',
    'side_leg_raises',
    'lateral_leg_raise',
    'hip_abduction',
  ],
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
  // repsOnly, weightCapLbs, repLadder, timed) are program design rather than user
  // preference, and the plan editor doesn't expose them, so they always come from
  // the defaults — otherwise a stored day would never pick up the arm circuit, the
  // shared tricep load, which arm a raise trains, the push A/B split, the calf
  // machine's ceiling, that a movement climbs in reps because it can't be loaded,
  // or that a plank is held for seconds rather than counted in reps.
  //
  // The round rest is the exception among the circuit fields: like `circuitRestSec`
  // it's editable from the session menu, so a stored value is the user's own and is
  // kept. A restructure still re-adopts it, which is how the shipped value arrives.
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
      weightCapLbs: def.weightCapLbs,
      repLadder: def.repLadder,
      timed: def.timed,
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
  // "situp" written closed up is one token where the display name is two ("sit-up"
  // normalizes to "sit up"), so it needs saying explicitly. The bare "overhead
  // press" stays with the dumbbell key — that's what every log written before the
  // machine took over the push day meant.
  weighted_situp: ['situp', 'weighted situp'],
  machine_overhead_press: ['machine shoulder press'],
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
  leg_adductor: 'leg adductor machine',
  leg_abductor: 'leg abductor machine',
  // Spaced-out keys would read "cable row" and lose the grip, which is the part
  // that says which row the logged sessions were.
  cable_row: 'cable row (neutral grip)',
  iso_chest: 'chest fly / pec deck',
  // Written closed up, so spacing the key out would read "deadbug".
  [DEAD_BUG_KEY]: 'dead bug',
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
  // The retired dead bug is on no day of the plan, so seed it explicitly to keep
  // the reps it did log in the combined core series. The Stretch + Core session's
  // own move needs no seeding: it's the weighted sit-up, which the plan days carry
  // in an ab group already.
  const keys = new Set<string>([DEAD_BUG_KEY])
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
