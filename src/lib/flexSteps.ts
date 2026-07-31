import type { FlexBlock } from '../config/flexPlan'
import { DEAD_BUG } from '../config/plan'

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
 * One set of dead-bug core work appended after the mobility flow. Unlike a
 * stretch, the user enters the reps performed and each set is logged as a
 * workout row (see DataContext.logCore), so it feeds the reps progress chart.
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

/** A step in the Stretch + Core session: a mobility set or a dead-bug set. */
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

/** The dead-bug core sets appended to every Stretch + Core session. */
export function buildDeadBugSteps(): CoreSetStep[] {
  const steps: CoreSetStep[] = []
  for (let r = 0; r < DEAD_BUG.sets; r++) {
    steps.push({
      kind: 'core',
      blockLabel: DEAD_BUG.group,
      exKey: DEAD_BUG.key,
      exName: DEAD_BUG.name,
      repMin: DEAD_BUG.repMin,
      repMax: DEAD_BUG.repMax,
      restSec: DEAD_BUG.restSec,
      round: r,
      maxSets: DEAD_BUG.sets,
      stepKey: `core:${DEAD_BUG.key}:${r}`,
    })
  }
  return steps
}

/** The full guided flow: the mobility routine, then the dead-bug core block. */
export function buildSessionSteps(plan: FlexBlock[]): SessionStep[] {
  return [...buildFlexSteps(plan), ...buildDeadBugSteps()]
}

/**
 * The one photo measurement (if any) offered at a given step. The camera is only
 * worth pulling out at three moments in the routine:
 *   - `cold-split`: on the very first stretch set, to capture the cold split
 *     before any warming up.
 *   - `tailors`: on the last set of Tailor's Pose, when the hips are as open as
 *     that exercise gets them.
 *   - `warm-split`: on the last stretch set, right before the core block, to
 *     capture the warm split.
 * Returns null on every other step (and on all core steps).
 */
export type MeasureKind = 'cold-split' | 'tailors' | 'warm-split'

export function measureOpportunity(steps: SessionStep[], index: number): MeasureKind | null {
  const step = steps[index]
  if (!step || step.kind !== 'flex') return null

  const flexIdx = steps.flatMap((s, i) => (s.kind === 'flex' ? [i] : []))
  if (flexIdx.length === 0) return null
  const first = flexIdx[0]
  const last = flexIdx[flexIdx.length - 1]
  const lastTailors = [...flexIdx]
    .reverse()
    .find((i) => steps[i].exKey.toLowerCase().includes('tailor'))

  // Order matters: the cold reading owns the opening set even though it's a
  // tailor's set, and the warm reading owns the closing set.
  if (index === first) return 'cold-split'
  if (index === last) return 'warm-split'
  if (index === lastTailors) return 'tailors'
  return null
}
