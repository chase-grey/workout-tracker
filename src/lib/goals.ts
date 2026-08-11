/**
 * The goal set, in one place.
 *
 * Both the Goals panel and the post-workout pace note need to know what the
 * goals are, what series each one tracks and what it's aiming at. Deriving them
 * here keeps the two in agreement — otherwise a pace note about "squat my
 * bodyweight" could disagree with what the panel shows for that goal.
 *
 * Pure module — no React/DOM.
 */

import type { BodyWeightEntry, WorkoutRow } from '../types'
import { exerciseSeries, sustainedRepsSeries, type Point } from './progress'
import { bodyFatSeries, personalSixPackTarget, type MeasurementEntry } from './bodyComp'
import { tailorsAvgSeries, warmSplitSeries, type FlexEntry } from './flex'
import { SPLIT_GOALS, TAILORS_GOALS } from './flexPredict'
import { project, type Projection, type TrendWindow } from './predictions'
import { parseISODate, toISODate, weekStartISO } from './dates'
import { leadVariantForKey, otherVariant } from './pushVariant'

/**
 * Weekly decay of the gain rate strength projections assume (see
 * predictions.weeksToClose). Strength gains taper — a straight-line projection
 * off a few promising early sessions arrives too soon and draws a line too steep
 * to hold — so their ETAs and locked lines bend, easing ~7% off the pace each
 * week. Flexibility tapers harder still (see FLEX_GAIN_DECAY); body-composition
 * goals keep a straight line (no decay).
 */
export const STRENGTH_GAIN_DECAY = 0.93

/**
 * Weekly decay of the gain rate the flexibility ladders project with.
 *
 * Range of motion tapers harder than strength does. The first weeks of honest
 * stretching buy degrees cheaply — much of that early range is the nervous system
 * agreeing to relax into a position the hips could already reach — and once
 * that's spent, the rest comes out of tissue that changes on a scale of months.
 * A fortnight of the cheap range fits several degrees a week, and drawn straight
 * that line puts a full 180° split inside the year.
 *
 * Easing 10% off the pace each week, against strength's 7%, holds the taper's
 * own contribution to eight times the weekly figure, spent over about fifteen
 * weeks; past that the pace sits on its floor (see predictions.PACE_FLOOR) and
 * the rest of the ladder is bought a fifth of a good week at a time. A good
 * fortnight still pulls the next milestone closer, and the far rungs say what
 * they should: reachable, but years of it at this pace.
 */
export const FLEX_GAIN_DECAY = 0.9

/**
 * How much history the flexibility ladders read their pace from.
 *
 * The default fortnight (see predictions.TREND_WINDOW) is right for a metric that
 * moves every session and wrong for range of motion, which is measured warm, a
 * couple of times a week, and swings a few degrees on the warm-up alone. Two weeks
 * of that is three or four readings whose spread is mostly how long the hips had
 * to settle, so the fitted pace lurches between "several degrees a week" and
 * "nothing" depending on which fortnight you catch — and the taper it feeds then
 * scales the whole ladder by that noise.
 *
 * Six weeks is enough readings for the warm-up scatter to average out, and short
 * enough to still be the pace you're on rather than the pace you were on. It also
 * makes the pace the taper carries forward one a longer history actually supports
 * (see predictions.paceFloorFraction), which is the point: a projection read off a
 * sustained six-week pace is worth straightening out, where one read off a lucky
 * fortnight is not.
 */
export const FLEX_TREND_WINDOW: TrendWindow = {
  windowDays: 42,
  minPoints: 3,
  minSpanDays: 10,
}

/**
 * The fastest weekly bodyweight change the goals will project against, in lbs.
 *
 * Lean gain runs about half a pound to a pound a week, and a pound is what a very
 * good eating week looks like — anything past that is food weight and water, which
 * comes back off. But a two-week fit doesn't know the difference: one heavy
 * weekend reads as +3 lbs/week and the ETA it draws is a fantasy. Holding the
 * projected pace to a pound (see predictions.capSlope) keeps the direction the
 * weigh-ins actually show while refusing to promise a date only water could hit.
 */
