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
import {
  bestSingleSeries,
  combinedBest1RMSeries,
  sustainedRepsSeries,
  type Point,
} from './progress'
import { LEG_PRESS_TO_SQUAT } from './liftRatios'
import { isMaxAttempt } from './maxAttempt'
import { bodyFatSeries, personalSixPackTarget, type MeasurementEntry } from './bodyComp'
import { tailorsAvgSeries, warmSplitSeries, type FlexEntry } from './flex'
import { SPLIT_GOALS, TAILORS_GOALS } from './flexPredict'
import { project, type Projection, type TrendWindow } from './predictions'
import { parseISODate, toISODate, weekStartISO } from './dates'

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

/**
 * The lift the bench goal is named for and cued on, and the other press its
 * reading also counts.
 *
 * Flat bench is what "bench my bodyweight" means, but reading flat alone means
 * reading it only on the days it goes first: the plan alternates which press leads
 * (see pushVariant), and a lead-slot series drops the sessions where flat followed
 * incline — so a push day could be logged in full and still leave the goal sitting
 * on a fortnight-old number. Counting the best set of either press gives every
 * push day a reading, and can only ever give a conservative one: incline is the
 * harder press, so an incline e1RM is a floor on the flat bench it implies.
 *
 * The cue stays on flat bench alone (see goalCue): what it hands back is a weight
 * to load, and the line's weight is a flat-bench weight.
 */
export const BENCH_KEY = 'flat_bench'
export const BENCH_ALSO_KEYS = ['incline_bench']

/**
 * The lift the squat goals are trained and cued on, and the retired lift they're
 * still named for.
 *
 * "Squat my bodyweight" is a squat goal trained on a leg press, because a leg press
 * is what the gym has: the plan swapped the barbell squat out (see PLAN_REVISION
 * 7). Dropping the goals along with the rack would have thrown away the thing being
 * chased, so instead the press's readings are converted into the squat they imply
 * (see {@link SQUAT_SCALE}) and the goals go on being counted in squat pounds.
 *
 * The barbell squat still counts at face value, so the history from when there was
 * a rack stays in the series — and a squat done wherever one turns up lands there
 * too, at full weight rather than through a conversion.
 */
export const LEG_PRESS_KEY = 'leg_press'
export const BARBELL_SQUAT_KEY = 'barbell_squat'
export const SQUAT_ALSO_KEYS = [BARBELL_SQUAT_KEY]

/**
 * What each of the squat goals' lifts is worth in squat pounds — the language
 * their target (a multiple of bodyweight, squatted) is written in. See
 * liftRatios.LEG_PRESS_TO_SQUAT for why the press converts at less than half.
 */
export const SQUAT_SCALE: Record<string, number> = {
  [LEG_PRESS_KEY]: LEG_PRESS_TO_SQUAT,
  [BARBELL_SQUAT_KEY]: 1,
}

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
   * Other lifts whose sessions feed this goal's series, beyond `exerciseKey` — the
   * bench goal counts both presses (see {@link BENCH_ALSO_KEYS}). `exerciseKey`
   * stays the one the goal is named for and cued on, so a caller that needs a
   * single lift still has one.
   */
  alsoCounts?: string[]
  /**
   * What each counted lift is worth in the goal's own unit, when they don't all
   * read in it directly — the squat goals count a leg press at a fraction of its
   * weight (see {@link SQUAT_SCALE}). A lift the map doesn't mention counts as
   * itself. The in-session cue reads it backwards, to turn the weight the line
   * asks for into a weight to actually load (see goalCue).
   */
  scaleByKey?: Record<string, number>
  /**
   * Every real single logged on the counted lifts, in the goal's unit — set on the
   * goals that a single is what settles (see {@link isReached}).
   *
   * An estimated 1RM says a lift is *in* you, off a set of six or eight and a
   * formula. That's the right thing to track pace against and the wrong thing to
   * hand the goal over for: nobody has squatted their bodyweight because Epley
   * says they could. So a goal with this set has two states where it used to have
   * one — ready to try it once the estimate arrives (see
   * {@link isReadyToAttempt}), and reached once a single at the weight is in the
   * log.
   *
   * Left off the goals where the reading already is the achievement: bodyweight is
   * a weigh-in, a split is measured on the floor, and the pull-up ladder's rungs
   * are reps that were actually performed.
   */
  singles?: Point[]
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
 * The series a goal's target is settled on. For most goals that's the series
 * they're tracked by; for one a real single has to close, it's the singles (see
 * GoalSpec.singles) — the estimate is what says you're ready, not what says you
 * did it.
 */
function judgedPoints(goal: GoalSpec): Point[] {
  return goal.singles ?? goal.points
}

/** Whether a reading meets the target, whichever way the goal moves. */
function meetsTarget(goal: GoalSpec, value: number): boolean {
  return goal.direction === 'up' ? value >= goal.target : value <= goal.target
}

