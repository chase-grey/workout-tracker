import type { FlexBlock, FlexExercise } from '../config/flexPlan'
import { STRETCH_CORE } from '../config/plan'
import type { WorkoutRow } from '../types'
import { nextTarget, type Target } from './progression'
import { parseTempo, workPhaseCount } from './tempo'

/** Which leg a per-side step is for. */
export type Side = 'left' | 'right'

/** Default seconds to reposition between the two sides of a round. */
export const SIDE_SWITCH_SEC = 5

/** One set of one stretch — the unit the guided stretch flow steps through. */
export type FlexSetStep = {
  kind: 'flex'
  blockLabel: string
  blockNote?: string
  exKey: string
  exName: string
  reps: number
  tempo: string
  restSec: number
  round: number // 0-based set number within the exercise
  maxSets: number
  stepKey: string // unique id for done-tracking
  /** Which leg this step is for; absent for a two-sided stretch. */
  side?: Side
  /** The variation's name, when the exercise has one per set (see setLabels). */
  setLabel?: string
  /** A timed hold: `tempo` and `reps` are unused, and the step renders HoldTimer. */
  holdSec?: number
  /** A hold with nothing prescribed, ended by a tap and logged (see FlexExercise.openHold). */
  openHold?: boolean
  /**
   * Seconds to reposition before the *other* side of this round, set only on the
   * step a side switch follows. A reposition rather than a rest — so it must not
   * be banked into the session's rest tally.
   */
  sideSwitchSec?: number
}

/**
 * One set of strength work in the flow: the office-abs block's sit-ups, or a
 * routine's own loaded exercise (see FlexExercise.load — the pelvic tilt
 * routine's hip thrust). Unlike a stretch, the user enters the weight and reps
 * performed and each set is logged as a workout row (see DataContext.logCore),
 * so it feeds the movement's own history and the charts.
 *
 * A session carries at most one such exercise, which is what lets the reps and
 * weights typed in be kept by round alone (see {@link loadedExerciseOf}).
 */
export type CoreSetStep = {
  kind: 'core'
  blockLabel: string
  exKey: string
  exName: string
  repMin: number
  repMax: number
  /** The step the next target climbs by; the progression's default when absent. */
  increment?: number
  /** Heaviest load there is to do it with — see FlexExercise.load. */
  weightCapLbs?: number
  restSec: number
  round: number // 0-based set number
  maxSets: number
  stepKey: string
}

/**
 * The exercise a session's typed-in sets belong to, with the range its next
 * target is read against — or null for a session that has none.
 */
export function loadedExerciseOf(
  steps: SessionStep[],
): LoadedExercise | null {
  const s = steps.find((x): x is CoreSetStep => x.kind === 'core')
  return s
    ? { key: s.exKey, repMin: s.repMin, repMax: s.repMax, increment: s.increment, weightCapLbs: s.weightCapLbs }
    : null
}

/** The exercise a session's typed-in sets belong to — see {@link loadedExerciseOf}. */
export type LoadedExercise = {
  key: string
  repMin: number
  repMax: number
  increment?: number
  weightCapLbs?: number
}

/**
 * What a session's typed-in sets are asked for next, read from that movement's
 * own history (see progression.nextTarget).
 *
 * A cap is a promise about the weight on screen, not only about the next step:
 * the progression stops stepping at it, and a history that somehow sits above it
 * (a mistyped set, a heavier plate borrowed once) is brought back down to it
 * rather than repeated, with the reps left to climb.
 */
export function loadedTarget(workouts: WorkoutRow[], loaded: LoadedExercise): Target {
  const target = nextTarget(workouts, loaded.key, {
    repMin: loaded.repMin,
    repMax: loaded.repMax,
    increment: loaded.increment,
    weightCapLbs: loaded.weightCapLbs,
  })
  const cap = loaded.weightCapLbs
  return cap != null && target.weightLbs != null && target.weightLbs > cap
    ? { ...target, weightLbs: cap }
    : target
}

/**
 * The weight a typed-in set shows before it's been touched: whatever the
 * nearest earlier round was set to — cleared to none included — and the
 * progression's target with nothing set before it. Clearing the first set of a
 * day with no plate to hand clears the rest with it.
 */
export function carriedWeight(
  weights: Record<number, number | null>,
  round: number,
  target: number | null,
): number | null {
  for (let r = round; r >= 0; r--) if (r in weights) return weights[r]
  return target
}