export const BODYWEIGHT_GAIN_CAP = 1

/**
 * The fastest weekly 1RM gain the lift goals will project against, in lbs.
 *
 * The taper alone doesn't make a lift projection honest, because everything it
 * hands out is scaled by whatever the last fortnight fit. And a fortnight of
 * estimated 1RMs doesn't move smoothly: the readings come off top sets through
 * Epley, so one extra rep on one set reads as +6 lbs/week and licenses a
 * projection nearly ninety pounds long. Bending that line doesn't make it true.
 *
 * So the pace is held to what a good month of actual training adds, spread over
 * its weeks (see predictions.capSlope), and the taper works on a figure the
 * sessions can support. Squat takes more than bench because it always has: more
 * muscle over a longer range, off a base that's further from its ceiling. With
 * the decay on top, the caps buy about 57 lbs of squat and 34 of bench over the
 * taper's first five months, and a pound a week (squat) or a little over half
 * of one (bench) for as long as the training keeps up after that.
 */
export const SQUAT_GAIN_CAP = 5
export const BENCH_GAIN_CAP = 3

/** The exercise the pull-up ladder is measured on. */
export const PULLUP_KEY = 'weighted_pullups'

/** Sets every rung of the pull-up ladder asks for. */
export const PULLUP_GOAL_SETS = 4

/**
 * The pull-up ladder's rungs, in reps per set, ascending — so the nearer
 * milestone is listed (and reached) before the harder one, the way the squat
 * multiples and the flexibility ladders are.
 */
export const PULLUP_GOAL_REPS = [5, 10, 15, 20] as const

/**
 * The fastest weekly gain the pull-up ladder projects against, in reps.
 *
 * A rung is measured on the reps the fourth set still had in it, and that number
 * moves in whole reps on a lift trained twice a week — so two sessions that go
 * 6 then 9 fit +3 reps/week, and a straight line off that puts 4×20 inside two
 * months. Adding a rep to every one of four sets in a week is what a very good
 * week looks like; holding the projected pace there (see predictions.capSlope)
 * keeps the direction those sessions show without promising a ladder that only
 * a hot fortnight could climb.
 */
export const PULLUP_GAIN_CAP = 1

/** Stable ids, used as the keys locked projections are stored under. */
export const GOAL_IDS = {
  weight180: 'bodyweight_180',
  weight190: 'bodyweight_190',
  benchBodyweight: 'bench_bodyweight',
  squatBodyweight: 'squat_bodyweight',
  squatOneAndAHalf: 'squat_1_5x_bodyweight',
  sixPack: 'six_pack',
} as const

export type GoalSpec = {
  id: string
  title: string
  unit: string
  /**
   * The exercise whose logging moves this goal, if any. Body-composition goals
   * have none — nothing you do in a session changes them on the spot.
   */
  exerciseKey: string | null
  /**
   * What an exercise-driven goal's series counts, for the caller that has to
   * know which language it's in: the in-session cue turns the e1RM its locked
   * line calls for into a weight for the reps you're about to do (see
   * goalCue), which is nonsense for a goal counted in reps. Omitted means
   * estimated 1RM — every lift goal but the pull-up ladder.
   */
  measure?: 'e1rm' | 'reps'
  /** The series the goal is measured on, oldest → newest. */
  points: Point[]
  target: number
  /**
   * Which way the metric has to move to reach the target. Declared rather than
   * inferred, so "reached" is decided correctly for a goal that climbs (squat) and
   * one that falls (body fat) alike.
   */
  direction: 'up' | 'down'
  /** True when the target itself moves with bodyweight (bench/squat multiples). */
  movingTarget?: boolean
  /**
   * A milestone that stays earned: "reached" is judged on the best reading ever
   * taken, not the latest (see {@link isReached}). Set on the flexibility goals —
   * a 111° split doesn't stop having happened because the next session came in
   * tight — where a strength or bodyweight goal is only reached while you're
   * actually there.
   */
  milestone?: boolean
  /**
   * Weekly decay of the gain rate for this goal's projection (see
   * STRENGTH_GAIN_DECAY, FLEX_GAIN_DECAY). Omitted for goals that project as a
   * straight line.
   */
  decayPerWeek?: number
  /**
   * Fastest weekly change this goal's ETA may be projected from, in the goal's
   * unit (see BODYWEIGHT_GAIN_CAP, SQUAT_GAIN_CAP). Omitted for goals read off a
   * measurement with no weekly ceiling worth naming.
   */
  capPerWeek?: number
  /**
   * How much history this goal's pace is read from (see FLEX_TREND_WINDOW).
   * Omitted for goals that use the default window (predictions.TREND_WINDOW).
   */
  window?: TrendWindow
  /**
   * Spend the taper against how long this goal's series has been logged rather
   * than against week zero (see predictions.paceFloorFraction). Set where the
   * series is a continuous record of training the capability, so its span is a
   * fair read on training age — the flexibility ladders, where every rung shares
   * one series that starts the day the stretching did.
   *
   * Left off where the span isn't that: a 1RM series starts at whichever lift was
   * first logged, which says when the *logging* started, not when the lifting did.
   */
  taperFromHistory?: boolean
}

