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
    label: 'Adductor superset',
    note: 'Alternate back-to-back: Tailor’s → Horse → Tailor’s → Horse → Tailor’s → Horse (3 rounds each).',
    superset: true,
    exercises: [
      {
        key: 'tailors_pose',
        name: 'Tailor’s Pose',
        sets: '3–4',
        maxSets: 4,
        reps: 8,
        tempo: '2s down · 3s hold at bottom · 1s up',
        restSec: 90,
      },
      {
        key: 'horse_squat',
        name: 'Horse Squat',
        sets: '3–4',
        maxSets: 4,
        reps: 8,
        tempo: '2s down · 3s hold at bottom · 1s up',
        restSec: 90,
      },
    ],
  },
  {
    label: 'Pancake',
    exercises: [
      {
        key: 'pancake_hang',
        name: 'Pancake Hang',
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
