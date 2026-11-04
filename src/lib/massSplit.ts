import type { Point } from './progress'
import { daysBetween, weekStartISO } from './dates'
import { fitLine, lineAt } from './fitLine'

/**
 * Pounds of muscle and pounds of fat put on over time, estimated from the scale.
 *
 * Each weigh-in is split by the body-fat percentage in force that day: fat mass
 * is weight × bf, and everything else — muscle, but also bone, water and the
 * glycogen a bulk carries — is lean mass, which the chart calls muscle because
 * that is what the training is putting there. Both are read as *gains* against
 * where the split started, so the chart answers the question that matters on a
 * bulk: of the weight that went on, how much was muscle?
 *
 * The bands are drawn from trends, not from the weeks themselves. A weigh-in
 * swings a pound or two with water and the night before, a scale's body-fat
 * reading swings half a point on its own, and split one by the other a week's
 * mean still lands a pound wholesale on the muscle band — a weekly chart was
 * a saw-tooth that said nothing about tissue. So a straight line is fitted
 * through the weigh-ins and another through the body-fat readings over the
 * whole span, and the muscle and fat bands come off the two lines (see
 * {@link massTrend}). The weeks' own means stay on the chart as dots under the
 * bands — that is the evidence; the bands are the reading of it.
 *
 * A fit also says how sure it is. The seam between the two bands sits wherever
 * the body-fat line puts it, and a short, noisy run of readings puts it almost
 * anywhere, so each point carries a give-or-take on the seam, two standard
 * errors wide, drawn as a haze between the tissues. It is nothing at the start
 * (both bands begin at zero) and widens with the span, fast while there are few
 * readings and slower as they pile up — the chart's own way of saying it is not
 * accurate down to the week, and when it has become so.
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

/** One week on the scale, split: the week's own means, before any trend. */
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
const round2 = (n: number): number => Math.round(n * 100) / 100
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
 * split into lean and fat, with both measured as gains from the first week —
 * the raw weekly evidence that {@link massTrend} fits its lines through. A
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

/** How many standard errors wide the seam's give-or-take is drawn, each side. */
export const SEAM_ERROR_SE = 2

/** One week on the chart: the trend's split that week, and the week's own means under it. */
export type MassTrendPoint = {
  /** The Monday the week starts on. */
  date: string
  weighIns: number
  /** The week's mean weigh-in and mean body fat in force — see {@link MassPoint}. */
  weight: number
  bodyFat: number
  /** Lean and fat put on by the trend lines, against where they started. */
  muscleGain: number
  fatGain: number
  /** Pounds either side of `muscleGain` the seam between the bands could really sit, {@link SEAM_ERROR_SE} standard errors. */
  seamError: number
  /** The week's own mean, split, against the same start: the dots under the bands. */
  weekMuscleGain: number
  weekTotalGain: number
}

export type MassTrend = {
  points: MassTrendPoint[]
  /** From the first week's Monday to the last's. */
  days: number
  /** The weight line where the span starts, lbs. */
  startWeight: number
  /** Pounds a week the trend puts on in all, as lean, and as fat; the last two sum to the first. */
  weightPerWeek: number
  leanPerWeek: number
  fatPerWeek: number
  /** Standard error on `fatPerWeek` — and, mirrored, on `leanPerWeek`, since the two share a well-known total. */
  fatPerWeekSE: number
  /** How many weigh-ins and body-fat readings the two lines rest on. */
  weighIns: number
  readings: number
}