/**
 * Weeks from a series' first reading to its last — the training age the taper is
 * spent against when the goal asks for it (see GoalSpec.taperFromHistory).
 *
 * The first logged reading is a floor on how long the capability has been trained,
 * not a measure of it: someone who stretched for a year before logging a split
 * reads as new and gets a fuller taper than they've earned. Erring that way is
 * deliberate — it makes the projection conservative for the one case it can't see,
 * rather than optimistic.
 */
function trainingAgeWeeks(points: Point[]): number {
  if (points.length < 2) return 0
  const dates = points.map((p) => p.date).sort((a, b) => a.localeCompare(b))
  const first = parseISODate(dates[0]).getTime()
  const last = parseISODate(dates[dates.length - 1]).getTime()
  return Math.max(0, (last - first) / (7 * 86_400_000))
}

/**
 * Whether the goal's target has been met. A milestone is judged on the best
 * reading ever taken and stays reached once hit (see GoalSpec.milestone); every
 * other goal is judged on the latest value, so a bodyweight that touched 180 and
 * slid back isn't at 180 now.
 */
export function isReached(goal: GoalSpec): boolean {
  if (goal.points.length === 0) return false
  const values = goal.points.map((p) => p.value)
  const measured = goal.milestone
    ? goal.direction === 'up'
      ? Math.max(...values)
      : Math.min(...values)
    : values[values.length - 1]
  return goal.direction === 'up' ? measured >= goal.target : measured <= goal.target
}

/**
 * The date the goal's target was first met, or null if no reading ever met it.
 * The first crossing rather than the latest one: that's the day it happened, and
 * it's the day a commitment should be judged against. A non-milestone goal that
 * fell back off the target and climbed to it again therefore still reports the
 * original date — the achievement keeps the date it was earned on.
 */
export function reachedDate(goal: GoalSpec): string | null {
  return reachedPoint(goal)?.date ?? null
}

function reachedPoint(goal: GoalSpec): Point | undefined {
  return goal.points.find((p) => (goal.direction === 'up' ? p.value >= goal.target : p.value <= goal.target))
}

/** A goal that landed, and the day it landed on. */
export type GoalHit = { goal: GoalSpec; date: string }

/**
 * The day a non-milestone goal became reached and has been reached ever since —
 * the first reading of the unbroken run of at-target readings that ends at the
 * latest one, or null when the latest reading isn't at target.
 *
 * Not the same question {@link reachedDate} answers. That one reports the day the
 * target was *first* met and keeps reporting it, which is what a goal's own row
 * wants: the achievement keeps the date it was earned on. But a goal that is only
 * reached while you're actually there can be earned more than once — a bodyweight
 * that crossed 180 in January, spent February under it and crossed back this week
 * is at 180 now, and it got there this week. Dating that by January would hide it
 * from the week it happened in, which is the one week it's news.
 *
 * Reading the run backwards from the newest point is what makes it stop being news
 * afterwards: a goal crossed in January and held since has a run that starts in
 * January, so it's listed once, in January's week, and not again for as long as
 * it holds.
 */