/**
 * A completed core set, as handed to DataContext.logCore: the reps done and the
 * weight they were done with, null for a set taken unloaded.
 */
export type CoreSet = { reps: number; weightLbs: number | null }

/**
 * The open holds a session finished, as the sets to log: one entry per
 * exercise, in the order they were done, each set's `reps` the seconds its
 * clock read when it was tapped off. A hold with no time on record — skipped
 * through, or never started — is left out rather than logged as nothing.
 */
export function heldSets(
  steps: SessionStep[],
  done: Set<string>,
  heldSecs: Record<string, number>,
): { exercise: string; sets: CoreSet[] }[] {
  const out: { exercise: string; sets: CoreSet[] }[] = []
  for (const s of steps) {
    if (s.kind !== 'flex' || !s.openHold || !done.has(s.stepKey)) continue
    const sec = heldSecs[s.stepKey] ?? 0
    if (sec <= 0) continue
    let entry = out.find((e) => e.exercise === s.exKey)
    if (!entry) out.push((entry = { exercise: s.exKey, sets: [] }))
    entry.sets.push({ reps: sec, weightLbs: null })
  }
  return out
}

/** A step in the Stretch + Core session: a mobility set or a core set. */
export type SessionStep = FlexSetStep | CoreSetStep

/**
 * The movement whose history this step adds to, or null for a step that logs no
 * sets of its own (a paced stretch, a prescribed hold). Anything a session
 * writes as workout rows has past attempts to read the next one against, so the
 * set screen offers them — the same trend button every lift wears (see
 * ActiveSession's topBar). Typed-in sets count reps; an open hold logs the
 * seconds its clock read, unloaded (see {@link heldSets}).
 */
export function loggedExerciseOf(
  step: SessionStep,
): { key: string; name: string; unit: 'rep' | 'sec' } | null {
  if (step.kind === 'core') return { key: step.exKey, name: step.exName, unit: 'rep' }
  if (step.openHold) return { key: step.exKey, name: step.exName, unit: 'sec' }
  return null
}

/**
 * Identity of one stretch round, shared by its left and right steps. The two
 * sides still keep distinct `stepKey`s for completion tracking.
 */
export function flexRoundKey(step: FlexSetStep): string {
  return step.side ? step.stepKey.slice(0, -(step.side.length + 1)) : step.stepKey
}

/**
 * Whether a paced set ends on its last rep's final effort rather than its
 * trailing rest. The pike work's rest is a release inside the pose, and the set
 * break right behind it already is one — so the last one is just dead time.
 */
export const skipsFinalRepRest = (s: FlexSetStep): boolean =>
  s.exKey === 'pike_lift' || s.exKey === 'pike_block_crush'

/** Assumed seconds per rep, for a stretch whose tempo says nothing usable. */
export const SEC_PER_REP = 5

/**
 * Seconds of work a stretch step is, for the time-left estimate's fallback: a
 * hold is its hold, and a paced set is its reps at the pace its tempo states.
 *
 * The tempo rather than a flat five seconds a rep, because the paces actually
 * prescribed run from six seconds a rep to twenty — a pike lift is five reps of
 * twenty seconds, and calling that twenty-five seconds of work put the routine's
 * opening estimate at half its real length. A tempo with nothing parseable in it
 * still falls back to the flat assumption.
 */
export const stepWorkSec = (s: FlexSetStep): number => {
  if (s.holdSec) return s.holdSec
  const phases = parseTempo(s.tempo)
  const paced = phases.reduce((sum, p) => sum + p.seconds, 0)
  const skippedRest = skipsFinalRepRest(s) && s.reps > 0
    ? phases.slice(workPhaseCount(phases)).reduce((sum, p) => sum + p.seconds, 0)
    : 0
  return s.reps * (paced > 0 ? paced : SEC_PER_REP) - skippedRest
}

/**
 * Flatten a routine into individual set-steps. For a superset block (2+
 * exercises), sets are interleaved round-robin — e.g. Tailor's set 1, Horse
 * set 1, Tailor's set 2, Horse set 2, … — matching how they're actually done.
 * Non-superset blocks run each exercise's sets in sequence.
 *
 * A `perSide` exercise becomes two steps per round. The starting side is pinned
 * for the session and alternates between completed sessions of the routine.
 */
export function buildFlexSteps(plan: FlexBlock[], startSide: Side = 'left'): FlexSetStep[] {
  return buildRoutineSteps(plan, startSide).filter((s): s is FlexSetStep => s.kind === 'flex')
}

