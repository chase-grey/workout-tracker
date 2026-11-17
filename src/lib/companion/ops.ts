/**
 * What an AI companion can ask the app to do, as typed data.
 *
 * Two roads lead here. The copy-paste companion — a free chat AI with no API
 * key — replies with a `WT v1` … `END` block that lib/companion/parse turns
 * into these; the BYO-key coach can later emit the same ops as tool JSON. Both
 * end in {@link applyCompanionOps} and the same approval card, so a change means
 * the same thing whichever AI proposed it.
 *
 * Versioned so a reply written against an older prompt is read the way it was
 * meant, and shaped as a union keyed on `op` so new kinds arrive as new
 * members rather than as new fields on the lift ops. The cardio ops are such
 * members: they arrived without a version bump, because no v1 reply ever had a
 * `cardio` line that meant anything (it was an error), so reading one now
 * changes the meaning of no reply already written. A bump is for when a line
 * that already parsed would start meaning something else.
 *
 * The cardio ops say what the plan is for — goal, days, date, where you are —
 * and never what a week holds. lib/cardioPlan's generator lays out every
 * session, so its ramp (a tenth a week, a lighter fourth week, a taper) can't
 * be argued past by a reply; the one thing a reply could use to rush it, a
 * target date sooner than the ramp gets there, is moved to the date it does
 * (lib/companion/cardio).
 *
 * Pure module — no React/DOM, no storage.
 */

import type { DayType } from '../../types'
import type { CardioCheckpoint, CardioGoal, CardioLevel } from '../cardioPlan'

/** The block format this build reads and asks for. */
export const COMPANION_VERSION = 1

/** A change to one exercise already on a day. Fields left out are left alone. */
export type LiftSetOp = {
  op: 'lift.set'
  day: DayType
  key: string
  sets?: number
  repMin?: number
  repMax?: number
  restSec?: number
  name?: string
}

/**
 * A new exercise on a day. `key` is set when the name matched one the app
 * already knows, whose history and settings it then inherits; without it the
 * exercise is a custom row named as written.
 */
export type LiftAddOp = {
  op: 'lift.add'
  day: DayType
  name: string
  key?: string
  sets?: number
  repMin?: number
  repMax?: number
  restSec?: number
  group?: string
}

export type LiftRemoveOp = { op: 'lift.remove'; day: DayType; key: string }

/** An exercise moved within its day: next to another, or to a 0-based slot. */
export type LiftMoveOp = {
  op: 'lift.move'
  day: DayType
  key: string
  before?: string
  after?: string
  toIndex?: number
}

/** The weekly workouts goal. */
export type WeeklyOp = { op: 'weekly'; workouts: number }

/** What the change is for, in the AI's words. Every reply carries one. */
export type SummaryOp = { op: 'summary'; text: string }

/** A question the AI still has; a reply holding one is shown, not applied. */
export type AskOp = { op: 'ask'; text: string }

export type LiftOp = LiftSetOp | LiftAddOp | LiftRemoveOp | LiftMoveOp

/**
 * A cardio goal, and a plan built toward it by lib/cardioPlan. `kind` left out
 * keeps the current plan's, else run; `days` and `by` left out keep the
 * current plan's for the same goal, else take the defaults the goal sheet does.
 */
export type CardioGoalOp = { op: 'cardio.goal'; kind?: string; goal: CardioGoal; days?: number[]; by?: string }

/** Where you are now, over what the log says. Fields left out keep the log's reading. */
export type CardioLevelOp = { op: 'cardio.level' } & Partial<CardioLevel>

/** The days the plan runs on, 0 = Monday … 6 = Sunday. */
export type CardioDaysOp = { op: 'cardio.days'; days: number[] }

/** The plan's target date. */
export type CardioDateOp = { op: 'cardio.date'; by: string }

/** A checkpoint added along the way. */
export type CardioCheckpointOp = { op: 'cardio.checkpoint' } & Omit<CardioCheckpoint, 'id' | 'goal'>

/** The weeks ahead re-laid from where the log says you are. */
export type CardioReplanOp = { op: 'cardio.replan' }

/** The plan ended, the weeks behind kept. */
export type CardioEndOp = { op: 'cardio.end' }

export type CardioOp =
  | CardioGoalOp
  | CardioLevelOp
  | CardioDaysOp
  | CardioDateOp
  | CardioCheckpointOp
  | CardioReplanOp
  | CardioEndOp

export type CompanionOp = LiftOp | WeeklyOp | CardioOp | SummaryOp | AskOp

/** The ops that change something, as opposed to the ones that only say something. */
export type ChangeOp = LiftOp | WeeklyOp | CardioOp

export function isCardioOp(op: CompanionOp): op is CardioOp {
  return op.op.startsWith('cardio.')
}

export function isChangeOp(op: CompanionOp): op is ChangeOp {
  return op.op !== 'summary' && op.op !== 'ask'
}

/** Limits every number in a reply is held to; outside them it's clamped and flagged. */
export const LIMITS = {
  sets: [1, 8],
  reps: [1, 50],
  restSec: [0, 600],
  workouts: [1, 7],
  /** Cardio: a goal distance in miles, a goal time and a week's minutes. */
  goalMi: [0.25, 50],
  goalMin: [1, 600],
  weeklyMin: [10, 1200],
  /** Where you are: the longest session, in minutes and miles, and easy pace in minutes a mile. */
  longestMin: [0, 600],
  longestMi: [0, 50],
  paceMinPerMi: [2, 40],
  /** Days a week a plan runs on: one kept for rest. */
  cardioDays: [1, 6],
} as const
