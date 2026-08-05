import {
  coldSplitOf,
  coldTailorsLeftOf,
  coldTailorsRightOf,
  warmSplitOf,
  warmTailorsLeftOf,
  warmTailorsRightOf,
  type FlexEntry,
} from './flex'
import { SPLIT_GOALS, TAILORS_GOALS } from './flexPredict'
import type { MeasureResult, MeasureTemp } from './measure'

/**
 * What a freshly measured angle means next to everything already logged: the
 * move since last session, the standing best, today's cold → warm gain, and the
 * gap to the next goal. Built so the number a photo produces lands as progress
 * rather than as a bare reading.
 *
 * "Previous" always means earlier *dates*: same-day entries are the session
 * being measured, so they'd otherwise compare a reading against itself.
 */

/** The angle each row tracks — one per value a measurement can produce. */
export type AngleMetric = 'split' | 'tailorsLeft' | 'tailorsRight'

/** How many readings the trend line carries, newest reading included. */
export const TREND_POINTS = 6

export type AngleTrend = {
  metric: AngleMetric
  label: string
  temp: MeasureTemp
  /** The reading just taken. */
  value: number
  /** Newest reading of this metric/temp from an earlier date. */
  prev: { date: string; value: number } | null
  /** value − prev.value, or null with no earlier reading. */
  delta: number | null
  /** Best earlier reading of this metric/temp. */
  priorBest: number | null
  /** True when this reading beats every earlier one (needs at least one). */
  isBest: boolean
  /** Today's cold reading of the same metric — set only on a warm shot. */
  coldToday: number | null
  /** Up to {@link TREND_POINTS} readings, oldest first, ending in this one. */
  history: { date: string; value: number }[]
  /** Lowest goal this reading hasn't cleared; null once they're all cleared. */
  goal: { target: number; toGo: number } | null
}

type MetricSpec = {
  metric: AngleMetric
  label: string
  /** The MeasureResult field this metric is read from. */
  field: keyof MeasureResult
  /** Entry readers for each temp, so legacy/untagged data resolves the same
   *  way the charts resolve it. */
  read: Record<MeasureTemp, (e: FlexEntry) => number | null>
  goals: readonly number[]
}

/** Display order: the split first, then tailor's left/right. */
const METRICS: MetricSpec[] = [
  {
    metric: 'split',
    label: 'side split',
    field: 'splitDeg',
    read: { cold: coldSplitOf, warm: warmSplitOf },
    goals: SPLIT_GOALS,
  },
  {
    metric: 'tailorsLeft',
    label: "tailor's left",
    field: 'tailorsLeftDeg',
    read: { cold: coldTailorsLeftOf, warm: warmTailorsLeftOf },
    goals: TAILORS_GOALS,
  },
  {
    metric: 'tailorsRight',
    label: "tailor's right",
    field: 'tailorsRightDeg',
    read: { cold: coldTailorsRightOf, warm: warmTailorsRightOf },
    goals: TAILORS_GOALS,
  },
]

const COLD_READER: Record<AngleMetric, (e: FlexEntry) => number | null> = {
  split: coldSplitOf,
  tailorsLeft: coldTailorsLeftOf,
  tailorsRight: coldTailorsRightOf,
}

/** The lowest goal still ahead of `value`, with the degrees left to it. */
function nextGoal(goals: readonly number[], value: number): { target: number; toGo: number } | null {
  const target = [...goals].sort((a, b) => a - b).find((g) => g > value)
  return target == null ? null : { target, toGo: Math.round((target - value) * 10) / 10 }
}

/**
 * One row per angle the measurement produced (a split shot gives one, a
 * tailor's shot gives two). `today` is the ISO date the reading belongs to.
 */
export function angleTrends(
  entries: FlexEntry[],
  result: MeasureResult,
  temp: MeasureTemp,
  today: string,
): AngleTrend[] {
  const rows: AngleTrend[] = []

  for (const spec of METRICS) {
    const value = result[spec.field]
    if (value == null) continue

    const earlier: { date: string; value: number }[] = []
    for (const e of entries) {
      if (e.date >= today) continue
      const v = spec.read[temp](e)
      if (v != null) earlier.push({ date: e.date, value: v })
    }
    earlier.sort((a, b) => (a.date < b.date ? -1 : 1))

    const prev = earlier.length > 0 ? earlier[earlier.length - 1] : null
    const priorBest = earlier.length > 0 ? Math.max(...earlier.map((p) => p.value)) : null
    // A warm reading is worth reading against the cold one it started from.
    let coldToday: number | null = null
    if (temp === 'warm') {
      for (const e of entries) {
        if (e.date !== today) continue
        const v = COLD_READER[spec.metric](e)
        if (v != null) {
          coldToday = v
          break
        }
      }
    }

    rows.push({
      metric: spec.metric,
      label: spec.label,
      temp,
      value,
      prev,
      delta: prev ? Math.round((value - prev.value) * 10) / 10 : null,
      priorBest,
      isBest: priorBest != null && value > priorBest,
      coldToday,
      history: [...earlier.slice(-(TREND_POINTS - 1)), { date: today, value }],
      goal: nextGoal(spec.goals, value),
    })
  }

  return rows
}
