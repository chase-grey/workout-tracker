/**
 * Chase's side-splits routine (goal: 180° straddle). Editable data, like the
 * workout plan. Tempo strings are display-only guidance.
 *
 * Rests are sixty seconds, down from ninety. Ninety is a strength-training
 * number — time to clear fatigue before a heavy set — and none of this is a heavy
 * set: the longest working set here is forty-eight seconds of paced reps at
 * bodyweight. The superset shortens it further, since alternating tailor's and
 * horse means either one gets two rests before it comes round again. Thirty
 * seconds a set back across eight sets is most of the time the pancake block
 * costs.
 *
 * The head-to-toe routine (see config/flexRoutines) is built from the same shape,
 * which is what the optional fields below are for: every one of them reads as
 * "no" when absent, so the side-splits data above is unchanged by their arrival.
 */
export type FlexExercise = {
  key: string
  name: string
  sets: string // e.g. "3–4"
  maxSets: number // how many set-checkboxes to show
  reps: number
  tempo: string
  restSec: number
  /** Done one side at a time: the flow generates a left step and a right step per set. */
  perSide?: boolean
  /**
   * Seconds to hold, for a static hold rather than a rep-paced set. Mutually
   * exclusive with `tempo` — a step with holdSec renders the HoldTimer.
   *
   * It earns its place rather than being faked with a tempo string: a 90-second
   * static hold has nothing for RhythmGuide to animate, and HoldTimer already
   * does exactly this job for the plank — counts down, buzzes at the target, runs
   * on the wall clock, ends itself hands-free.
   */
  holdSec?: number
  /**
   * A name per set, when the sets are variations rather than rounds (the calf
   * stretch: knee straight / knee bent). Indexed by round.
   */
  setLabels?: string[]
  /** Seconds to switch legs between the two sides of a round. Default 5. */
  sideSwitchSec?: number
  /** The rest lands after both sides of a round, not after each side. */
  restAfterSides?: boolean
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
        restSec: 60,
      },
      {
        key: 'horse_squat',
        name: 'horse squat',
        sets: '3–4',
        maxSets: 4,
        reps: 8,
        tempo: '2s down · 3s hold at bottom · 1s up',
        restSec: 60,
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
        restSec: 60,
      },
    ],
  },
]

/** Back-compat alias (some modules import FLEX_ROUTINE). */
export const FLEX_ROUTINE = DEFAULT_FLEX_ROUTINE
