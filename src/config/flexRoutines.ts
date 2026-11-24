import { DEFAULT_FLEX_ROUTINE, type FlexBlock } from './flexPlan'
import { HIP_THRUST, RKC_PLANK } from './plan'
import type { PhotoKind } from '../lib/photoSteps'

/**
 * The stretch routines, and everything that distinguishes one from another.
 *
 * Each is one of the flexibility skills a profile can choose to train (see
 * lib/flexSkills) — the six core skills of the Mobility & Flexibility Toolkit
 * (matthewismith.com) much of this is built on. Today offers the ones chosen and
 * borders the one that's up next (see lib/dailyRoutine). One place knows what a
 * routine *is* — its blocks, its name, and the photos it offers — so adding one
 * doesn't mean teaching the session flow, the photo gates and the plan editor
 * about it separately.
 *
 * The side split and head to toe were the owner's, and with the pelvic tilt
 * corrective are the only ones with measured photos. The other four are starter
 * routines with no shots: plain, editable in Settings and by the coach, and no
 * attempt at the toolkit's own programming.
 *
 * The pelvic tilt corrective isn't one of the six skills. It's posture work done
 * most days (`weeklyDays`), so it stands outside the turns the others take.
 */
export type FlexRoutineKey =
  | 'side_split'
  | 'head_to_toe'
  | 'front_split'
  | 'pancake'
  | 'bridge'
  | 'shoulders'
  | 'pelvic_tilt'

export type FlexRoutine = {
  key: FlexRoutineKey
  label: string
  blocks: FlexBlock[]
  /** Shots offered on the cold screen at the top of the session. */
  coldShots: PhotoKind[]
  /** Shots offered on the warm screen after the last stretch set. */
  warmShots: PhotoKind[]
  /** Its shots are taken back to back off one timer, and measured after. */
  burstShots?: boolean
  /**
   * A corrective done most days rather than a skill trained in turn: the days a
   * week it's owed. It stands outside the rotation the other routines take
   * turns in (see lib/dailyRoutine), and is what Today marks as up next until
   * the day's is done.
   */
  weeklyDays?: number
  /**
   * The first day those days were owed. The week's stretch goal is held to them
   * from the week this falls in (see weeklyStreak.weeklyGoalsFor), and no week
   * before it is re-scored.
   */
  weeklyDaysFrom?: string
}

/**
 * The head-to-toe routine: feet, nerve floss, pike, calves. Every exercise runs
 * one side at a time (`perSide`), and each is its own block — nothing here is a
 * superset, and the block labels are what the session header and the checklist
 * show.
 *
 * The order is the measured work first and the calves last, which is a reversal
 * of the distal-to-proximal one it shipped with. Nothing in the routine warms up
 * before the calves did their six cold ninety-second holds, and the two readings
 * the routine actually moves — the toe touch and the leg lifts — were taken after
 * that rather than off the pike work that earns them. The floss makes a better
 * opener anyway: it's a nerve glide rather than a stretch, so it's gentle enough
 * to go first and it takes neural tension out of the chain the pike is about to
 * work. The calves close it out warm, where a long passive hold belongs.
 *
 * The tempo strings are chosen so lib/tempo and lib/rhythmMotion read them
 * correctly with no changes: the floss has a dedicated forward/back guide, `press down`
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
    label: 'nerve floss',
    exercises: [
      {
        key: 'sciatic_floss',
        name: 'sciatic nerve floss',
        // Two sets, not three. Flossing glides the nerve rather than lengthening
        // tissue, and the dose that helps is a small one — past it the nerve gets
        // irritated instead of freer, which is the opposite of what the pike work
        // after it needs.
        sets: '2',
        maxSets: 2,
        reps: 8,
        tempo: '3s forward · 3s back',
        perSide: true,
        // Thirty seconds, not sixty: eight gentle glides leave nothing to recover
        // from, and the rest was costing more than the set did.
        restSec: 30,
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
        // Forty-five: three reps of press-and-release isn't a set you need a full
        // minute back from, and the pike lift behind it is where the rest matters.
        restSec: 45,
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
        // The one rest in the routine left at a full minute. This is the hardest
        // thing here and the one that moves the leg-lift reading, so it's the last
        // place to buy time back.
        restSec: 60,
        restAfterSides: true,
      },
    ],
  },
  {
    label: 'calves',
    // Alternate feet at each angle: three 30-second holds per foot.
    exercises: [
      {
        key: 'calf_stretch',
        name: 'calf stretch',
        sets: '3',
        maxSets: 3,
        reps: 1,
        tempo: '',
        holdSec: 30,
        perSide: true,
        restSec: 0,
        setLabels: ['foot straight', 'foot in', 'foot out'],
      },
    ],
  },
]

/**
 * Front split: open the hip flexor of the back leg, lengthen the hamstring of the
 * front one, then put the two together. Every set is one side at a time, and a
 * leg change is a kneel and re-set, so it gets the ten seconds the floss does.
 */
