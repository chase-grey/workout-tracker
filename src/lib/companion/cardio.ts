/**
 * A reply's cardio ops turned into the cardio plan they describe, through
 * lib/cardioPlan and nothing else, so a plan an AI asked for is the plan the
 * cardio goal sheet would have built from the same answers.
 *
 * The ops are read as answers to the sheet's questions — what, how far or fast,
 * where you are now, which days, by when — gathered across the reply and then
 * built once: `cardio goal dist=5k` then `cardio days tue,sat` is one plan, not
 * a plan and an edit of it. Whatever a reply leaves out keeps the plan being
 * followed (for the same goal) or takes the sheet's own default: the log's
 * reading for where you are, startingCardioDays for the days, the suggested
 * date for when.
 *
 * The ramp is the generator's and a reply can't reach it: it names no week's
 * minutes. What it could do is rush one, with a target date sooner than a
 * tenth a week gets there, which squeezes the build and lands a goal session
 * the weeks before never built to. A date the reply sets is therefore held to
 * the suggested one (suggestTargetDate, the week the ramp actually arrives)
 * and the move is said in the preview's notes. A date the person set in the
 * sheet is theirs and is kept.
 *
 * Pure module — no React/DOM, no storage, no clock but `today`.
 */

import type { CardioEntry } from '../cardio'
import {
  addCheckpoint,
  buildCardioPlan,
  cardioSessionsForWeek,
  checkpoint,
  checkpointLabel,
  earliestTargetDate,
  endCardioPlan,
  firstPlanWeek,
  fmtClock,
  fmtDistance,
  goalLabel,
  goalTypesFor,
  planActive,
  plusDays,
  replanCardio,
  startingCardioDays,
  startingLevel,
  suggestTargetDate,
  weekdayOf,
  WEEKDAY_NAMES,
  type CardioGoal,
  type CardioLevel,
  type CardioPlan,
} from '../cardioPlan'
import { parseISODate } from '../dates'
import type { CardioOp } from './ops'

/** What applying cardio ops reads besides the plan: the log, the lifting habit and the day. */
export type CardioContext = {
  /** YYYY-MM-DD. */
  today: string
  entries: CardioEntry[]
  /** The weekdays you usually lift on (lib/cardioPlan liftingWeekdays), kept clear for a new plan. */
  liftDays: number[]
  /** The weekly cardio goal, which a new plan's number of days starts from. */
  weeklyCardio?: number
}

/** The furthest out a reply may set a target. The ramp's own horizon is three years; a plan that far is not a plan. */
const MAX_WEEKS_OUT = 104

/** "feb 1". */
function shortDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()
}

const dayList = (days: number[]) => days.map((d) => WEEKDAY_NAMES[d]).join('/')

const sameGoal = (a: CardioGoal, b: CardioGoal) => JSON.stringify(a) === JSON.stringify(b)

/** "longest 20 min · 2 mi · 60 min a week · 11:30/mi". */
function levelLine(level: CardioLevel, goal: CardioGoal): string {
  const parts: string[] = []
  if (level.longestMin) parts.push(`longest ${level.longestMin} min`)
  if (level.longestMi) parts.push(fmtDistance(level.longestMi))
  parts.push(`${level.weeklyMin} min a week`)
  if (level.paceMinPerMi) parts.push(`${fmtClock(level.paceMinPerMi)}/mi`)
  if (goal.type === 'time' && level.timeMin) parts.push(`${fmtDistance(goal.distanceMi)} now ${fmtClock(level.timeMin)}`)
  return parts.join(' · ')
}

/** "tue easy run 15 min · thu easy run 15 min · sat long run 1.5 mi". */
function weekLine(plan: CardioPlan, weekStart: string): string {
  return cardioSessionsForWeek(plan, weekStart)
    .map((s) => `${WEEKDAY_NAMES[weekdayOf(s.date)]} ${s.label}`)
    .join(' · ')
}

type Draft = {
  kind?: string
  goal?: CardioGoal
  level: Partial<CardioLevel>
  days?: number[]
  by?: string
}

/**
 * The cardio plan `ops` make of `plan`, a line per change for the preview, the
 * notes on anything the rules moved, and the ops that couldn't be applied.
 * `plan` is never mutated; with no cardio ops it comes back as it was.
 */
