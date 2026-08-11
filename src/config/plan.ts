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
  /**
   * Roll straight from this exercise's rest into its next set without waiting for
   * a tap. Set from the session's overflow menu, so it sticks for every set of the
   * move and for future sessions (it's stored on the plan like any other field).
   */
  autoAdvance?: boolean
}

export type DayPlan = {
  type: DayType
  label: string
  required: boolean
  exercises: PlannedExercise[]
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
 */
export const PLAN_REVISION = 5

export const DAY_TYPES: DayType[] = ['push', 'pull', 'fullbody']

/**
 * The order the Today tab offers the days in. Separate from DAY_TYPES, which is
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
      // flat leads variant B, which is also the lift the bench-bodyweight goal
      // is measured on. The non-primary press drops to 3 sets that day, keeping
      // weekly chest volume near 16 sets instead of an unproductive 20+.
      { key: 'incline_bench', name: 'incline bench press', sets: 4, repMin: 6, repMax: 10, restSec: 150, increment: 5, group: 'chest', byVariant: { B: { sets: 3 } } },
      { key: 'flat_bench', name: 'flat bench press', sets: 3, repMin: 8, repMax: 12, restSec: 120, increment: 5, group: 'chest', byVariant: { B: { sets: 4, swapWith: 'incline_bench' } } },

      // Overhead press is a compound, so it goes before chest isolation — three
      // sets done fresh beat four done after flys, and front delts already take
      // heavy work from seven press sets above.
      { key: 'db_overhead_press', name: 'dumbbell overhead press', sets: 3, repMin: 8, repMax: 12, restSec: 120, increment: 5, group: 'shoulders' },
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
      { key: 'tricep_pushdown', name: 'tricep pushdown', sets: 3, repMin: 10, repMax: 15, restSec: 60, increment: 2.5, group: 'delts + triceps circuit', circuit: 'arms', sharedLoad: 'triceps' },
      { key: 'lateral_raise_l', name: 'lateral raise (left)', side: 'left', sets: 3, repMin: 12, repMax: 20, restSec: 60, increment: 2.5, group: 'delts + triceps circuit', circuit: 'arms', sharedLoad: 'lateral' },
      { key: 'overhead_tricep_ext', name: 'overhead tricep extension', sets: 3, repMin: 10, repMax: 15, restSec: 60, increment: 2.5, group: 'delts + triceps circuit', circuit: 'arms', sharedLoad: 'triceps' },
      { key: 'lateral_raise_r', name: 'lateral raise (right)', side: 'right', sets: 3, repMin: 12, repMax: 20, restSec: 60, increment: 2.5, group: 'delts + triceps circuit', circuit: 'arms', sharedLoad: 'lateral' },
    ],
  },
  pull: {
    type: 'pull',
    label: 'pull + legs',
    required: false,
    exercises: [
      { key: 'barbell_squat', name: 'barbell squat', sets: 4, repMin: 6, repMax: 10, restSec: 120, increment: 5, group: 'legs' },
      { key: 'hamstring_curl', name: 'hamstring curl', sets: 3, repMin: 10, repMax: 15, restSec: 90, increment: 5, group: 'legs' },
      { key: 'leg_adductor', name: 'leg adductor machine', sets: 3, repMin: 12, repMax: 15, restSec: 75, increment: 5, group: 'legs' },
      { key: 'leg_abductor', name: 'leg abductor machine', sets: 3, repMin: 12, repMax: 15, restSec: 75, increment: 5, group: 'legs' },
      // Squats never take the calves through range, so they get the only direct
      // work they see all week. A hard pause at the bottom is the point — bouncing
      // the stretch turns the whole set into tendon rebound.
      { key: 'calf_raise', name: 'calf raise (paused)', sets: 3, repMin: 10, repMax: 15, restSec: 60, increment: 5, group: 'legs' },

      { key: 'weighted_pullups', name: 'weighted pull-ups', sets: 4, repMin: 6, repMax: 10, restSec: 120, bodyweight: true, group: 'back' },

      // Straight off the pull-up bar and into the raises — same station, nothing
      // to walk to. Three sets, not the push day's four: it takes abs to 3× a week
      // without tipping weekly volume past the point where more sets stop paying.
      // Still after squats, so nothing pre-fatigues the core under the bar.
      { key: HANGING_RAISE_KEY, name: 'hanging knee raise', sets: 3, repMin: 10, repMax: GRADUATION_REPS, restSec: 60, bodyweight: true, repsOnly: true, group: 'core' },

      { key: 'cable_row', name: 'cable row (neutral grip)', sets: 2, repMin: 10, repMax: 12, restSec: 90, increment: 5, group: 'back' },

      { key: 'incline_db_curl', name: 'incline dumbbell curl', sets: 3, repMin: 8, repMax: 12, restSec: 90, increment: 5, group: 'biceps' },
      { key: 'hammer_curl', name: 'hammer curl', sets: 3, repMin: 10, repMax: 15, restSec: 60, increment: 5, group: 'biceps' },

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
      { key: 'barbell_squat', name: 'barbell squat', sets: 3, repMin: 6, repMax: 10, restSec: 150, increment: 5, group: 'legs' },
      { key: 'flat_bench', name: 'flat bench press', sets: 3, repMin: 6, repMax: 10, restSec: 150, increment: 5, group: 'chest' },
      { key: 'weighted_pullups', name: 'weighted pull-ups', sets: 3, repMin: 6, repMax: 10, restSec: 120, bodyweight: true, group: 'back' },
      { key: 'db_overhead_press', name: 'dumbbell overhead press', sets: 3, repMin: 8, repMax: 12, restSec: 120, increment: 5, group: 'shoulders' },

      { key: 'hammer_curl', name: 'hammer curl', sets: 2, repMin: 10, repMax: 15, restSec: 60, increment: 5, group: 'arms circuit', circuit: 'arms' },
      { key: 'overhead_tricep_ext', name: 'overhead tricep extension', sets: 2, repMin: 10, repMax: 15, restSec: 60, increment: 2.5, group: 'arms circuit', circuit: 'arms' },

      { key: 'cable_crunch', name: 'cable crunch', sets: 3, repMin: 12, repMax: 15, restSec: 60, increment: 5, group: 'core' },
      { key: HANGING_RAISE_KEY, name: 'hanging knee raise', sets: 3, repMin: 10, repMax: GRADUATION_REPS, restSec: 60, bodyweight: true, repsOnly: true, group: 'core' },
    ],
  },
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
 * repeat across days (squat and bench appear on Full Body too), so the first
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
): PlannedExercise[] {
  const retiredSet = new Set(retired)
  if (restructure) {
    const defaultKeys = new Set(defaults.map((e) => e.key))
    // Exercises the user added themselves are theirs to keep; they go after the
    // shipped list rather than being dropped.
    const custom = stored.filter((e) => !defaultKeys.has(e.key) && !retiredSet.has(e.key))
    return [...defaults.map((e) => ({ ...e })), ...custom]
  }
  const kept = stored.filter((e) => !retiredSet.has(e.key))
  const storedKeys = new Set(kept.map((e) => e.key))
  // Re-adopt the default name/group when a stored one differs only by case (so a
  // device that saved the old Title Case names picks up the lowercase ones) or
  // when it still matches a name/group the defaults used to ship with. A name the
  // user actually chose reads as neither and is left alone.
  //
  // The structural fields (circuit, sharedLoad, side, byVariant, repsOnly) are
  // program design rather than user preference, and the plan editor doesn't expose
  // them, so they always come from the defaults — otherwise a stored day would
  // never pick up the arm circuit, the shared tricep load, which arm a raise
  // trains, or the push A/B split.
  const out = kept.map((e) => {
    const def = defaults.find((d) => d.key === e.key)
    if (!def) return e
    const wasDefaultName =
      def.name.toLowerCase() === e.name.toLowerCase() ||
      (LEGACY_EXERCISE_NAMES[e.key] ?? []).some((n) => n.toLowerCase() === e.name.toLowerCase())
    const wasDefaultGroup =
      def.group.toLowerCase() === e.group.toLowerCase() ||
      (LEGACY_EXERCISE_GROUPS[e.key] ?? []).some((g) => g.toLowerCase() === e.group.toLowerCase())
    return {
      ...e,
      name: wasDefaultName ? def.name : e.name,
      group: wasDefaultGroup ? def.group : e.group,
      circuit: def.circuit,
      sharedLoad: def.sharedLoad,
      side: def.side,
      byVariant: def.byVariant,
      repsOnly: def.repsOnly,
    }
  })
  defaults.forEach((def, i) => {
    if (storedKeys.has(def.key)) return
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
    // A day taken from storage keeps its exercises but gains any new defaults.
    const exercises = storedDay
      ? mergeDayExercises(
          DEFAULT_PLAN[type].exercises,
          day.exercises,
          RETIRED_EXERCISES[type],
          restructure,
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
  }
  return merged
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
