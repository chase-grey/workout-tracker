/**
 * Which lifts have a ladder of goals rather than a single one, and how that
 * ladder's numbers read out loud.
 *
 * A ladder is several rungs measured on one series: the two squat targets read
 * the same estimated 1RM, and the four pull-up rungs the same sustained-reps
 * line. Those are drawn as one block with one chart (see LiftLadderBlock), the
 * way the stretch ladders and the bodyweight pair already are. Bench has a
 * single goal, so there's no ladder to draw and it keeps its own row and chart.
 *
 * The wording lives here rather than in the block because it's lift-specific
 * knowledge with rules worth stating and checking: a pull-up rung is measured on
 * the reps every one of four sets still had in it (see
 * progress.sustainedRepsSeries), so its numbers read as "4×8" rather than a bare
 * 8 — which is how the rungs themselves are titled. A squat reading is a formula's
 * answer rather than a weight that was on the bar, so it says so.
 *
 * Pure module — no React/DOM.
 */

import { LEG_PRESS_KEY, PULLUP_GOAL_SETS, PULLUP_KEY } from './goals'

/** How one lift's ladder is named and read. */
export type LiftLadder = {
  /** What the block is called. */
  title: string
  /** What the plotted line is called where it's named — the chart's tooltip. */
  seriesName: string
  /** The latest reading, spelled out beside the title. */
  headline: (value: number) => string
  /** A rung's target line on the chart. */
  goalLabel: (target: number) => string
  /** Placeholder when the lift has nothing logged yet. */
  empty: string
}

export const LIFT_LADDERS: Record<string, LiftLadder> = {
  [LEG_PRESS_KEY]: {
    title: 'squat',
    seriesName: 'est. 1rm',
    headline: (v) => `${Math.round(v)} lbs est. 1rm`,
    goalLabel: (t) => `goal ${t}`,
    empty: 'log leg press or squats to project these goals',
  },
  [PULLUP_KEY]: {
    title: 'pull-ups',
    seriesName: 'every set',
    headline: (v) => `${PULLUP_GOAL_SETS}×${v}`,
    goalLabel: (t) => `goal ${PULLUP_GOAL_SETS}×${t}`,
    empty: 'log pull-ups to project these goals',
  },
}

/** Whether a lift's goals are drawn as one block (see {@link LIFT_LADDERS}). */
export function isLiftLadder(exerciseKey: string | null | undefined): boolean {
  return exerciseKey != null && exerciseKey in LIFT_LADDERS
}
