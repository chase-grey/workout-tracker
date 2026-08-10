/**
 * Chase's side-splits routine (goal: 180° straddle, 2×/week). Editable data,
 * like the workout plan. Tempo strings are display-only guidance.
 */
export type FlexExercise = {
  key: string
  name: string
  sets: string // e.g. "3–4"
  maxSets: number // how many set-checkboxes to show
  reps: number
  tempo: string
  restSec: number
  /**
   * Roll straight from this stretch's rest into its next set without waiting for
   * a tap. Set from the session's overflow menu, so it sticks for every set of
   * the stretch and for future sessions (it's stored on the routine like any
   * other field).
   */
  autoAdvance?: boolean
  /**
   * The other direction: end this stretch's set and start its rest the moment the
   * set's target reps are done, without waiting for a tap. The rhythm guide paces
   * the reps, so the set has a real end the app can see — set from the same
   * overflow menu and stored the same way as `autoAdvance`.
   */
  autoIntoRest?: boolean
}

export type FlexBlock = {
  label: string
  note?: string
  /** If true (and 2+ exercises), sets are done round-robin across the exercises. */
  superset?: boolean
  exercises: FlexExercise[]
}

export const DEFAULT_FLEX_ROUTINE: FlexBlock[] = [
  {
    label: 'adductor superset',
    note: 'alternate back-to-back: tailor’s → horse → tailor’s → horse → tailor’s → horse (3 rounds each).',
    superset: true,
    exercises: [
      {
        key: 'tailors_pose',
        name: 'tailor’s pose',
        sets: '3–4',
        maxSets: 4,
        reps: 8,
        tempo: '2s down · 3s hold at bottom · 1s up',
        restSec: 90,
      },
      {
        key: 'horse_squat',
        name: 'horse squat',
        sets: '3–4',
        maxSets: 4,
        reps: 8,
        tempo: '2s down · 3s hold at bottom · 1s up',
        restSec: 90,
      },
    ],
  },
  {
    label: 'pancake',
    exercises: [
      {
        key: 'pancake_hang',
        name: 'pancake hang',
        sets: '2–3',
        maxSets: 3,
        reps: 6,
        tempo: '5s pushing down · 5s passive hang',
        restSec: 90,
      },
    ],
  },
]

/** Back-compat alias (some modules import FLEX_ROUTINE). */
export const FLEX_ROUTINE = DEFAULT_FLEX_ROUTINE
