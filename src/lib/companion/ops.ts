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
 * meant, and shaped as a union keyed on `op` so new kinds (a running plan's
 * `runplan`, `session`, `week`, `goal run`) arrive as new members rather than
 * as new fields on the lift ops.
 *
 * Pure module — no React/DOM, no storage.
 */

import type { DayType } from '../../types'

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

export type CompanionOp = LiftOp | WeeklyOp | SummaryOp | AskOp

/** The ops that change something, as opposed to the ones that only say something. */
export type ChangeOp = LiftOp | WeeklyOp

export function isChangeOp(op: CompanionOp): op is ChangeOp {
  return op.op !== 'summary' && op.op !== 'ask'
}

/** Limits every number in a reply is held to; outside them it's clamped and flagged. */
export const LIMITS = {
  sets: [1, 8],
  reps: [1, 50],
  restSec: [0, 600],
  workouts: [1, 7],
} as const