/**
 * Straight-line trends through the weigh-ins and the body-fat readings over the
 * span the weekly points cover, and the muscle and fat bands read off them.
 *
 * Weight is fitted on every morning in the span, not on the weekly means, so a
 * week of eight weigh-ins counts for more than a week of one, and the fit's
 * standard error reflects the mornings it really has. Body fat is fitted on the
 * readings themselves, from the one in force at the first weigh-in to the last.
 * Each line needs three points to have anything to say about its own scatter,
 * and the chart needs two weeks to have a span, so under that there is no trend
 * yet and the caller shows nothing.
 *
 * At each week the lines are read at the mean date of that week's weigh-ins,
 * fat is weight × body fat, lean the rest, and both are gains against the lines
 * at the first week. The give-or-take on the seam is the uncertainty of the fat
 * gain over that stretch: the body-fat slope's error scaled by the weight, and
 * the weight slope's error scaled by the body fat, added in quadrature and
 * stretched over the days since the start.
 */
export function massTrend(weights: Point[], bodyFat: Point[]): MassTrend | null {
  const points = massPoints(weights, bodyFat)
  if (points.length < 2) return null
  const readings = [...bodyFat].sort((a, b) => a.date.localeCompare(b.date))
  const origin = points[0].date
  const x = (date: string) => daysBetween(origin, date)

  // The weigh-ins the weekly points were made of: those with a body fat in force.
  const used = [...weights]
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((w) => bodyFatOn(readings, w.date) != null)
  const weightFit = fitLine(
    used.map((w) => x(w.date)),
    used.map((w) => w.value),
  )
  if (!weightFit) return null

  // The readings from the one governing the first weigh-in to the end of the last week.
  const firstDay = used[0].date
  const lastDay = points[points.length - 1].date
  const governing = [...readings].reverse().find((r) => r.date <= firstDay) ?? readings[0]
  const inSpan = readings.filter((r) => r.date >= governing.date && daysBetween(lastDay, r.date) <= 6)
  const fatFit = fitLine(
    inSpan.map((r) => x(r.date)),
    inSpan.map((r) => r.value),
  )
  if (!fatFit) return null

  // Each week is read where its weigh-ins were, on average, not at its Monday.
  const daySum = new Map<string, number>()
  for (const w of used) {
    const key = weekStartISO(w.date)
    daySum.set(key, (daySum.get(key) ?? 0) + x(w.date))
  }
  const mid = (p: MassPoint) => (daySum.get(p.date) ?? x(p.date)) / p.weighIns

  const split = (day: number) => {
    const weight = lineAt(weightFit, day)
    const fat = (weight * lineAt(fatFit, day)) / 100
    return { weight, fat, lean: weight - fat }
  }
  const startDay = mid(points[0])
  const start = split(startDay)
  // Pounds of fat per day the two slopes' errors are worth, combined.
  const fatPerDaySE = Math.hypot((fatFit.meanY / 100) * weightFit.slopeSE, (weightFit.meanY / 100) * fatFit.slopeSE)

  const out: MassTrendPoint[] = points.map((p) => {
    const day = mid(p)
    const here = split(day)
    return {
      date: p.date,
      weighIns: p.weighIns,
      weight: p.weight,
      bodyFat: p.bodyFat,
      muscleGain: round1(here.lean - start.lean),
      fatGain: round1(here.fat - start.fat),
      seamError: round1(SEAM_ERROR_SE * (day - startDay) * fatPerDaySE),
      weekMuscleGain: round1(p.lean - start.lean),
      weekTotalGain: round1(p.weight - start.weight),
    }
  })

  const first = out[0]
  const last = out[out.length - 1]
  const spanWeeks = (mid(points[points.length - 1]) - startDay) / 7
  const fatPerWeek = spanWeeks > 0 ? (last.fatGain - first.fatGain) / spanWeeks : 0
  const weightPerWeek = weightFit.slope * 7
  return {
    points: out,
    days: daysBetween(first.date, last.date),
    startWeight: round1(start.weight),
    weightPerWeek: round2(weightPerWeek),
    leanPerWeek: round2(weightPerWeek - fatPerWeek),
    fatPerWeek: round2(fatPerWeek),
    fatPerWeekSE: round2(fatPerDaySE * 7),
    weighIns: weightFit.n,
    readings: fatFit.n,
  }
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
