/**
 * Resting the abs on back-to-back days.
 *
 * Every lift day opens with the same two ab movements (see config/plan — the
 * cable crunch and the incline sit-up, four sets each). Trained on consecutive
 * days that's the one muscle in the plan with no day off between sessions, so a
 * session started the day after ab work — or later the same day as some — leaves
 * the ab block out, and spends the time it would have taken on the rest of the
 * day instead. The kebab brings the abs back if today is the day for them after
 * all (see {@link restoreAbs}).
 *
 * What fills the time is a choice ({@link AbsFill}, pinned at {@link ABS_REST_FILL}):
 *
 * - `'borrow'` — take what the FULL day has that the short one cut, in day order,
 *   as whole movements (a circuit's stations together), until the ab time is
 *   spent; then, if time is still unspent, one more set of the lifts already in
 *   play, in day order, up to two per movement. On a full-length day there's
 *   nothing to borrow, so it's the sets pass alone. The program's own extras are
 *   the natural filler: they're what the day would have had with more time.
 * - `'sets'` — the sets pass only: no movement joins the day, the ones already in
 *   it each get a set or two more.
 * - `'none'` — take the shorter day.
 *
 * The time is counted in prescribed seconds — the assumed working time per set
 * plus the prescribed rest — on both sides of the trade, so the rest ratio that
 * stretches real rests stretches the ab block and its replacement alike.
 *
 * Pure module — no React/DOM.
 */

import type { ExerciseLog, SetLog, WorkoutRow, WorkoutSession } from '../types'
import { absExerciseKeys, type Plan, type PlannedExercise } from '../config/plan'
import { WORK_PER_SET_SEC } from './estimate'
import { CIRCUIT_STATION_REST_SEC } from './rest'
import { parseISODate, toISODate } from './dates'
import type { Target } from './progression'

export type AbsFill = 'borrow' | 'sets' | 'none'

/** How a session without its ab block spends the time (see module comment). */
export const ABS_REST_FILL: AbsFill = 'borrow'

/** The most sets the fill adds to any one movement (a circuit: rounds). */
export const MAX_EXTRA_SETS = 2

/** The display groups that make a movement part of the ab block. */
const ABS_GROUP_RE = /^(abs|core)$/i

export function isAbsExercise(e: Pick<PlannedExercise, 'group'>): boolean {
  return ABS_GROUP_RE.test(e.group)
}

/** Whether any ab work — a lift day's block or a stretch's mat sit-ups — logged reps on `date`. */
export function absTrainedOn(rows: WorkoutRow[], plan: Plan, date: string): boolean {
  const keys = absExerciseKeys(plan)
  return rows.some((r) => r.date === date && r.reps > 0 && keys.has(r.exercise))
}

/**
 * Whether a session started on `today` should leave its ab block out: abs were
 * trained yesterday, or already today. Two days in a row is the rule; twice in
 * one day is the same thing closer together.
 */
export function restsAbs(rows: WorkoutRow[], plan: Plan, today: string): boolean {
  const d = parseISODate(today)
  d.setDate(d.getDate() - 1)
  return absTrainedOn(rows, plan, today) || absTrainedOn(rows, plan, toISODate(d))
}

/** Seconds one set of `e` is budgeted at: the hold for a timed move, else the assumed working time. */
function activeSec(e: PlannedExercise): number {
  return e.timed ? e.repMax : WORK_PER_SET_SEC
}

/** A movement, or a whole circuit, as one thing the fill adds a set (round) of at a time. */
type Unit = { stations: PlannedExercise[] }

function unitsOf(exercises: PlannedExercise[]): Unit[] {
  const units: Unit[] = []
  const byCircuit = new Map<string, Unit>()
  for (const e of exercises) {
    if (!e.circuit) {
      units.push({ stations: [e] })
      continue
    }
    const unit = byCircuit.get(e.circuit)
    if (unit) unit.stations.push(e)
    else {
      const fresh = { stations: [e] }
      byCircuit.set(e.circuit, fresh)
      units.push(fresh)
    }
  }
  return units
}

/** Seconds one set — one round, for a circuit — of the unit is budgeted at. */
function roundSec(unit: Unit): number {
  const [first] = unit.stations
  if (unit.stations.length === 1 && !first.circuit) return activeSec(first) + first.restSec
  const work = unit.stations.reduce((sum, s) => sum + activeSec(s), 0)
  const changes = first.roundScreen
    ? 0
    : unit.stations.slice(0, -1).reduce((sum, s) => sum + (s.circuitRestSec ?? CIRCUIT_STATION_REST_SEC), 0)
  const roundRest = first.circuitRoundRestSec ?? first.circuitRestSec ?? first.restSec
  return work + changes + roundRest
}