const FRONT_SPLIT_BLOCKS: FlexBlock[] = [
  {
    label: 'hip flexors',
    exercises: [
      {
        key: 'couch_stretch',
        name: 'couch stretch',
        sets: '2',
        maxSets: 2,
        reps: 1,
        tempo: '',
        holdSec: 60,
        perSide: true,
        restSec: 30,
        restAfterSides: true,
        sideSwitchSec: 10,
      },
    ],
  },
  {
    label: 'hamstrings',
    exercises: [
      {
        key: 'half_split',
        name: 'half split',
        sets: '2',
        maxSets: 2,
        reps: 5,
        tempo: '5s pushing down · 5s passive hang',
        perSide: true,
        restSec: 45,
        restAfterSides: true,
        sideSwitchSec: 10,
      },
    ],
  },
  {
    label: 'split',
    exercises: [
      {
        key: 'front_split_hold',
        name: 'front split hold',
        sets: '2',
        maxSets: 2,
        reps: 1,
        tempo: '',
        holdSec: 60,
        perSide: true,
        restSec: 45,
        restAfterSides: true,
        sideSwitchSec: 10,
      },
    ],
  },
]

/**
 * Pancake: the adductors first, then the hip-flexor strength that holds a folded
 * straddle, then the fold itself. The horse squat and the pancake hang share
 * their keys with the side split's, so their history is one history.
 */
const PANCAKE_BLOCKS: FlexBlock[] = [
  {
    label: 'adductors',
    exercises: [
      {
        key: 'horse_squat',
        name: 'horse squat',
        sets: '3',
        maxSets: 3,
        reps: 8,
        tempo: '2s down · 3s hold at bottom · 1s up',
        restSec: 60,
      },
    ],
  },
  {
    label: 'compression',
    exercises: [
      {
        key: 'straddle_leg_lift',
        name: 'straddle leg lifts',
        sets: '3',
        maxSets: 3,
        reps: 8,
        tempo: '2s lift · 2s lower',
        restSec: 45,
      },
    ],
  },
  {
    label: 'pancake',
    exercises: [
      {
        key: 'pancake_hang',
        name: 'pancake hang',
        sets: '3',
        maxSets: 3,
        reps: 6,
        tempo: '5s pushing down · 5s passive hang',
        restSec: 60,
      },
    ],
  },
]

/**
 * Bridge: the two places a bridge is short of — the front of the hips and the
 * overhead reach of the shoulders — and then the bridge, held.
 */
const BRIDGE_BLOCKS: FlexBlock[] = [
  {
    label: 'hip flexors',
    exercises: [
      {
        key: 'kneeling_lunge',
        name: 'kneeling lunge',
        sets: '2',
        maxSets: 2,
        reps: 1,
        tempo: '',
        holdSec: 45,
        perSide: true,
        restSec: 30,
        restAfterSides: true,
      },
    ],
  },
  {
    label: 'shoulders',
    exercises: [
      {
        key: 'puppy_pose',
        name: 'puppy pose',
        sets: '3',
        maxSets: 3,
        reps: 1,
        tempo: '',
        holdSec: 45,
        restSec: 30,
      },
    ],
  },
  {
    label: 'bridge',
    exercises: [
      {
        key: 'bridge_hold',
        name: 'bridge hold',
        sets: '3',
        maxSets: 3,
        reps: 1,
        tempo: '',
        holdSec: 20,
        restSec: 60,
      },
    ],
  },
]

/**
 * Shoulders: a loaded pass-through to warm the whole range, then a long hold
 * overhead and a long hold behind. The puppy pose is the bridge's, key and all.
 */
const SHOULDER_BLOCKS: FlexBlock[] = [
  {
    label: 'pass-throughs',
    exercises: [
      {
        key: 'shoulder_dislocate',
        name: 'stick pass-through',
        sets: '2',
        maxSets: 2,
        reps: 10,
        tempo: '2s over · 2s back',
        restSec: 30,
      },
    ],
  },
  {
    label: 'overhead',
    exercises: [
      {
        key: 'puppy_pose',
        name: 'puppy pose',
        sets: '3',
        maxSets: 3,
        reps: 1,
        tempo: '',
        holdSec: 45,
        restSec: 30,
      },
    ],
  },
  {
    label: 'behind the back',
    exercises: [
      {
        key: 'shoulder_extension',
        name: 'shoulder extension',
        sets: '3',
        maxSets: 3,
        reps: 1,
        tempo: '',
        holdSec: 30,
        restSec: 30,
      },
    ],
  },
]

/**
 * The anterior pelvic tilt corrective (Built With Science's daily routine): find
 * the posterior tilt lying down, find it again standing, load it with the glutes
 * and the abs, then lengthen the two hip flexors that pull the pelvis forward.
 *
 * The order is theirs and it's the right one: the tilts teach the position, the
 * thrust and the plank are both cued off it ("tuck, then squeeze"), and the
 * stretches go last, warm. Both stretches are held with the same tuck — without
 * it a lunge stretch arches the low back instead of opening the hip.
 *
 * The plank is prescribed as a max hold, and it is one (`openHold`): the clock
 * counts up until a tap ends it, the time is logged, and the time to beat is a
 * little past the last one (see lib/holdChallenge). Thirty seconds is only where
 * the first one starts from.
 *
 * The thrust is the one set that's typed in rather than paced (`load`): ten or
 * more reps, with whatever weight is to hand or none.
 */
