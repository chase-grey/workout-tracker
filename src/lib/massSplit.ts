import type { Point } from './progress'
import { daysBetween, weekStartISO } from './dates'

/**
 * Pounds of muscle and pounds of fat put on over time, estimated from the scale.
 *
 * Each weigh-in is split by the body-fat percentage in force that day: fat mass
 * is weight × bf, and everything else — muscle, but also bone, water and the
 * glycogen a bulk carries — is lean mass, which the chart calls muscle because
 * that is what the training is putting there. Both are read as *gains* against
 * the first week the split was known, so the chart answers the question that
 * matters on a bulk: of the weight that went on, how much was muscle?
 *
 * The split is taken week by week, not morning by morning. A weigh-in swings a
 * pound or two with water and the night before, and split by body fat that
 * pound lands wholesale on the muscle band, so a daily chart is a saw-tooth
 * that says nothing about tissue. Each week's point is the mean of its weigh-ins
 * and the mean body fat in force on those days — see {@link massPoints}.
 *
 * Body fat is read less often than weight, so between two readings it is taken
 * off the straight line joining them, and after the last reading it is held
 * flat — the newest number is the best guess until the next one. Neither is
 * stretched past {@link MAX_READING_GAP_DAYS}: a line drawn across most of a
 * year between a lone old reading and the first regular one is not evidence of
 * anything, so weigh-ins that fall in a gap that long, or before the first
 * reading, are left out, and the chart starts where the readings really do.
 */

/** The longest stretch a body-fat reading is trusted to cover, either side. */
export const MAX_READING_GAP_DAYS = 45

/** One week on the scale, split. */
export type MassPoint = {
  /** The Monday the week starts on. */
  date: string
  /** How many mornings on the scale went into the week's mean. */
  weighIns: number
  /** The week's mean weigh-in. */
  weight: number
  /** The mean body fat % in force on those mornings: readings, points on the line between two, or the last one held. */
  bodyFat: number
  lean: number
  fat: number
  /** Lean and fat mass against the first week. */
  muscleGain: number
  fatGain: number
}

const round1 = (n: number): number => Math.round(n * 10) / 10
const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length

/**
 * Body fat on `date`, read off the readings around it. Null before the first
 * reading, inside a gap between readings longer than {@link MAX_READING_GAP_DAYS},
 * or that long past the last one; the last reading held flat until then.
 */
export function bodyFatOn(readings: Point[], date: string): number | null {
  if (readings.length === 0 || date < readings[0].date) return null
  for (let i = 0; i < readings.length - 1; i++) {
    const a = readings[i]
    const b = readings[i + 1]
    if (date < b.date) {
      const span = daysBetween(a.date, b.date)
      if (span > MAX_READING_GAP_DAYS) return null
      if (span <= 0) return a.value
      return a.value + ((b.value - a.value) * daysBetween(a.date, date)) / span
    }
  }
  const last = readings[readings.length - 1]
  return daysBetween(last.date, date) > MAX_READING_GAP_DAYS ? null : last.value
}

/**
 * The weeks from the first body-fat reading on, each the mean of its weigh-ins
 * split into lean and fat, with both measured as gains from the first week. A
 * week with no weigh-in in a trusted stretch of readings is simply absent;
 * the current, part-finished week is in, averaged over the mornings it has so
 * far. Empty until there is a weigh-in on or after a reading.
 */
export function massPoints(weights: Point[], bodyFat: Point[]): MassPoint[] {
  const readings = [...bodyFat].sort((a, b) => a.date.localeCompare(b.date))
  const weeks = new Map<string, { weights: number[]; bodyFats: number[] }>()
  for (const w of [...weights].sort((a, b) => a.date.localeCompare(b.date))) {
    const bf = bodyFatOn(readings, w.date)
    if (bf == null) continue
    const key = weekStartISO(w.date)
    const week = weeks.get(key) ?? { weights: [], bodyFats: [] }
    week.weights.push(w.value)
    week.bodyFats.push(bf)
    weeks.set(key, week)
  }
  const out: MassPoint[] = []
  for (const [date, week] of weeks) {
    const weight = mean(week.weights)
    const bf = mean(week.bodyFats)
    const fat = (weight * bf) / 100
    const lean = weight - fat
    const first = out[0]
    out.push({
      date,
      weighIns: week.weights.length,
      weight: round1(weight),
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
