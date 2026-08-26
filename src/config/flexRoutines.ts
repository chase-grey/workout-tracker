import { DEFAULT_FLEX_ROUTINE, type FlexBlock } from './flexPlan'
import type { PhotoKind } from '../lib/photoSteps'

/**
 * The two stretch routines, and everything that distinguishes one from the other.
 *
 * They alternate the way the push and pull days do: Today dims whichever was
 * done last, so the other reads as up next (see lib/stretchRotation). One place
 * knows what a routine *is* — its blocks, its name, and the photos it offers —
 * so adding the head-to-toe routine didn't mean teaching the session flow, the
 * photo gates and the plan editor about it separately.
 */
export type FlexRoutineKey = 'side_split' | 'head_to_toe'

export type FlexRoutine = {
  key: FlexRoutineKey
  label: string
  blocks: FlexBlock[]
  /** Shots offered on the cold screen at the top of the session. */
  coldShots: PhotoKind[]
  /** Shots offered on the warm screen after the last stretch set. */
  warmShots: PhotoKind[]
}

/**
 * The head-to-toe routine: feet, calves, nerve floss, pike. Every exercise runs
 * one side at a time (`perSide`), and each is its own block — nothing here is a
 * superset, and the block labels are what the session header and the checklist
 * show.
 *
 * The tempo strings are chosen so lib/tempo and lib/rhythmMotion read them
 * correctly with no changes: `up`/`down` gives the floss a breath, `press down`
 * then `rest` gives the block crush a descent that drives hard and then lets most
 * of it go without leaving the pose, and `press down` · `rest` · `pull up` · `rest`
 * gives the pike lift a push/pull — two efforts in opposite directions, each with
 * its own rest, which is the only family that shows the direction rather than a
 * depth. They're word-boundary regex matches, so renaming a phase would silently
 * change the animation — see lib/rhythmMotion.test.
 */
const HEAD_TO_TOE_BLOCKS: FlexBlock[] = [
  {
    label: 'feet',
    exercises: [
      {
        key: 'rolling_feet',
        name: 'rolling feet',
        sets: '1',
        maxSets: 1,
        reps: 1,
        tempo: '',
        holdSec: 90,
        perSide: true,
        restSec: 0,
      },
    ],
  },
  {
    label: 'calves',
    // Three variations rather than three identical rounds, so the block is six
    // holds — nine minutes of it.
    exercises: [
      {
        key: 'calf_stretch',
        name: 'calf stretch',
        sets: '3',
        maxSets: 3,
        reps: 1,
        tempo: '',
        holdSec: 90,
        perSide: true,
        restSec: 0,
        setLabels: ['straight on', 'feet out', 'feet in'],
      },
    ],
  },
  {
    label: 'nerve floss',
    exercises: [
      {
        key: 'sciatic_floss',
        name: 'sciatic nerve floss',
        sets: '3',
        maxSets: 3,
        reps: 8,
        tempo: '3s up · 3s down',
        perSide: true,
        restSec: 60,
        restAfterSides: true,
        // Changing legs on the floss is getting out of the strap and back into it
        // on the other side, which the default five seconds doesn't cover. The
        // same ten seconds the settle-in gives it after a rest (see lib/settleIn).
        sideSwitchSec: 10,
      },
    ],
  },
  {
    label: 'pike',
    exercises: [
      {
        key: 'pike_block_crush',
        name: 'pike block crush',
        sets: '1',
        maxSets: 1,
        reps: 3,
        tempo: '10s press down · 5s rest',
        perSide: true,
        restSec: 60,
        restAfterSides: true,
      },
      {
        key: 'pike_lift',
        name: 'pike lift',
        sets: '3',
        maxSets: 3,
        reps: 5,
        tempo: '5s press down · 5s rest · 5s pull up · 5s rest',
        perSide: true,
        restSec: 60,
        restAfterSides: true,
      },
    ],
  },
]

export const FLEX_ROUTINES: Record<FlexRoutineKey, FlexRoutine> = {
  side_split: {
    key: 'side_split',
    label: 'side split',
    blocks: DEFAULT_FLEX_ROUTINE,
    coldShots: ['cold-split', 'cold-tailors'],
    warmShots: ['warm-tailors', 'warm-split'],
  },
  head_to_toe: {
    key: 'head_to_toe',
    label: 'head to toe',
    blocks: HEAD_TO_TOE_BLOCKS,
    // Both pike exercises warm the fold and the lift, so the three warm shots
    // share one screen at the end of the routine.
    coldShots: ['cold-toe-touch', 'cold-leg-lift-left', 'cold-leg-lift-right'],
    warmShots: ['warm-toe-touch', 'warm-leg-lift-left', 'warm-leg-lift-right'],
  },
}

/** Both routines, in the order Today offers them. */
export const FLEX_ROUTINE_KEYS: FlexRoutineKey[] = ['side_split', 'head_to_toe']

/** The routine a stored key names, falling back to the side split. */
export const flexRoutineOf = (key: FlexRoutineKey | undefined): FlexRoutine =>
  FLEX_ROUTINES[key ?? 'side_split'] ?? FLEX_ROUTINES.side_split
