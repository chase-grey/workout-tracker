export type DayType = 'push' | 'pull' | 'fullbody'

/** Which arm/leg a one-limb-at-a-time exercise trains (see PlannedExercise.side). */
export type Side = 'left' | 'right'

export type SetLog = {
  setNumber: number
  weightLbs: number | null
  reps: number
  notes?: string
  /** Whether the user has marked this set complete (only completed sets are saved). */
  done?: boolean
  /** Dropped from today's workout from the checklist: not owed, never logged (see lib/skipped). */
  skipped?: boolean
}

export type ExerciseLog = {
  /** A plan key, or the temporary key for an ad-hoc exercise in this session. */
  exercise: string
  sets: SetLog[]
  notes?: string
}

export type WorkoutSession = {
  sessionId: string
  date: string // YYYY-MM-DD
  dayType: DayType
  exercises: ExerciseLog[]
  /** Exercises added only to this in-progress workout from the checklist. */
  adHocExercises?: import('../config/plan').PlannedExercise[]
  /**
   * The order and the circuits this workout was dragged into from the checklist
   * (see lib/arrangement). Today's only: the plan is untouched.
   */
  arrangement?: import('../lib/arrangement').Arrangement | null
  isHistorical: boolean
  /** ISO timestamp the session was started — used to learn typical durations. */
  startedAt?: string
  /**
   * Which A/B variant of the day this is (Push + Core only). Pinned at start so a
   * session resumed after logging another one keeps the variant it began with.
   */
  variant?: 'A' | 'B'
  /**
   * Which side leads each of this session's one-limb-at-a-time exercises, by
   * exercise key — a pair flips every time it is trained, on whatever day, so
   * neither arm is always the tired one (see lib/pushSide). Pinned at start for
   * the same reason as `variant`: a resumed session keeps the order it began
   * with. Not stored per row, and it doesn't need to be: the two sides are
   * separate exercise keys and the rows are written in performed order, so a
   * pair's first row in a session is what its next session flips off.
   */
  startSides?: Record<string, Side>
  /** One side for every pair: what a session started before `startSides` pinned. */
  startSide?: Side
  /**
   * Whether this session is running the day's SHORT form or the FULL one (see
   * config/plan.SessionLength). Pinned at start like `variant`, and flipped to
   * full by the checklist's expand button mid-workout (see
   * lib/sessionLength.expandToFull). Absent on a session saved before lengths
   * existed, which is read as full — the whole day, as it always was.
   */
  length?: import('../config/plan').SessionLength
  /**
   * A workout of one movement, opened from a goal (see lib/soloSession). The day
   * prescribes nothing: the movement rides in `adHocExercises`, and `dayType` is
   * only where its rows are filed.
   */
  solo?: boolean
  /**
   * Whether this session leaves its ab block out because the abs were trained
   * the day before (or earlier today) — see lib/absRest. Pinned at start like
   * `length`, and cleared by the kebab's bring-abs-back action, which puts the
   * block into the log (lib/absRest.restoreAbs). Absent means the abs are in.
   */
  restAbs?: boolean
  /**
   * The same for the neck: its work left out because the neck trained the day
   * before (or earlier today) — see lib/neckRest. Absent means the neck is in.
   */
  restNeck?: boolean
}

export type BodyWeightEntry = {
  date: string // YYYY-MM-DD
  weightLbs: number
}

export type StreakState = {
  /** Consecutive weeks that hit the weekly goals (or were held with a freeze). */
  streak: number
  /** Streak-freeze credits available. */
  freezes: number
}

/**
 * A single flat row as stored in the Google Sheet `workouts` tab.
 * The Apps Script backend reads/writes exactly this shape.
 */
export type WorkoutRow = {
  session_id: string
  date: string
  day_type: DayType
  exercise: string
  set_number: number
  weight_lbs: number | null
  reps: number
  notes: string
  is_historical: boolean
  /**
   * Which A/B variant of the day the set was trained in (Push + Core only).
   *
   * Recorded per row because the same lift is trained under different fatigue in
   * each variant — flat bench leads variant B but follows four other exercises in
   * variant A — and without it the progression engine and the strength charts
   * would compare a fresh press against a tired one. Absent for days that don't
   * run variants, for imported history, and for anything logged before the split
   * shipped; such a session is comparable to either slot (see lastPerformance).
   */
  variant?: 'A' | 'B'
}
