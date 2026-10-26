/**
 * The line a bodyweight-relative goal is drawn as.
 *
 * "Bench my bodyweight" doesn't have one number to aim at: the target on any
 * day is what you weighed that day, and the ETA is already worked out against
 * the weight you'll have gained by then (see predictions.withMovingTarget). A
 * flat rule at today's weight said otherwise — it put the finish under where
 * the projected curve actually lands. So the line is drawn as the target moves:
 * back through the weigh-ins, held from the last one to today, and on from
 * today at the weight gain the ETA is projected against.
 */

import type { Point } from './progress'
import type { GoalSpec } from './goals'
import type { Projection } from './predictions'
import { daysBetween, toISODate } from './dates'

/** What a moving target is made of: its own history, where it stands, how fast it's moving. */
export type MovingTarget = {
  /** The target on each weigh-in date, oldest → newest (see GoalSpec.targetPoints). */
  history: Point[]
  /** Where it stands today. */
  target: number
  /** How fast it moves from here, per week. */
  slopePerWeek: number
}

/** A goal's moving target, or undefined for one that holds still. */
export function movingTargetOf(goal: GoalSpec, proj: Projection): MovingTarget | undefined {
  return goal.targetPoints
    ? { history: goal.targetPoints, target: goal.target, slopePerWeek: proj.targetSlopePerWeek ?? 0 }
    : undefined
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * The target's line from `from` to `to`, one point per date it bends on. Null
 * when there's no history to draw it from — a fixed goal, or a bodyweight one
 * before the first weigh-in — so the caller falls back to a flat rule.
 */
export function goalLine(
  moving: MovingTarget | undefined,
  from: string,
  to: string,
  today: Date = new Date(),
): Point[] | null {
  if (!moving || moving.history.length === 0 || to < from) return null
  const { history, target, slopePerWeek } = moving
  const now = toISODate(today)
  const at = (date: string) => round1(target + (slopePerWeek * daysBetween(now, date)) / 7)
  const out: Point[] = []

  // Enter from the left edge at whatever the target was then, rather than
  // dragging the chart back to the first weigh-in ever logged.
  const before = history.filter((p) => p.date < from).at(-1)
  if (before && from <= now && !history.some((p) => p.date === from)) out.push({ date: from, value: before.value })
  for (const p of history) {
    if (p.date >= from && p.date <= to && p.date < now) out.push({ date: p.date, value: p.value })
  }
  if (from > now) out.push({ date: from, value: at(from) })
  else if (to >= now) out.push({ date: now, value: target })
  if (to > now && to > from) out.push({ date: to, value: at(to) })
  return out
}

/** The goal line folded into a chart's rows under `key`, adding a row for each date it bends on. */
export function withGoalLine<T extends { date: string }>(rows: T[], line: Point[] | null, key = 'goal'): T[] {
  if (!line) return rows
  const m = new Map<string, T>(rows.map((r) => [r.date, { ...r }]))
  for (const p of line) {
    const row = m.get(p.date) ?? ({ date: p.date } as T)
    ;(row as Record<string, unknown>)[key] = p.value
    m.set(p.date, row)
  }
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}
