import {
  coldLegLiftLeftOf,
  coldLegLiftRightOf,
  coldSplitOf,
  coldTailorsLeftOf,
  coldTailorsRightOf,
  coldToeTouchOf,
  warmLegLiftLeftOf,
  warmLegLiftRightOf,
  warmSplitOf,
  warmTailorsLeftOf,
  warmTailorsRightOf,
  warmToeTouchOf,
  type FlexEntry,
} from './flex'
import { HIGHER_IS_BETTER, LOWER_IS_BETTER, bestOf, nextGoal, type MetricDir } from './flexMetrics'
import { LEG_LIFT_GOALS, SPLIT_GOALS, TAILORS_GOALS, TOE_TOUCH_GOALS } from './flexPredict'
import type { MeasureResult, MeasureTemp } from './measure'

/**
 * What a freshly measured angle means next to everything already logged: the
 * move since last session, the standing best, today's cold → warm gain, and the
 * gap to the next goal. Built so the number a photo produces lands as progress
 * rather than as a bare reading.
 *
 * "Previous" always means earlier *dates*: same-day entries are the session
 * being measured, so they'd otherwise compare a reading against itself.
 *
 * Every comparison here runs through the metric's own direction (see
 * lib/flexMetrics) rather than a bare `>`: the toe touch improves downward, so a
 * hardcoded max would report its shallowest fold as its best and its deepest one
 * as a step backwards.
 */

/** The angle each row tracks — one per value a measurement can produce. */
export type AngleMetric =
  | 'split'
  | 'tailorsLeft'
  | 'tailorsRight'
  | 'toeTouch'
  | 'legLiftLeft'
  | 'legLiftRight'

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
  /** Progress from prev.value to value — positive is an improvement whichever
   *  way the metric runs — or null with no earlier reading. */
  delta: number | null
  /** Best earlier reading of this metric/temp. */
  priorBest: number | null
  /** True when this reading beats every earlier one (needs at least one). */
  isBest: boolean
  /** Today's cold reading of the same metric — set only on a warm shot. */
  coldToday: number | null
  /** Up to {@link TREND_POINTS} readings, oldest first, ending in this one. */
  history: { date: string; value: number }[]
  /** Nearest goal this reading hasn't cleared; null once they're all cleared. */
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
  /** Which way this reading improves. Higher unless said otherwise. */
  dir?: MetricDir
}

/**
 * Display order: the side-splits poses first, then the head-to-toe ones.
 *
 * Every pose carries a ladder now (see lib/flexPredict). The fold's runs downhill,
 * which `nextGoal` handles by folding through the metric's own `beats` rather than
 * by sorting — so the rung it names is the shallowest one still ahead of a fold
 * that's closing, the same way it names the lowest one still ahead of an angle
 * that's opening.
 */
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
  {
    metric: 'toeTouch',
    label: 'toe touch',
    field: 'toeTouchDeg',
    read: { cold: coldToeTouchOf, warm: warmToeTouchOf },
    goals: TOE_TOUCH_GOALS,
    // The hip angle of a forward fold: 180° standing, 0° flat. Deeper is smaller.
    dir: LOWER_IS_BETTER,
  },
  {
    metric: 'legLiftLeft',
    label: 'left leg lift',
    field: 'legLiftLeftDeg',
    read: { cold: coldLegLiftLeftOf, warm: warmLegLiftLeftOf },
    goals: LEG_LIFT_GOALS,
  },
  {
    metric: 'legLiftRight',
    label: 'right leg lift',
    field: 'legLiftRightDeg',
    read: { cold: coldLegLiftRightOf, warm: warmLegLiftRightOf },
    goals: LEG_LIFT_GOALS,
  },
]

const COLD_READER: Record<AngleMetric, (e: FlexEntry) => number | null> = {
  split: coldSplitOf,
  tailorsLeft: coldTailorsLeftOf,
  tailorsRight: coldTailorsRightOf,
  toeTouch: coldToeTouchOf,
  legLiftLeft: coldLegLiftLeftOf,
  legLiftRight: coldLegLiftRightOf,
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
    const dir = spec.dir ?? HIGHER_IS_BETTER

    const earlier: { date: string; value: number }[] = []
    for (const e of entries) {
      if (e.date >= today) continue
      const v = spec.read[temp](e)
      if (v != null) earlier.push({ date: e.date, value: v })
    }
    earlier.sort((a, b) => (a.date < b.date ? -1 : 1))

    const prev = earlier.length > 0 ? earlier[earlier.length - 1] : null
    const priorBest = bestOf(
      earlier.map((p) => p.value),
      dir,
    )
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
      delta: prev ? Math.round(dir.gain(prev.value, value) * 10) / 10 : null,
      priorBest,
      isBest: priorBest != null && dir.beats(value, priorBest),
      coldToday,
      history: [...earlier.slice(-(TREND_POINTS - 1)), { date: today, value }],
      goal: nextGoal(spec.goals, value, dir),
    })
  }

  return rows
}
