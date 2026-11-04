import type { Point } from './progress'
import { daysBetween } from './dates'

/**
 * Pounds of muscle and pounds of fat put on over time, estimated from the scale.
 *
 * Each weigh-in is split by the body-fat percentage in force that day: fat mass
 * is weight × bf, and everything else — muscle, but also bone, water and the
 * glycogen a bulk carries — is lean mass, which the chart calls muscle because
 * that is what the training is putting there. Both are read as *gains* against
 * the first day the split was known, so the chart answers the question that
 * matters on a bulk: of the weight that went on, how much was muscle?
 *
 * Body fat is read far less often than weight, so between two readings it is
 * taken off the straight line joining them, and after the last reading it is
 * held flat — the newest number is the best guess until the next one. Before the
 * first reading there is nothing to split by, so those weigh-ins are left out.
 */

/** One weigh-in, split. */
export type MassPoint = {
  date: string
  /** The weigh-in the split was taken from, smoothed — see {@link smoothWeights}. */
  weight: number
  /** Body fat % in force that day: a reading, a point on the line between two, or the last one held. */
  bodyFat: number
  lean: number
  fat: number
  /** Lean and fat mass against the first point. */
  muscleGain: number
  fatGain: number
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/**
 * Body fat on `date`, read off the readings around it. Null before the first
 * reading; the last reading held flat after it.
 */
export function bodyFatOn(readings: Point[], date: string): number | null {
  if (readings.length === 0 || date < readings[0].date) return null
  for (let i = 0; i < readings.length - 1; i++) {
    const a = readings[i]
    const b = readings[i + 1]
    if (date < b.date) {
      const span = daysBetween(a.date, b.date)
      if (span <= 0) return a.value
      return a.value + ((b.value - a.value) * daysBetween(a.date, date)) / span
    }
  }
  return readings[readings.length - 1].value
}

/**
 * Each weigh-in replaced by the mean of the weigh-ins within `halfWindowDays`
 * either side of it. A morning on the scale swings a pound or two with water
 * and the night before, and split by body fat that pound all lands on the
 * muscle band — a week's average is nearer the mass that is actually there.
 */
export function smoothWeights(points: Point[], halfWindowDays = 3): Point[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  return sorted.map((p) => {
    const near = sorted.filter((q) => Math.abs(daysBetween(p.date, q.date)) <= halfWindowDays)
    return { date: p.date, value: near.reduce((s, q) => s + q.value, 0) / near.length }
  })
}

/**
 * The weigh-ins from the first body-fat reading on, each split into lean and
 * fat, with both measured as gains from the first. Empty until there is a
 * weigh-in on or after a reading.
 */
export function massPoints(weights: Point[], bodyFat: Point[]): MassPoint[] {
  const readings = [...bodyFat].sort((a, b) => a.date.localeCompare(b.date))
  const out: MassPoint[] = []
  for (const w of smoothWeights(weights)) {
    const bf = bodyFatOn(readings, w.date)
    if (bf == null) continue
    const fat = (w.value * bf) / 100
    const lean = w.value - fat
    const first = out[0]
    out.push({
      date: w.date,
      weight: round1(w.value),
      bodyFat: round1(bf),
      lean: round1(lean),
      fat: round1(fat),
      muscleGain: first ? round1(lean - first.lean) : 0,
      fatGain: first ? round1(fat - first.fat) : 0,
    })
  }
  return out
}

/**
 * The muscle-to-fat ratio of a gain, as a label: "3.2 : 1" when both went up,
 * "all muscle" or "all fat" when only one did, and nothing when neither has.
 * Shown beside the two pound figures, which say how much; this says how well.
 */
export function gainRatioLabel(muscleGain: number, fatGain: number): string {
  if (muscleGain > 0 && fatGain > 0) return `${(muscleGain / fatGain).toFixed(1)} : 1`
  if (muscleGain > 0) return 'all muscle'
  if (fatGain > 0) return 'all fat'
  return ''
}

/** A signed pound figure for a gain readout: "+4.2 lbs", "−1.3 lbs", "0 lbs". */
export function fmtGain(lbs: number): string {
  if (lbs > 0) return `+${lbs} lbs`
  if (lbs < 0) return `−${Math.abs(lbs)} lbs`
  return '0 lbs'
}