export function applyCardioOps(
  plan: CardioPlan | undefined,
  ops: CardioOp[],
  ctx: CardioContext,
): { plan: CardioPlan | undefined; applied: string[]; notes: string[]; errors: string[] } {
  const applied: string[] = []
  const notes: string[] = []
  const errors: string[] = []
  if (ops.length === 0) return { plan, applied, notes, errors }
  const { today, entries } = ctx
  const active = planActive(plan, today) ? plan : undefined

  const draft: Draft = { level: {} }
  let shaped = false
  let replan = false
  let end = false
  const checkpoints: Extract<CardioOp, { op: 'cardio.checkpoint' }>[] = []
  for (const op of ops) {
    switch (op.op) {
      case 'cardio.goal':
        draft.kind = op.kind ?? draft.kind
        draft.goal = op.goal
        if (op.days) draft.days = op.days
        if (op.by) draft.by = op.by
        shaped = true
        break
      case 'cardio.level': {
        const { op: _op, ...level } = op
        Object.assign(draft.level, level)
        shaped = true
        break
      }
      case 'cardio.days':
        draft.days = op.days
        shaped = true
        break
      case 'cardio.date':
        draft.by = op.by
        shaped = true
        break
      case 'cardio.checkpoint':
        checkpoints.push(op)
        break
      case 'cardio.replan':
        replan = true
        break
      case 'cardio.end':
        end = true
        break
    }
  }

  if (end) {
    if (shaped || replan || checkpoints.length) {
      errors.push('cardio end ends the plan, so it can\'t go with other cardio changes — send it alone, or drop it to change the plan')
      return { plan, applied, notes, errors }
    }
    if (!active) {
      errors.push("cardio end: there's no cardio plan to end")
      return { plan, applied, notes, errors }
    }
    applied.push(`end cardio plan: ${goalLabel(active.kind, active.goal)}`)
    return { plan: endCardioPlan(active, today), applied, notes, errors }
  }

  let next = plan
  if (shaped) {
    const kind = draft.kind ?? active?.kind ?? 'run'
    // A kind only ever arrives with its goal, so a reply without one is changing the plan being followed.
    const goal = draft.goal ?? active?.goal
    if (!goal) {
      errors.push("there's no cardio plan yet — start with a cardio goal line")
      return { plan, applied, notes, errors }
    }
    if (!goalTypesFor(kind).includes(goal.type)) {
      errors.push(`${kind} has no distance to aim at — use a minutes-a-week goal (min=)`)
      return { plan, applied, notes, errors }
    }
    const keeping = !!active && active.kind === kind && sameGoal(active.goal, goal)
    const days = draft.days ?? active?.days ?? startingCardioDays(ctx.weeklyCardio, ctx.liftDays)
    // Where you are: what the reply says, over the log's reading, over where the plan being replaced started.
    const sameKind = active?.kind === kind ? active : undefined
    const level: CardioLevel = { ...startingLevel(entries, kind, goal, today, sameKind?.level), ...draft.level }
    if (goal.type !== 'time') delete level.timeMin

    const suggested = suggestTargetDate(kind, goal, level, days, today)
    const earliest = earliestTargetDate(days, today)
    let targetDate: string
    // A reply repeating the date already set (by the sheet, perhaps a race day) isn't the reply's to move.
    if (draft.by && draft.by !== active?.targetDate) {
      const latest = plusDays(today, 7 * MAX_WEEKS_OUT)
      targetDate = draft.by
      if (draft.by < suggested) {
        targetDate = suggested
        notes.push(`by ${shortDate(draft.by)} → ${shortDate(suggested)}: the earliest the plan gets there adding a tenth a week`)
      } else if (draft.by > latest) {
        targetDate = latest
        notes.push(`by ${draft.by} → ${latest}: two years out at most`)
      }
    } else {
      targetDate = draft.by ?? (keeping && active.targetDate >= earliest ? active.targetDate : suggested)
    }

    next = buildCardioPlan({ kind, goal, level, days, targetDate }, today, plan)
    const first = firstPlanWeek(days, today)
    const weeks = next.weeks.filter((w) => w.start >= first).length
    const what = `${goalLabel(kind, goal)} by ${shortDate(targetDate)} · ${dayList(days)} · ${weeks} week${weeks === 1 ? '' : 's'}`
    if (!active) applied.push(`cardio plan: ${what}`)
    else if (!keeping) applied.push(`cardio plan: ${goalLabel(active.kind, active.goal)} → ${what}`)
    else {
      const moved: string[] = []
      if (dayList(active.days) !== dayList(days)) moved.push(`days ${dayList(active.days)} → ${dayList(days)}`)
      if (active.targetDate !== targetDate) moved.push(`by ${shortDate(active.targetDate)} → ${shortDate(targetDate)}`)
      applied.push(`cardio plan: ${what}${moved.length ? ` (${moved.join(', ')})` : ''}`)
    }
    applied.push(`starting from: ${levelLine(level, goal)}`)
    applied.push(`first week (${shortDate(first)}): ${weekLine(next, first)}`)
    if (replan) notes.push('replan left out: the plan is built from where you are already')
  } else if (replan) {
    if (!active) {
      errors.push("cardio replan: there's no cardio plan to re-plan")
      return { plan, applied, notes, errors }
    }
    const re = replanCardio(active, entries, today)
    if (re === active) {
      errors.push("cardio replan: the plan's date has passed — set a new cardio goal")
      return { plan, applied, notes, errors }
    }
    next = re
    const first = firstPlanWeek(active.days, today)
    applied.push(`re-plan ${goalLabel(active.kind, active.goal)} from where the log says you are`)
    applied.push(`first week (${shortDate(first)}): ${weekLine(next, first)}`)
  }

  if (checkpoints.length) {
    if (!next || !planActive(next, today)) {
      errors.push("cardio checkpoint: there's no cardio plan to add it to")
      return { plan, applied, notes, errors }
    }
    for (const { op: _op, ...c } of checkpoints) {
      const id = checkpoint(c).id
      if (next.checkpoints.some((x) => x.id === id)) {
        notes.push(`checkpoint ${checkpointLabel({ id, ...c })} is already there`)
        continue
      }
      next = addCheckpoint(next, c)
      applied.push(`checkpoint: ${checkpointLabel({ id, ...c })}`)
    }
  }

  return { plan: next, applied, notes, errors }
}