function heldSinceDate(goal: GoalSpec): string | null {
  const meets = (p: Point) => (goal.direction === 'up' ? p.value >= goal.target : p.value <= goal.target)
  let start: string | null = null
  for (let i = goal.points.length - 1; i >= 0 && meets(goal.points[i]); i--) start = goal.points[i].date
  return start
}

/**
 * The goals whose target was met inside the Mon–Sun week containing `today`,
 * earliest first — the week's finished goals, for the Today tab to show next to
 * the week's PRs.
 *
 * A goal counts only while it's still reached (see {@link isReached}). A
 * bodyweight goal that was touched on Tuesday and slid back off by Friday is one
 * the Goals panel shows as still open, and a Today tab cheering it in the same
 * week would be contradicting the panel rather than reporting the week. The
 * milestone goals — the ladders — stay earned by their own rule, so they stay
 * listed for the rest of the week however the next session read.
 *
 * Which day a goal landed on follows the same split. A milestone is earned once
 * and keeps that date ({@link reachedDate}); every other goal is dated by the day
 * the run it's currently on began ({@link heldSinceDate}), so a target crossed,
 * lost and crossed again is reported in the week it was won back rather than
 * being silently credited to the first time.
 *
 * The six-pack goal is left out: it's called by eye rather than read off the
 * body-fat estimate (see the Goals panel's SixPackRow), so the day a tape
 * measure's estimate happened to cross its target isn't a day anything was
 * achieved.
 */
