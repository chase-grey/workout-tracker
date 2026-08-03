export type DayType = 'push' | 'pull' | 'fullbody'

export type SetLog = {
  setNumber: number
  weightLbs: number | null
  reps: number
  notes?: string
  /** Whether the user has marked this set complete (only completed sets are saved). */
  done?: boolean
}

export type ExerciseLog = {
  exercise: string // matches a plan config key
  sets: SetLog[]
  notes?: string
}

export type WorkoutSession = {
  sessionId: string
  date: string // YYYY-MM-DD
  dayType: DayType
  exercises: ExerciseLog[]
  isHistorical: boolean
  /** ISO timestamp the session was started — used to learn typical durations. */
  startedAt?: string
  /**
   * Which A/B variant of the day this is (Push + Core only). Pinned at start so a
   * session resumed after logging another one keeps the variant it began with.
   */
  variant?: 'A' | 'B'
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
