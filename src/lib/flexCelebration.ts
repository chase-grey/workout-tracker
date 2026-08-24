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
  tailorsAvgSeries,
  warmLegLiftLeftOf,
  warmLegLiftRightOf,
  warmSplitOf,
  warmSplitSeries,
  warmTailorsLeftOf,
  warmTailorsRightOf,
  warmToeTouchOf,
  type FlexEntry,
} from './flex'
import { HIGHER_IS_BETTER, LOWER_IS_BETTER, type MetricDir } from './flexMetrics'
import { SPLIT_GOALS, TAILORS_GOALS } from './flexPredict'

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
 * Goals today's reading reached that no earlier day had, biggest target first.
 * Measured on the same series the Goals panel projects — the warm split, and the
 * average of the warm tailor's pair — so a cheer here can't disagree with what
 * the panel shows.
 *
 * The toe touch and the leg lifts have no ladder yet (see HEAD-TO-TOE.md's
 * deferred list), so nothing here reads them: a goal set can only be cheered
 * once there is one.
 */
export function completedFlexGoals(
  entries: FlexEntry[],
  today: Date = new Date(),
): CompletedFlexGoal[] {
  const date = toISODate(today)
  const sets: { points: { date: string; value: number }[]; targets: readonly number[]; label: (t: number) => string }[] = [
    { points: warmSplitSeries(entries), targets: SPLIT_GOALS, label: (t) => `${t}° split` },
    { points: tailorsAvgSeries(entries), targets: TAILORS_GOALS, label: (t) => `${t}° tailor's pose` },
  ]

  const out: CompletedFlexGoal[] = []
  for (const set of sets) {
    const { today: now, prior } = todayVsPrior(set.points, date)
    if (now == null) continue
    for (const target of set.targets) {
      if (now >= target && (prior == null || prior < target)) {
        out.push({ label: set.label(target), target, deg: round1(now) })
      }
    }
  }
  return out.sort((a, b) => b.target - a.target)
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