/**
 * `sized` — the day as the session is running it, short or full — without its ab
 * block, and with the time the block would have taken spent per `fill`. `full` is
 * the whole day under the same variant, which is where borrowed movements and
 * their positions come from. A list with no ab block comes back untouched.
 */
export function withoutAbs(
  sized: PlannedExercise[],
  full: PlannedExercise[],
  fill: AbsFill = ABS_REST_FILL,
): PlannedExercise[] {
  const abs = sized.filter(isAbsExercise)
  if (abs.length === 0) return sized
  const kept = sized.filter((e) => !isAbsExercise(e))
  if (fill === 'none') return kept

  let budget = abs.reduce((sum, e) => sum + e.sets * (activeSec(e) + e.restSec), 0)
  const counts = new Map(kept.map((e) => [e.key, e.sets]))
  const units = unitsOf(full.filter((e) => !isAbsExercise(e)))
  // Half a unit's cost is enough to take it: rounding to the nearest rather than
  // always coming in under.
  const fits = (cost: number) => budget >= cost / 2

  if (fill === 'borrow') {
    for (const unit of units) {
      const gap = Math.max(...unit.stations.map((s) => s.sets - (counts.get(s.key) ?? 0)))
      if (gap <= 0) continue
      const cost = gap * roundSec(unit)
      if (!fits(cost)) continue
      for (const s of unit.stations) counts.set(s.key, s.sets)
      budget -= cost
    }
  }

  // One more set of each movement in play, in day order, and round again while
  // the time lasts — never a first set of one the day didn't have.
  const inPlay = units.filter((u) => u.stations.some((s) => (counts.get(s.key) ?? 0) > 0))
  for (let pass = 0; pass < MAX_EXTRA_SETS; pass++) {
    let added = false
    for (const unit of inPlay) {
      const cost = roundSec(unit)
      if (!fits(cost)) continue
      for (const s of unit.stations) counts.set(s.key, (counts.get(s.key) ?? 0) + 1)
      budget -= cost
      added = true
    }
    if (!added) break
  }

  return full.flatMap((e) => {
    if (isAbsExercise(e)) return []
    const sets = counts.get(e.key) ?? 0
    if (sets <= 0) return []
    const own = kept.find((k) => k.key === e.key)
    if (own && own.sets === sets) return [own]
    return [{ ...e, sets }]
  })
}

/**
 * `session` with its ab block back: `withAbs` is the day as the session would be
 * performing it with the abs in (variant, length and side order applied, nothing
 * left out). The ab movements arrive prefilled from `targets` as they would have
 * at the start. The time the fill had spent is taken back where it hasn't been
 * used: a set the fill added that isn't logged yet goes, a movement it borrowed
 * with nothing logged goes — but a set already done stays, logged where it was,
 * and a borrowed movement with a set done keeps its remaining sets too. A
 * movement the session added itself from the checklist is kept whole.
 */
export function restoreAbs(
  session: WorkoutSession,
  withAbs: PlannedExercise[],
  targets: Map<string, Target>,
): WorkoutSession {
  const byKey = new Map(session.exercises.map((log) => [log.exercise, log]))
  const dayKeys = new Set(withAbs.map((e) => e.key))
  const adHoc = new Set((session.adHocExercises ?? []).map((e) => e.key))
  const own: ExerciseLog[] = withAbs.map((e) => {
    const existing = byKey.get(e.key)
    if (!existing) return { exercise: e.key, sets: freshSets(e, targets.get(e.key)) }
    return trimUndone(existing, e.sets)
  })
  const extra = session.exercises.filter(
    (log) => !dayKeys.has(log.exercise) && (adHoc.has(log.exercise) || log.sets.some((s) => s.done)),
  )
  return { ...session, restAbs: false, exercises: [...own, ...extra] }
}

function freshSets(e: PlannedExercise, target: Target | undefined): SetLog[] {
  const weightLbs = target?.weightLbs ?? null
  const reps = target?.reps ?? e.repMin
  return Array.from({ length: e.sets }, (_, i) => ({ setNumber: i + 1, weightLbs, reps, done: false }))
}

/** `log` cut back to `count` sets from the end, stopping at the first set that's done. */
function trimUndone(log: ExerciseLog, count: number): ExerciseLog {
  const sets = log.sets.slice()
  while (sets.length > count && !sets[sets.length - 1].done) sets.pop()
  return sets.length === log.sets.length ? log : { ...log, sets }
}
