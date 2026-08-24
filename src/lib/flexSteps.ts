import type { FlexBlock, FlexExercise } from '../config/flexPlan'
import { STRETCH_CORE } from '../config/plan'
import { parseTempo } from './tempo'

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
  /**
   * Seconds to reposition before the *other* side of this round, set only on the
   * step a side switch follows. A reposition rather than a rest — so it must not
   * be banked into the session's rest tally.
   */
  sideSwitchSec?: number
}

/**
 * One set of the core work appended after the mobility flow. Unlike a stretch, the
 * user enters the weight and reps performed and each set is logged as a workout row
 * (see DataContext.logCore), so it feeds the movement's own history and the charts.
 */
export type CoreSetStep = {
  kind: 'core'
  blockLabel: string
  exKey: string
  exName: string
  repMin: number
  repMax: number
  restSec: number
  round: number // 0-based set number
  maxSets: number
  stepKey: string
}

/**
 * A completed core set, as handed to DataContext.logCore: the reps done and the
 * weight they were done with, null for a set taken unloaded.
 */
export type CoreSet = { reps: number; weightLbs: number | null }

/** A step in the Stretch + Core session: a mobility set or a core set. */
export type SessionStep = FlexSetStep | CoreSetStep

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
  const paced = parseTempo(s.tempo).reduce((sum, p) => sum + p.seconds, 0)
  return s.reps * (paced > 0 ? paced : SEC_PER_REP)
}

/**
 * Flatten a routine into individual set-steps. For a superset block (2+
 * exercises), sets are interleaved round-robin — e.g. Tailor's set 1, Horse
 * set 1, Tailor's set 2, Horse set 2, … — matching how they're actually done.
 * Non-superset blocks run each exercise's sets in sequence.
 *
 * A `perSide` exercise becomes two steps per round, left then right — every
 * round, rather than trading which side leads: the whole point of taking the
 * sides one after the other is that the second one is done in the shape the
 * first one just set, and swapping the lead would only make the two legs'
 * histories harder to read against each other.
 */
export function buildFlexSteps(plan: FlexBlock[]): FlexSetStep[] {
  const steps: FlexSetStep[] = []
  plan.forEach((block, bi) => {
    /** The steps one round of one exercise is: a pair for a per-side stretch, else one. */
    const round = (ex: FlexExercise, r: number): FlexSetStep[] => {
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
        ...(ex.setLabels?.[r] ? { setLabel: ex.setLabels[r] } : {}),
      }
      if (!ex.perSide) {
        return [{ ...base, restSec: ex.restSec, stepKey: `${bi}:${ex.key}:${r}` }]
      }
      // With `restAfterSides` the round's rest belongs to the second side, so the
      // first side prescribes none — which is also what earns it a side switch.
      const leftRest = ex.restAfterSides ? 0 : ex.restSec
      const switchSec = ex.sideSwitchSec ?? SIDE_SWITCH_SEC
      return (['left', 'right'] as Side[]).map((side) => ({
        ...base,
        side,
        restSec: side === 'left' ? leftRest : ex.restSec,
        // The side the round starts on is the one a switch follows — and only
        // when no real rest already sits between the two.
        ...(side === 'left' && leftRest === 0 ? { sideSwitchSec: switchSec } : {}),
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
  opts?: { core?: boolean },
): SessionStep[] {
  const core = opts?.core ?? true
  return [...buildFlexSteps(plan), ...(core ? buildCoreSteps() : [])]
}