/**
 * A routine's whole flow, in plan order: its stretch sets as {@link buildFlexSteps}
 * lays them out, with any loaded exercise (see FlexExercise.load) standing where
 * the plan put it as typed-in sets.
 */
export function buildRoutineSteps(plan: FlexBlock[], startSide: Side = 'left'): SessionStep[] {
  const steps: SessionStep[] = []
  plan.forEach((block, bi) => {
    /** The steps one round of one exercise is: a pair for a per-side stretch, else one. */
    const round = (ex: FlexExercise, r: number): SessionStep[] => {
      // A loaded exercise is counted and typed in, not paced: a core-kind step,
      // standing where the plan put it.
      if (ex.load) {
        return [
          {
            kind: 'core',
            blockLabel: block.label,
            exKey: ex.key,
            exName: ex.name,
            repMin: ex.load.repMin,
            repMax: ex.load.repMax,
            increment: ex.load.increment,
            weightCapLbs: ex.load.weightCapLbs,
            restSec: ex.restSec,
            round: r,
            maxSets: ex.maxSets,
            stepKey: `${bi}:${ex.key}:${r}`,
          },
        ]
      }
      const base = {
        kind: 'flex' as const,
        blockLabel: block.label,
        blockNote: block.note,
        exKey: ex.key,
        exName: ex.name,
        reps: ex.reps,
        tempo: ex.tempo,
        round: r,
        maxSets: ex.maxSets,
        ...(ex.holdSec ? { holdSec: ex.holdSec } : {}),
        ...(ex.openHold ? { openHold: true } : {}),
        ...(ex.setLabels?.[r] ? { setLabel: ex.setLabels[r] } : {}),
      }
      if (!ex.perSide) {
        return [{ ...base, restSec: ex.restSec, stepKey: `${bi}:${ex.key}:${r}` }]
      }
      // With `restAfterSides` the round's rest belongs to the second side, so the
      // first side prescribes none — which is also what earns it a side switch.
      const firstRest = ex.restAfterSides ? 0 : ex.restSec
      const switchSec = ex.sideSwitchSec ?? SIDE_SWITCH_SEC
      return ([startSide, startSide === 'left' ? 'right' : 'left'] as Side[]).map((side, index): FlexSetStep => ({
        ...base,
        side,
        restSec: index === 0 ? firstRest : ex.restSec,
        // The side the round starts on is the one a switch follows — and only
        // when no real rest already sits between the two.
        ...(index === 0 && firstRest === 0 ? { sideSwitchSec: switchSec } : {}),
        // The side is part of the identity: the two halves of a round track
        // their done-ness separately.
        stepKey: `${bi}:${ex.key}:${r}:${side}`,
      }))
    }

    if (block.superset && block.exercises.length > 1) {
      const maxRounds = Math.max(...block.exercises.map((e) => e.maxSets))
      for (let r = 0; r < maxRounds; r++) {
        for (const ex of block.exercises) if (r < ex.maxSets) steps.push(...round(ex, r))
      }
    } else {
      for (const ex of block.exercises) {
        for (let r = 0; r < ex.maxSets; r++) steps.push(...round(ex, r))
      }
    }
  })
  return steps
}

/** The core sets appended to a Stretch + Core session (see STRETCH_CORE). */
export function buildCoreSteps(): CoreSetStep[] {
  const steps: CoreSetStep[] = []
  for (let r = 0; r < STRETCH_CORE.sets; r++) {
    steps.push({
      kind: 'core',
      blockLabel: STRETCH_CORE.group,
      exKey: STRETCH_CORE.key,
      exName: STRETCH_CORE.name,
      repMin: STRETCH_CORE.repMin,
      repMax: STRETCH_CORE.repMax,
      increment: STRETCH_CORE.increment,
      restSec: STRETCH_CORE.restSec,
      round: r,
      maxSets: STRETCH_CORE.sets,
      stepKey: `core:${STRETCH_CORE.key}:${r}`,
    })
  }
  return steps
}

/**
 * The full guided flow: the mobility routine, then the core block.
 *
 * `core` is false for the second stretch of a day, whose core was already done
 * by the first (see lib/stretchCore) — which makes the last stretch set the
 * closing step.
 */
export function buildSessionSteps(
  plan: FlexBlock[],
  opts?: { core?: boolean; startSide?: Side },
): SessionStep[] {
  const core = opts?.core ?? true
  return [...buildRoutineSteps(plan, opts?.startSide), ...(core ? buildCoreSteps() : [])]
}
