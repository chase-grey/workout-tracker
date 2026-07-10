import type { FlexBlock } from '../config/flexPlan'

/** One set of one stretch — the unit the guided stretch flow steps through. */
export type FlexSetStep = {
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
 * Flatten a routine into individual set-steps. For a superset block (2+
 * exercises), sets are interleaved round-robin — e.g. Tailor's set 1, Horse
 * set 1, Tailor's set 2, Horse set 2, … — matching how they're actually done.
 * Non-superset blocks run each exercise's sets in sequence.
 */
export function buildFlexSteps(plan: FlexBlock[]): FlexSetStep[] {
  const steps: FlexSetStep[] = []
  plan.forEach((block, bi) => {
    const mk = (ex: FlexBlock['exercises'][number], round: number): FlexSetStep => ({
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
