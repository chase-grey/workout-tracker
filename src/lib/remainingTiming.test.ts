import { describe, expect, it } from 'vitest'
import { EMPTY_EXERCISE_AVERAGES } from './estimate'
import { buildCoreSteps, buildFlexSteps, stepWorkSec } from './flexSteps'
import { DEFAULT_FLEX_ROUTINE } from '../config/flexPlan'
import { remainingFlow } from './setFlow'
import { priceStretchFlow, remainingTiming, sumTiming, workoutTimingKey } from './remainingTiming'

describe('remaining checklist timing', () => {
  it('uses prescribed holds, paced reps and stretch rests regardless of history', () => {
    const paced = buildFlexSteps(DEFAULT_FLEX_ROUTINE).find((s) => s.exKey === 'pancake_hang')!
    const held = { ...paced, stepKey: 'held', holdSec: 90 }
    const priced = priceStretchFlow([held, paced], () => 10)
    const averages = {
      active: Object.fromEntries(priced.map((s) => [s.exercise, { avgSec: 200, n: 10 }])),
      restRatio: { ratio: 0.5, n: 10 },
    }
    const rows = remainingTiming(averages, priced, 20, 12)
    expect(rows).toEqual(remainingTiming(EMPTY_EXERCISE_AVERAGES, priced, 20, 12))
    expect(rows[1].activeSec).toBe(70 + priced[0].setupSec!)
    expect(rows[1].source).toBe('Prescribed duration')
    expect(rows[2].restSec).toBe(0)
  })

  it('still learns untimed core sets and stretches without a prescribed pace', () => {
    const unpaced = { ...buildFlexSteps(DEFAULT_FLEX_ROUTINE)[0], tempo: '', holdSec: undefined }
    const priced = priceStretchFlow([unpaced, buildCoreSteps()[0]], () => 10)
    const averages = {
      active: Object.fromEntries(priced.map((s) => [s.exercise, { avgSec: 75, n: 3 }])),
      restRatio: { ratio: 1, n: 0 },
    }
    const rows = remainingTiming(averages, priced)
    rows.forEach((row, i) => {
      expect(row.activeSec).toBe(75 + priced[i].setupSec!)
      expect(row.source).toBe('Average of 3 recorded sets')
    })
  })

  it('prices the last rep of the final pancake hang, with no phantom final rest', () => {
    const steps = buildFlexSteps(DEFAULT_FLEX_ROUTINE)
    const last = steps.at(-1)!
    expect(last.exKey).toBe('pancake_hang')
    const priced = priceStretchFlow([last], () => 10)
    priced[0].setupSec = 0
    const rows = remainingTiming(EMPTY_EXERCISE_AVERAGES, priced, stepWorkSec(last) - 10)
    expect(sumTiming(rows)).toEqual({ activeSec: 10, restSec: 0, totalSec: 10 })
  })

  it('adds the current rest exactly once and learns each exercise separately', () => {
    const rows = remainingTiming({ active: { a: { avgSec: 30, n: 5 }, b: { avgSec: 70, n: 2 } }, restRatio: { ratio: 0.5, n: 4 } }, [
      { key: '1', label: 'A', exercise: 'a', fallbackActiveSec: 40, prescribedRestSec: 50, setupSec: 5 },
      { key: '2', label: 'B', exercise: 'b', fallbackActiveSec: 40, prescribedRestSec: 0, setupSec: 5 },
    ], 10, 12)
    expect(rows.map((r) => r.totalSec)).toEqual([12, 50, 75])
    expect(sumTiming(rows)).toEqual({ activeSec: 100, restSec: 37, totalSec: 137 })
  })

  it('prefers matching reps, retains broad history as a labeled fallback, and honors hold targets', () => {
    const key = workoutTimingKey('lift', 8)
    const averages = { active: { lift: { avgSec: 80, n: 10 }, [key]: { avgSec: 35, n: 2 } }, restRatio: { ratio: 1, n: 0 } }
    const base = { key: '1', label: 'Lift', exercise: key, fallbackExercise: 'lift', fallbackActiveSec: 40, prescribedRestSec: 0 }
    expect(remainingTiming(averages, [base])[0].activeSec).toBe(35)
    const fallback = remainingTiming(averages, [{ ...base, exercise: workoutTimingKey('lift', 12) }])[0]
    expect(fallback.activeSec).toBe(80)
    expect(fallback.source).toContain('mixed rep counts')
    expect(remainingTiming(averages, [{ ...base, fixedActiveSec: 30 }], 20)[0].totalSec).toBe(10)
  })

  it('counts every unfinished set in actual jump/wrap order and removes completed items', () => {
    const steps = buildFlexSteps(DEFAULT_FLEX_ROUTINE)
    const done = steps.map((_, i) => i !== 0 && i !== steps.length - 1)
    const flow = remainingFlow(done, steps.length - 1).filter((i) => !done[i]).map((i) => steps[i])
    const rows = remainingTiming(EMPTY_EXERCISE_AVERAGES, priceStretchFlow(flow, () => 10))
    expect(rows.map((r) => r.key)).toEqual([steps.at(-1)!.stepKey, steps[0].stepKey])
    expect(rows.at(-1)!.restSec).toBe(0)
    expect(sumTiming(remainingTiming(EMPTY_EXERCISE_AVERAGES, []))).toEqual({ activeSec: 0, restSec: 0, totalSec: 0 })
  })

  it('takes positioning out of the prescribed rest instead of adding it twice', () => {
    const steps = buildFlexSteps(DEFAULT_FLEX_ROUTINE).filter((s) => s.exKey === 'pancake_hang').slice(0, 2)
    const rows = remainingTiming(EMPTY_EXERCISE_AVERAGES, priceStretchFlow(steps, () => 10))
    expect(sumTiming(rows)).toEqual({ activeSec: 130, restSec: 55, totalSec: 185 })
  })

  it('clamps overtime and expired rest without subtracting future work', () => {
    const steps = buildFlexSteps(DEFAULT_FLEX_ROUTINE).slice(-2)
    const priced = priceStretchFlow(steps, () => 10)
    priced[0].setupSec = 0
    const rows = remainingTiming(EMPTY_EXERCISE_AVERAGES, priced, 1000, -1)
    expect(rows[0].activeSec).toBe(0)
    expect(rows[1].activeSec).toBe(65)
  })
})