export function goalsHitInWeek(goals: GoalSpec[], today: Date = new Date()): GoalHit[] {
  const week = weekStartISO(toISODate(today))
  const hits: GoalHit[] = []
  for (const goal of goals) {
    if (goal.id === GOAL_IDS.sixPack || !isReached(goal)) continue
    const date = goal.milestone ? reachedDate(goal) : heldSinceDate(goal)
    if (date && weekStartISO(date) === week) hits.push({ goal, date })
  }
  return hits.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * A goal's live projection, run through the model the goal itself declares.
 *
 * The model is three things the spec declares — the taper, the pace ceiling, and
 * which reading the gap is measured from — and a caller that assembles them by
 * hand can quietly leave one out. So the assembly lives here, next to the spec
 * it's assembled from.
 *
 * A milestone measures its gap from the best reading in the recent window rather
 * than the last one (see predictions.bestOf). It's the same rule {@link isReached}
 * already applies: a milestone is earned at your best, so the distance to the next
 * one is owed from your best too. The ladders need it most — a warm split lands a
 * few degrees under its own best whenever the warm-up was short, and reading the
 * gap off that one session put the next rung further away than the log's own best
 * says it is, while the rung that same best had already cleared stayed cleared.
 * Strength and bodyweight goals keep the newest reading: you are not squatting 300
 * because you did once.
 *
 * A goal that declares {@link GoalSpec.taperFromHistory} spends its taper against
 * the age of its own series, so a long log projects close to the pace it's holding
 * instead of being charged a beginner's taper it has already worked through.
 */
export function projectGoal(goal: GoalSpec, today?: Date): Projection {
  return project(goal.points, goal.target, today, {
    window: goal.window,
    decayPerWeek: goal.decayPerWeek,
    capPerWeek: goal.capPerWeek,
    bestOf: goal.milestone ? (goal.direction === 'up' ? 'max' : 'min') : undefined,
    taperSpentWeeks: goal.taperFromHistory ? trainingAgeWeeks(goal.points) : 0,
  })
}

/**
 * The most recent session that trained a goal's lift but isn't on the goal's line,
 * and what it read — or null when the newest session is already plotted.
 *
 * A strength goal is measured on the slot that trains the lift freshest (see
 * progress.SlotScope): a press that follows the day's other press is necessarily
 * lighter, and plotting both drew a sawtooth that looked like backsliding every
 * other session. The cost is that a whole session disappears — flat bench on a
 * variant-A push day is logged, and then shows up nowhere on the bench goal, which
 * reads as the app having lost it. So the row names that session and says what it
 * lifted, while the projection still runs off the fresh-slot line alone.
 *
 * Only for the lifts the variants train differently, and only for goals measured on
 * estimated 1RM: a rep-counted ladder leaves sessions out for a different reason —
 * too few sets to judge the standard (see progress.sustainedRepsSeries) — which
 * this wouldn't be describing.
 */
export function offSlotLatest(goal: GoalSpec, workouts: WorkoutRow[]): Point | null {
  if (!goal.exerciseKey || goal.measure === 'reps') return null
  const lead = leadVariantForKey(goal.exerciseKey)
  if (!lead) return null

  // A session with no slot recorded — imported history, or a day that doesn't run
  // variants — is kept under either scope, so if one of those were the newest it
  // would be on the line already and fail the date test below.
  const off = exerciseSeries(workouts, goal.exerciseKey, '1rm', otherVariant(lead))
  const last = off.length ? off[off.length - 1] : null
  const plotted = goal.points.length ? goal.points[goal.points.length - 1].date : ''
  return last && last.date > plotted ? last : null
}

export type GoalInputs = {
  workouts: WorkoutRow[]
  bodyWeights: BodyWeightEntry[]
  measurements: MeasurementEntry[]
  heightIn: number
  /**
   * Stretch logs, feeding the flexibility goals. Optional: the goals are always
   * listed (empty when omitted), and the callers that don't display them — the
   * post-workout pace note, the in-session lift cue — filter to exercise-driven
   * goals anyway. Only the Goals panel needs to pass real entries.
   */
  flexEntries?: FlexEntry[]
}

/** Weigh-ins, minus implausible values (stray test rows) that would skew a fit. */
export function bodyWeightPoints(bodyWeights: BodyWeightEntry[]): Point[] {
  return bodyWeights.filter((b) => b.weightLbs >= 50).map((b) => ({ date: b.date, value: b.weightLbs }))
}

/**
 * Every goal, in the order they should be shown. Strength goals expressed as a
 * multiple of bodyweight come in ascending order, so the nearer milestone is
 * always listed (and reached) before the harder one — as does the pull-up
 * ladder after them. The flexibility ladders (side split, then tailor's pose)
 * come last, each ascending for the same reason.
 */
export function buildGoals({
  workouts,
  bodyWeights,
  measurements,
  heightIn,
  flexEntries = [],
}: GoalInputs): GoalSpec[] {
  const bwPoints = bodyWeightPoints(bodyWeights)
  const currentBw = bwPoints.length ? bwPoints[bwPoints.length - 1].value : 0

  const benchPoints = exerciseSeries(workouts, 'flat_bench', '1rm')
  const squatPoints = exerciseSeries(workouts, 'barbell_squat', '1rm')
  const bfPoints = bodyFatSeries(measurements, heightIn)
  const { target: bfTarget } = personalSixPackTarget(measurements, heightIn)

  // The flexibility ladders run on the same series their projections and
  // celebrations do: the warm side split, and the average of the warm tailor's
  // left/right. Each milestone angle becomes its own goal.
  const splitPoints = warmSplitSeries(flexEntries)
  const tailorsPoints = tailorsAvgSeries(flexEntries)
  const splitGoals: GoalSpec[] = SPLIT_GOALS.map((deg): GoalSpec => ({
    id: `split_${deg}`,
    title: `${deg}° split`,
    unit: '°',
    exerciseKey: null,
    points: splitPoints,
    target: deg,
    direction: 'up',
    milestone: true,
    decayPerWeek: FLEX_GAIN_DECAY,
    window: FLEX_TREND_WINDOW,
    taperFromHistory: true,
  }))
  const tailorsGoals: GoalSpec[] = TAILORS_GOALS.map((deg): GoalSpec => ({
    id: `tailors_${deg}`,
    title: `${deg}° tailor's pose`,
    unit: '°',
    exerciseKey: null,
    points: tailorsPoints,
    target: deg,
    direction: 'up',
    milestone: true,
    decayPerWeek: FLEX_GAIN_DECAY,
    window: FLEX_TREND_WINDOW,
    taperFromHistory: true,
  }))

  // The pull-up ladder. Each rung is four sets at a rep count, measured on the
  // reps the fourth set of a session still had in it — so a rung is cleared only
  // when every one of the four sets made the number, which is what "4 sets of
  // 10" means. Milestones, like the flexibility rungs: a day that hit 4×10
  // doesn't stop having happened because the next session came in tired.
  //
  // Any pull-up set counts, added weight or not. A rung done with a belt on is
  // the harder version of the same thing, and refusing it would mean the ladder
  // stalled on the days the plan calls for weight.
  const pullupPoints = sustainedRepsSeries(workouts, PULLUP_KEY, PULLUP_GOAL_SETS)
  const pullupGoals: GoalSpec[] = PULLUP_GOAL_REPS.map((reps): GoalSpec => ({
    id: `pullups_${PULLUP_GOAL_SETS}x${reps}`,
    title: `${PULLUP_GOAL_SETS}×${reps} pull-ups`,
    unit: 'reps',
    exerciseKey: PULLUP_KEY,
    measure: 'reps',
    points: pullupPoints,
    target: reps,
    direction: 'up',
    milestone: true,
    decayPerWeek: STRENGTH_GAIN_DECAY,
    capPerWeek: PULLUP_GAIN_CAP,
  }))

  // 999 stands in for "no bodyweight logged yet", so a moving target can't be 0
  // and read as already reached.
  const bwTarget = (mult: number) => (currentBw > 0 ? Math.round(currentBw * mult * 10) / 10 : 999)

  return [
    {
      id: GOAL_IDS.weight180,
      title: 'bodyweight → 180',
      unit: 'lbs',
      exerciseKey: null,
      points: bwPoints,
      target: 180,
      direction: 'up',
      capPerWeek: BODYWEIGHT_GAIN_CAP,
    },
    {
      id: GOAL_IDS.weight190,
      title: 'bodyweight → 190',
      unit: 'lbs',
      exerciseKey: null,
      points: bwPoints,
      target: 190,
      direction: 'up',
      capPerWeek: BODYWEIGHT_GAIN_CAP,
    },
    {
      id: GOAL_IDS.benchBodyweight,
      title: `bench my bodyweight (${currentBw || '—'} lbs)`,
      unit: 'lbs',
      exerciseKey: 'flat_bench',
      points: benchPoints,
      target: bwTarget(1),
      direction: 'up',
      movingTarget: true,
      decayPerWeek: STRENGTH_GAIN_DECAY,
      capPerWeek: BENCH_GAIN_CAP,
    },
    {
      id: GOAL_IDS.squatBodyweight,
      title: 'squat my bodyweight',
      unit: 'lbs',
      exerciseKey: 'barbell_squat',
      points: squatPoints,
      target: bwTarget(1),
      direction: 'up',
      movingTarget: true,
      decayPerWeek: STRENGTH_GAIN_DECAY,
      capPerWeek: SQUAT_GAIN_CAP,
    },
    {
      id: GOAL_IDS.squatOneAndAHalf,
      title: 'squat 1.5× bodyweight',
      unit: 'lbs',
      exerciseKey: 'barbell_squat',
      points: squatPoints,
      target: bwTarget(1.5),
      direction: 'up',
      movingTarget: true,
      decayPerWeek: STRENGTH_GAIN_DECAY,
      capPerWeek: SQUAT_GAIN_CAP,
    },
    ...pullupGoals,
    {
      id: GOAL_IDS.sixPack,
      title: 'visible 6-pack abs',
      unit: '% bf',
      exerciseKey: null,
      points: bfPoints,
      target: bfTarget,
      direction: 'down',
    },
    ...splitGoals,
    ...tailorsGoals,
  ]
}
