export type DayType = 'push' | 'pull'

export type SetLog = {
  setNumber: number
  weightLbs: number | null
  reps: number
  notes?: string
}

export type ExerciseLog = {
  exercise: string // matches a plan config key
  sets: SetLog[]
}

export type WorkoutSession = {
  sessionId: string
  date: string // YYYY-MM-DD
  dayType: DayType
  exercises: ExerciseLog[]
  isHistorical: boolean
}

export type BodyWeightEntry = {
  date: string // YYYY-MM-DD
  weightLbs: number
}

export type StreakState = {
  activeStreak: number // weeks with >= 1 workout
  doubleStreak: number // weeks with >= 2 workouts
  freezeCredits: number
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
}
