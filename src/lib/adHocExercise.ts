import { v4 as uuid } from 'uuid'
import { ALL_EXERCISES, DAY_TYPES, QUICK_LOG_KEY, exerciseName, type Plan, type PlannedExercise } from '../config/plan'
import type { WorkoutRow } from '../types'

/**
 * The key prefix of a movement typed in for one workout only. The key is minted
 * on the spot and means nothing once the session is logged, so the sheet row
 * carries the typed name in its place (see session.sessionToRows) — which is why
 * only keys with this prefix get swapped: a plan movement added to a workout it
 * wasn't prescribed for keeps its real key, and with it its history.
 */
export const AD_HOC_PREFIX = 'adhoc:'

export function isAdHocKey(key: string): boolean {
  return key.startsWith(AD_HOC_PREFIX)
}

/** The group the add-exercise list files movements it only knows from the log under. */
export const LOGGED_GROUP = 'from your log'

/**
 * A movement the add-exercise sheet can offer instead of a blank name field.
 *
 * `base` is set for a plan movement, carried whole so adding it keeps everything
 * the plan knows — its key, rest, increment, hold-or-reps — and only the set and
 * rep counts come from the form. A movement known only from the log has no base:
 * the key is whatever the sheet stored it under (a typed name, or a key the
 * defaults have since retired), so adding it again logs onto the same history.
 */
export type ExerciseOption = {
  key: string
  name: string
  group: string
  base?: PlannedExercise
}

/**
 * Every movement worth offering as an addition to the running workout, with the
 * ones it already holds left out: the live plan's across every day (in plan order,
 * so the list reads the way the week does), then any shipped default the plan has
 * dropped, then the names logged before that none of those explain —
 * alphabetical, so a free-text move typed once is a pick the next time.
 */
export function exerciseOptions(plan: Plan, history: WorkoutRow[], inSession: PlannedExercise[]): ExerciseOption[] {
  const taken = new Set(inSession.map((e) => e.key))
  const seen = new Set<string>()
  const out: ExerciseOption[] = []
  const planned = [...DAY_TYPES.flatMap((d) => plan[d]?.exercises ?? []), ...ALL_EXERCISES]
  for (const e of planned) {
    if (seen.has(e.key)) continue
    seen.add(e.key)
    if (taken.has(e.key)) continue
    out.push({ key: e.key, name: e.name, group: e.group, base: e })
  }
  const logged = new Set<string>()
  for (const r of history) {
    const key = r.exercise
    if (!key || key === QUICK_LOG_KEY || seen.has(key) || taken.has(key) || isAdHocKey(key)) continue
    logged.add(key)
  }
  out.push(
    ...[...logged]
      .map((key) => ({ key, name: exerciseName(key), group: LOGGED_GROUP }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  )
  return out
}

/**
 * The option a typed name already is, if any — matched on the name as the list
 * shows it, case and surrounding space aside — so typing "farmer carry" a second
 * time lands on the first one's history rather than opening a second one.
 */
export function matchTypedName(name: string, options: ExerciseOption[]): ExerciseOption | null {
  const wanted = name.trim().toLowerCase()
  if (!wanted) return null
  return options.find((o) => o.name.trim().toLowerCase() === wanted) ?? null
}

export type AdHocInput = {
  /** Read only when there is no option: the movement is being typed in. */
  name: string
  sets: number
  reps: number
}

/**
 * The movement the session carries for an addition. A plan movement keeps what
 * belongs to the movement itself — key, name, rest, increment, how it's loaded or
 * held — and sheds what belonged to its place in the day: a circuit of one is no
 * circuit, a shared load has nothing to share with, and a side was the day's call.
 * The set and rep counts are the form's, so the prescription is what you asked
 * for rather than what the day would have asked. A movement with no plan entry
 * gets a minute's rest and the group the list filed it under; a typed name gets
 * a fresh key of its own.
 */
export function adHocExercise(input: AdHocInput, option: ExerciseOption | null): PlannedExercise {
  const sets = clamp(input.sets, 1, 20)
  const reps = clamp(input.reps, 1, 999)
  const base = option?.base
  if (base) {
    const {
      circuit: _circuit,
      circuitRestSec: _circuitRest,
      circuitRoundRestSec: _roundRest,
      roundScreen: _roundScreen,
      sharedLoad: _sharedLoad,
      side: _side,
      shortSets: _shortSets,
      byVariant: _byVariant,
      optional: _optional,
      ...own
    } = base
    return { ...own, sets, repMin: reps, repMax: reps }
  }
  return {
    key: option?.key ?? `${AD_HOC_PREFIX}${uuid()}`,
    name: option?.name ?? input.name.trim(),
    sets,
    repMin: reps,
    repMax: reps,
    restSec: 60,
    group: option ? LOGGED_GROUP : 'ad hoc',
  }
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, Math.round(n)))
}