/**
 * Whether the goal is judged on the best reading it ever took rather than the
 * latest one — a milestone by declaration (see GoalSpec.milestone), and a goal
 * settled by a single because a single that was lifted stays lifted.
 *
 * A goal whose target itself moves can still come back open: a single at 175 was
 * bodyweight when it was lifted and isn't once bodyweight is 185, so "squat my
 * bodyweight" asks again. That's the target moving, not the lift being taken away.
 */
function staysEarned(goal: GoalSpec): boolean {
  return goal.milestone === true || goal.singles != null
}

/**
 * Whether the goal's target has been met. A goal that stays earned is judged on
 * the best reading ever taken (see {@link staysEarned}); every other goal is judged
 * on the latest value, so a bodyweight that touched 180 and slid back isn't at 180
 * now.
 */
export function isReached(goal: GoalSpec): boolean {
  const points = judgedPoints(goal)
  if (points.length === 0) return false
  const values = points.map((p) => p.value)
  const measured = staysEarned(goal)
    ? goal.direction === 'up'
      ? Math.max(...values)
      : Math.min(...values)
    : values[values.length - 1]
  return meetsTarget(goal, measured)
}

/**
 * Whether the goal is one attempt away: the readings say the target is in you, and
 * no single at that weight is in the log yet (see GoalSpec.singles).
 *
 * This is the state that replaced "reached" for the lift goals. It's deliberately
 * read off the same rule {@link isReached} used to apply to them — the latest
 * estimate meeting the target — so the day the app would once have called the goal
 * done is the day it now says go and earn it.
 */
export function isReadyToAttempt(goal: GoalSpec): boolean {
  if (goal.singles == null || goal.points.length === 0 || isReached(goal)) return false
  return meetsTarget(goal, goal.points[goal.points.length - 1].value)
}

/**
 * The weight to load on `key` for a single that would settle the goal, rounded up
 * to a whole 5 lbs — the plates or the pin, not the squat the goal is written in.
 * A lift the goal counts at a fraction of its weight therefore asks for more of it
 * than the target says (see GoalSpec.scaleByKey).
 *
 * Rounded up rather than to nearest, and up to something loadable rather than to
 * the pound: an attempt at what the goal asks for has to clear it, and no machine
 * or bar is set to 383.
 */
export function attemptWeight(goal: GoalSpec, key: string): number {
  const scale = goal.scaleByKey?.[key] ?? 1
  return Math.ceil(goal.target / scale / 5) * 5
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
  return judgedPoints(goal).find((p) => meetsTarget(goal, p.value))
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
  const points = judgedPoints(goal)
  let start: string | null = null
  for (let i = points.length - 1; i >= 0 && meetsTarget(goal, points[i].value); i--) start = points[i].date
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
 * Which day a goal landed on follows the same split. A goal that stays earned — a
 * milestone, or one a single settled — keeps the date it was earned on
 * ({@link reachedDate}); every other goal is dated by the day the run it's
 * currently on began ({@link heldSinceDate}), so a target crossed, lost and crossed
 * again is reported in the week it was won back rather than being silently credited
 * to the first time.
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
    const date = staysEarned(goal) ? reachedDate(goal) : heldSinceDate(goal)
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

  // The estimate series read off working sets only. A max attempt is a measurement
  // rather than an estimate, and it has its own series — left in this one, a missed
  // single would come through as the lift getting weaker, dropping a goal out of
  // "ready to try it" for having tried it.
  const working = workouts.filter((r) => !isMaxAttempt(r))

  const benchKeys = [BENCH_KEY, ...BENCH_ALSO_KEYS]
  const benchPoints = combinedBest1RMSeries(working, benchKeys)
  const benchSingles = bestSingleSeries(workouts, benchKeys)
  // The squat goals, in squat pounds, off whichever leg movement was trained —
  // the press converted, a barbell squat at face value (see SQUAT_SCALE).
  const squatKeys = [LEG_PRESS_KEY, ...SQUAT_ALSO_KEYS]
  const squatPoints = combinedBest1RMSeries(working, squatKeys, SQUAT_SCALE)
  const squatSingles = bestSingleSeries(workouts, squatKeys, SQUAT_SCALE)
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
      exerciseKey: BENCH_KEY,
      alsoCounts: BENCH_ALSO_KEYS,
      points: benchPoints,
      singles: benchSingles,
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
      exerciseKey: LEG_PRESS_KEY,
      alsoCounts: SQUAT_ALSO_KEYS,
      scaleByKey: SQUAT_SCALE,
      points: squatPoints,
      singles: squatSingles,
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
      exerciseKey: LEG_PRESS_KEY,
      alsoCounts: SQUAT_ALSO_KEYS,
      scaleByKey: SQUAT_SCALE,
      points: squatPoints,
      singles: squatSingles,
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
