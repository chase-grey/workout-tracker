/**
 * What a stretch session earned, angle-wise: a new best on a pose, and any
 * flexibility goal it just put in the bag.
 *
 * The angles are captured mid-session (see PhotoStep), but they're cheered at
 * the end — the finish screen is the moment you put the phone down, and it's the
 * one place a PR or a completed goal can't be missed. So detection compares
 * *today's* readings against every earlier day rather than diffing a before /
 * after snapshot the way `detectPRs` and `newRecords` do: by the time the
 * session ends, today's reading is already in the log.
 *
 * Each pose carries which way it improves (see lib/flexMetrics), because the toe
 * touch improves downward: a hardcoded max would have announced a PR for the
 * shallowest fold of the week.
 *
 * Pure module — no React/DOM — so it stays unit-testable.
 */

import type { Celebration } from './celebration'
import { toISODate } from './dates'
import {
  legLiftAvgSeries,
  tailorsAvgSeries,
  warmLegLiftLeftOf,
  warmLegLiftRightOf,
  warmSplitOf,
  warmSplitSeries,
  warmTailorsLeftOf,
  warmTailorsRightOf,
  warmToeTouchOf,
  warmToeTouchSeries,
  type FlexEntry,
} from './flex'
import { HIGHER_IS_BETTER, LOWER_IS_BETTER, type MetricDir } from './flexMetrics'
import { LEG_LIFT_GOALS, SPLIT_GOALS, TAILORS_GOALS, TOE_TOUCH_GOALS } from './flexPredict'

const round1 = (n: number): number => Math.round(n * 10) / 10

/** A pose whose best-ever reading was beaten today. */
export type AnglePR = { pose: string; deg: number }

/** A goal today's reading crossed for the first time. */
export type CompletedFlexGoal = { label: string; target: number; deg: number }

/**
 * The poses a PR can be set on. Warm readings only: they're the ones the goals
 * track, and a cold reading is a starting point rather than an achievement.
 * Left and right count separately — one hip opening up is its own win.
 */
const PR_POSES: { pose: string; value: (e: FlexEntry) => number | null; dir: MetricDir }[] = [
  { pose: 'side split', value: warmSplitOf, dir: HIGHER_IS_BETTER },
  { pose: "tailor's left", value: warmTailorsLeftOf, dir: HIGHER_IS_BETTER },
  { pose: "tailor's right", value: warmTailorsRightOf, dir: HIGHER_IS_BETTER },
  { pose: 'toe touch', value: warmToeTouchOf, dir: LOWER_IS_BETTER },
  { pose: 'left leg lift', value: warmLegLiftLeftOf, dir: HIGHER_IS_BETTER },
  { pose: 'right leg lift', value: warmLegLiftRightOf, dir: HIGHER_IS_BETTER },
]

/** Best value on `date`, and best on any day before it, the metric's own way round. */
function todayVsPrior(
  points: { date: string; value: number }[],
  date: string,
  dir: MetricDir = HIGHER_IS_BETTER,
): { today: number | null; prior: number | null } {
  let today: number | null = null
  let prior: number | null = null
  for (const p of points) {
    if (p.date === date) {
      if (today == null || dir.beats(p.value, today)) today = p.value
    } else if (p.date < date && (prior == null || dir.beats(p.value, prior))) {
      prior = p.value
    }
  }
  return { today, prior }
}

/** Non-null readings of one pose as a dated series. */
function poseSeries(
  entries: FlexEntry[],
  value: (e: FlexEntry) => number | null,
): { date: string; value: number }[] {
  const out: { date: string; value: number }[] = []
  for (const e of entries) {
    const v = value(e)
    if (v != null) out.push({ date: e.date, value: v })
  }
  return out
}

/**
 * Poses whose all-time best was beaten by today's reading, deepest first.
 * A prior reading is required, so the first angle ever logged for a pose isn't
 * a PR — there's no baseline to beat yet.
 *
 * "Deepest first" is by how far each PR moved rather than by the raw degrees:
 * with the fold counted down and everything else up, the biggest number on the
 * list is no longer the biggest achievement on it.
 */
export function anglePRs(entries: FlexEntry[], today: Date = new Date()): AnglePR[] {
  const date = toISODate(today)
  const prs: (AnglePR & { by: number })[] = []
  for (const { pose, value, dir } of PR_POSES) {
    const { today: now, prior } = todayVsPrior(poseSeries(entries, value), date, dir)
    if (now != null && prior != null && dir.beats(now, prior)) {
      prs.push({ pose, deg: round1(now), by: dir.gain(prior, now) })
    }
  }
  return prs.sort((a, b) => b.by - a.by).map(({ pose, deg }) => ({ pose, deg }))
}