const PELVIC_TILT_BLOCKS: FlexBlock[] = [
  {
    label: 'pelvic tilts',
    exercises: [
      {
        key: 'lying_pelvic_tilt',
        name: 'lying pelvic tilt',
        sets: '1',
        maxSets: 1,
        reps: 10,
        tempo: '2s press down · 2s hold · 2s rest',
        restSec: 0,
      },
      {
        key: 'standing_pelvic_tilt',
        name: 'standing pelvic tilt',
        sets: '1',
        maxSets: 1,
        reps: 10,
        tempo: '2s press down · 2s hold · 2s rest',
        restSec: 0,
      },
    ],
  },
  {
    label: 'glutes',
    exercises: [
      {
        key: HIP_THRUST.key,
        name: HIP_THRUST.name,
        sets: String(HIP_THRUST.sets),
        maxSets: HIP_THRUST.sets,
        reps: HIP_THRUST.repMin,
        tempo: '',
        restSec: HIP_THRUST.restSec,
        load: { repMin: HIP_THRUST.repMin, repMax: HIP_THRUST.repMax, increment: HIP_THRUST.increment ?? 5 },
      },
    ],
  },
  {
    label: 'abs',
    exercises: [
      {
        key: RKC_PLANK.key,
        name: RKC_PLANK.name,
        sets: String(RKC_PLANK.sets),
        maxSets: RKC_PLANK.sets,
        reps: 1,
        tempo: '',
        holdSec: RKC_PLANK.repMin,
        openHold: true,
        restSec: RKC_PLANK.restSec,
      },
    ],
  },
  {
    label: 'hip flexors',
    exercises: [
      {
        key: 'lunge_stretch',
        name: 'lunge stretch',
        sets: '2',
        maxSets: 2,
        reps: 1,
        tempo: '',
        holdSec: 30,
        perSide: true,
        restSec: 0,
        // A kneel and a re-set, like the front split's leg changes.
        sideSwitchSec: 10,
      },
      {
        key: 'rectus_femoris_stretch',
        name: 'rectus femoris stretch',
        // One long hold a side, not the two short ones as posted: it is the time
        // under stretch that counts, and getting the foot up behind you twice
        // is the slow part.
        sets: '1',
        maxSets: 1,
        reps: 1,
        tempo: '',
        holdSec: 60,
        perSide: true,
        restSec: 0,
        sideSwitchSec: 10,
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
    // The three are poses on one mat, so they're shot from one propped phone
    // without getting up between them.
    burstShots: true,
  },
  front_split: {
    key: 'front_split',
    label: 'front split',
    blocks: FRONT_SPLIT_BLOCKS,
    coldShots: [],
    warmShots: [],
  },
  pancake: {
    key: 'pancake',
    label: 'pancake',
    blocks: PANCAKE_BLOCKS,
    coldShots: [],
    warmShots: [],
  },
  bridge: {
    key: 'bridge',
    label: 'bridge',
    blocks: BRIDGE_BLOCKS,
    coldShots: [],
    warmShots: [],
  },
  shoulders: {
    key: 'shoulders',
    label: 'shoulders',
    blocks: SHOULDER_BLOCKS,
    coldShots: [],
    warmShots: [],
  },
  pelvic_tilt: {
    key: 'pelvic_tilt',
    label: 'pelvic tilt',
    blocks: PELVIC_TILT_BLOCKS,
    // One standing side-on photo before anything has been tucked or stretched:
    // posture is what you stand in unprompted, so there is no warm one.
    coldShots: ['pelvic-tilt'],
    warmShots: [],
    weeklyDays: 6,
    weeklyDaysFrom: '2026-11-23',
  },
}

/**
 * Every routine, in the order Today and the skill pickers offer them. The owner's
 * two stay first: Today pairs and rotates the first two of whatever is chosen.
 */
export const FLEX_ROUTINE_KEYS: FlexRoutineKey[] = [
  'side_split',
  'head_to_toe',
  'front_split',
  'pancake',
  'bridge',
  'shoulders',
  'pelvic_tilt',
]

/** The routine a stored key names, falling back to the side split. */
export const flexRoutineOf = (key: FlexRoutineKey | undefined): FlexRoutine =>
  FLEX_ROUTINES[key ?? 'side_split'] ?? FLEX_ROUTINES.side_split

/** Every routine's shipped blocks, keyed by routine. */
export const defaultFlexPlans = (): Record<FlexRoutineKey, FlexBlock[]> =>
  Object.fromEntries(FLEX_ROUTINE_KEYS.map((k) => [k, FLEX_ROUTINES[k].blocks])) as Record<FlexRoutineKey, FlexBlock[]>
