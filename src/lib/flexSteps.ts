import type { FlexBlock } from '../config/flexPlan'
import { STRETCH_CORE } from '../config/plan'

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

/**
 * Flatten a routine into individual set-steps. For a superset block (2+
 * exercises), sets are interleaved round-robin — e.g. Tailor's set 1, Horse
 * set 1, Tailor's set 2, Horse set 2, … — matching how they're actually done.
 * Non-superset blocks run each exercise's sets in sequence.
 */
export function buildFlexSteps(plan: FlexBlock[]): FlexSetStep[] {
  const steps: FlexSetStep[] = []
  plan.forEach((block, bi) => {
    const mk = (ex: FlexBlock['exercises'][number], round: number): FlexSetStep => ({
      kind: 'flex',
      blockLabel: block.label,
      blockNote: block.note,
      exKey: ex.key,
      exName: ex.name,
      reps: ex.reps,
      tempo: ex.tempo,
      restSec: ex.restSec,
      round,
      maxSets: ex.maxSets,
      stepKey: `${bi}:${ex.key}:${round}`,
    })

    if (block.superset && block.exercises.length > 1) {
      const maxRounds = Math.max(...block.exercises.map((e) => e.maxSets))
      for (let r = 0; r < maxRounds; r++) {
        for (const ex of block.exercises) if (r < ex.maxSets) steps.push(mk(ex, r))
      }
    } else {
      for (const ex of block.exercises) {
        for (let r = 0; r < ex.maxSets; r++) steps.push(mk(ex, r))
      }
    }
  })
  return steps
}

/** The core sets appended to every Stretch + Core session (see STRETCH_CORE). */
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

/** The full guided flow: the mobility routine, then the core block. */
export function buildSessionSteps(plan: FlexBlock[]): SessionStep[] {
  return [...buildFlexSteps(plan), ...buildCoreSteps()]
}