/**
 * Goals today's reading reached that no earlier day had, hardest first. Measured
 * on the same series the Goals panel projects — the warm split, the warm fold, and
 * the average of each paired pose's warm left/right — so a cheer here can't
 * disagree with what the panel shows.
 *
 * Every comparison runs through the pose's own direction: a rung is cleared when
 * today's reading `beats` it, and it's new when no earlier day's best did. Read
 * with a bare `>=` the fold would have cheered its whole ladder on the first
 * upright photo ever taken, since 175° is greater than every target on it.
 *
 * "Hardest first" is the rung today cleared by the *least* — the one it only just
 * got over — rather than the rung with the biggest number on it. Same answer as
 * the old sort wherever a session crossed several rungs of one ladder, since a
 * ladder's harder rungs are the ones a single reading passes most narrowly, and
 * still the right answer now that a 90° fold and a 90° leg lift are two different
 * achievements wearing the same number.
 *
 * Note this runs the opposite way to `anglePRs`, which sorts by *most* moved: a
 * PR's margin is how far you beat your own best, and more of that is a bigger win.
 * A rung's margin is overshoot past a fixed line, and less of it means a harder
 * line.
 */
export function completedFlexGoals(
  entries: FlexEntry[],
  today: Date = new Date(),
): CompletedFlexGoal[] {
  const date = toISODate(today)
  const sets: {
    points: { date: string; value: number }[]
    targets: readonly number[]
    label: (t: number) => string
    dir: MetricDir
  }[] = [
    { points: warmSplitSeries(entries), targets: SPLIT_GOALS, label: (t) => `${t}° split`, dir: HIGHER_IS_BETTER },
    { points: tailorsAvgSeries(entries), targets: TAILORS_GOALS, label: (t) => `${t}° tailor's pose`, dir: HIGHER_IS_BETTER },
    { points: warmToeTouchSeries(entries), targets: TOE_TOUCH_GOALS, label: (t) => `${t}° toe touch`, dir: LOWER_IS_BETTER },
    { points: legLiftAvgSeries(entries), targets: LEG_LIFT_GOALS, label: (t) => `${t}° leg lift`, dir: HIGHER_IS_BETTER },
  ]

  const out: (CompletedFlexGoal & { by: number })[] = []
  for (const set of sets) {
    const { today: now, prior } = todayVsPrior(set.points, date, set.dir)
    if (now == null) continue
    for (const target of set.targets) {
      // `beats` is strict, so a reading that lands exactly on a rung has to clear
      // it the other way round: not-worse-than-target is at-or-past it.
      const cleared = !set.dir.beats(target, now)
      const isNew = prior == null || set.dir.beats(target, prior)
      if (cleared && isNew) {
        out.push({ label: set.label(target), target, deg: round1(now), by: set.dir.gain(target, now) })
      }
    }
  }
  return out.sort((a, b) => a.by - b.by).map(({ label, target, deg }) => ({ label, target, deg }))
}

/** A single epic celebration summarizing one or more angle PRs. */
export function anglePRCelebration(prs: AnglePR[]): Celebration | null {
  if (prs.length === 0) return null
  const [top, ...rest] = prs
  return {
    tier: 'epic',
    title: prs.length > 1 ? 'new flexibility prs!' : 'new flexibility pr!',
    subtitle: `${top.pose} — ${top.deg}°, deeper than you've ever been.`,
    details: rest.map((p) => `${p.pose} — ${p.deg}°`),
    icon: 'trophy',
  }
}

/** A single epic celebration for one or more goals crossed today. */
export function flexGoalCelebration(goals: CompletedFlexGoal[]): Celebration | null {
  if (goals.length === 0) return null
  const [top, ...rest] = goals
  return {
    tier: 'epic',
    title: goals.length > 1 ? 'goals complete!' : 'goal complete!',
    subtitle: `${top.label} — hit it at ${top.deg}°.`,
    details: rest.map((g) => g.label),
    icon: 'stars',
  }
}

/**
 * Everything today's angles earned, ready to hand to `composeCelebration`.
 * A completed goal comes first so it leads the composed cheer: it and a PR share
 * the loudest tier, and the sort there keeps the earlier one in front.
 */
export function flexAngleCelebrations(entries: FlexEntry[], today: Date = new Date()): Celebration[] {
  return [
    flexGoalCelebration(completedFlexGoals(entries, today)),
    anglePRCelebration(anglePRs(entries, today)),
  ].filter((c): c is Celebration => c != null)
}
