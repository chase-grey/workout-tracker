import { workoutSplit, type ExerciseAverages, type RemainingStep, type WorkoutSplit } from './estimate'
import { stepWorkSec, SEC_PER_REP, type SessionStep } from './flexSteps'
import { settleInSec } from './settleIn'
import { restScreenSec } from './rest'
import { parseTempo } from './tempo'

export type TimingRow = WorkoutSplit & { key: string; label: string; source: string }
export type TimingStep = RemainingStep & { key: string; label: string; setupSec?: number; fallbackExercise?: string; fixedActiveSec?: number; fixedRestSec?: number }

export function sumTiming(rows: WorkoutSplit[]): WorkoutSplit {
  return rows.reduce((sum, row) => ({ activeSec: sum.activeSec + row.activeSec, restSec: sum.restSec + row.restSec, totalSec: sum.totalSec + row.totalSec }), { activeSec: 0, restSec: 0, totalSec: 0 })
}

export function workoutTimingKey(exercise: string, reps: number): string {
  return `workout:${exercise}:reps:${reps}`
}

/** Stretch samples are scoped to the prescription so changing reps/holds does not reuse an old duration. */
export function stretchTimingKey(step: SessionStep, workSec: number): string {
  return `stretch:${step.exKey}:${workSec}`
}

export function priceStretchFlow(flow: SessionStep[], coreRepsFor: (round: number) => number, fast = false): TimingStep[] {
  return flow.map((step, i) => {
    const next = flow[i + 1]
    const work = step.kind === 'flex' ? stepWorkSec(step) : coreRepsFor(step.round) * SEC_PER_REP
    const rest = !next || (step.kind === 'flex' && next.kind === 'core') ? 0
      : restScreenSec(step.restSec, settleInSec(next, step))
    const prev = flow[i - 1]
    const previousRest = prev ? restScreenSec(prev.restSec, settleInSec(step, prev)) : 0
    return {
      key: step.stepKey,
      label: `${step.exName} · set ${step.round + 1}${step.kind === 'flex' && step.side ? ` · ${step.side}` : ''}`,
      exercise: stretchTimingKey(step, work),
      fallbackActiveSec: work,
      fixedActiveSec: step.kind === 'flex' && (step.holdSec || parseTempo(step.tempo).some((phase) => phase.seconds > 0)) ? work : undefined,
      fixedRestSec: step.kind === 'flex' ? rest : undefined,
      setupSec: fast && previousRest <= 0 ? 0 : settleInSec(step, prev),
      prescribedRestSec: rest,
    }
  })
}

/** One source for the headline and every row, including the rest currently on screen. */
export function remainingTiming(averages: ExerciseAverages, steps: TimingStep[], elapsedSec = 0, currentRestSec = 0): TimingRow[] {
  const rows: TimingRow[] = []
  if (currentRestSec > 0) rows.push({ key: 'current-rest', label: 'Current rest', source: 'Remaining countdown', activeSec: 0, restSec: currentRestSec, totalSec: currentRestSec })
  steps.forEach((step, index) => {
    const exercise = averages.active[step.exercise]?.n > 0 ? step.exercise : step.fallbackExercise ?? step.exercise
    const split = workoutSplit(averages, [{ ...step, exercise }])
    if (step.fixedActiveSec != null) split.activeSec = step.fixedActiveSec
    if (step.fixedRestSec != null) split.restSec = step.fixedRestSec
    const activeSec = Math.max(0, split.activeSec - (index === 0 ? elapsedSec : 0)) + (step.setupSec ?? 0)
    const n = averages.active[exercise]?.n ?? 0
    rows.push({ ...split, activeSec, totalSec: activeSec + split.restSec, key: step.key, label: step.label,
      source: step.fixedActiveSec != null ? 'Prescribed duration' : n > 0 ? `Average of ${n} recorded sets${exercise !== step.exercise ? ' · mixed rep counts' : ''}` : 'Prescribed pace / default estimate' })
  })
  return rows
}
