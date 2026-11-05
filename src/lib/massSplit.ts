import type { Point } from './progress'
import { daysBetween, weekStartISO } from './dates'
import { localDiffSE, localTrend } from './fitLine'

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
 * a saw-tooth that said nothing about tissue. So a trend is run through the
 * weigh-ins and another through the body-fat readings, and the muscle and fat
 * bands come off the two (see {@link massTrend}). Each trend is a line fitted
 * locally, through the three weeks around each day, rather than one line ruled
 * across the whole span: the whole-span line ended wherever the average of
 * the months put it, which after a fast fortnight was two pounds under the
 * scale, and a chart of weight that does not end at your weight is not one.
 *
 * A fit also says how sure it is. Each edge of the stack carries a
 * give-or-take, a standard error each way, drawn as a dashed line either side
 * of it: the top could be as high or low as the mornings' scatter allows, and
 * the seam between the tissues as high or low as the readings' scatter puts
 * it. Both are nothing at the start (every band begins at zero) and widen as
 * the weeks move away from it — the chart's own way of saying it is not
 * accurate down to the week.
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

/**
 * How many standard errors each edge's give-or-take is drawn, either side.
 * One, not the two of a confidence interval: the dashes are there to show how
 * much to trust the shape, and at two the fan swallowed the stack it was
 * qualifying for the first two months.
 */
export const BAND_ERROR_SE = 1

/** Days either side of a date the trends weigh the weigh-ins and readings over — see fitLine.localTrend. */
export const TREND_HALF_WIDTH_DAYS = 21

/** One week on the chart: where the trends put the weight and its split that week. */
export type MassTrendPoint = {
  /** The Monday the week starts on. */
  date: string
  weighIns: number
  /** The weight trend that week, lbs — the top of the stack — and the body-fat trend, %. */
  weight: number
  bodyFat: number
  /** Lean and fat put on by the trends, against where they started. */
  muscleGain: number
  fatGain: number
  /**
   * Pounds either side, {@link BAND_ERROR_SE} standard errors: where the top
   * of the stack could really be, and how far off each tissue's figure could
   * be. The muscle's is the larger of the two — it is the rest of the weight,
   * so it carries most of the weight's doubt and all of the split's.
   */
  weightError: number
  muscleError: number
  fatError: number
}

export type MassTrend = {
  points: MassTrendPoint[]
  /** From the first week's Monday to the last's. */
  days: number
  /** The weight trend where the span starts, lbs: the floor the bands stand on. */
  startWeight: number
  /** Pounds a week the trend has put on over the span in all, as lean, and as fat; the last two sum to the first. */
  weightPerWeek: number
  leanPerWeek: number
  fatPerWeek: number
  /** Standard error on `fatPerWeek`. */
  fatPerWeekSE: number
  /** How many weigh-ins and body-fat readings the two trends rest on. */
  weighIns: number
  readings: number
}

/**
 * Trends through the weigh-ins and the body-fat readings over the span the
 * weekly points cover, and the muscle and fat bands read off them.
 *
 * Each trend is a local line (see {@link localTrend}): at any day, a straight
 * line through the points within {@link TREND_HALF_WIDTH_DAYS} either side,
 * weighted by nearness, read at that day. So the trend bends with the data
 * over the weeks, and at the newest week it is a line through the latest
 * three weeks of mornings, read at the end — where the scale has been lately,
 * not where a line ruled over the whole span would have it after a fast
 * fortnight. Weight is fitted on every morning in the span, not on the weekly
 * means, so a week of eight weigh-ins counts for more than a week of one.
 * Body fat is fitted on the readings themselves, from the one in force at the
 * first weigh-in to the last. Each trend needs three points, and the chart two
 * weeks to have a span; under that there is no trend yet and the caller shows
 * nothing.
 *
 * At each week the trends are read at the mean date of that week's weigh-ins,
 * fat is weight × body fat, lean the rest, and both are gains against the
 * trends at the first week. Give-or-takes come with them, each built from the
 * error on the difference between two readings of a trend — readings that
 * share the mornings they were made from, so it is nothing at the start and
 * grows as the weeks stop overlapping. The weight's is the doubt about the top
 * of the stack. The fat's is the doubt about its own figure: the body-fat
 * slope's error scaled by the weight and the weight's scaled by the body fat,
 * in quadrature. The muscle's is the same sum with the weight's error scaled
 * by the lean share instead — the lean is the rest of the weight, so it owns
 * most of the weight's doubt, and the muscle figure is always the less sure
 * of the two. The seam between the bands is still drawn with the fat's: given
 * the top, that is how far the split could move it.
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
  const weightTrend = localTrend(
    used.map((w) => x(w.date)),
    used.map((w) => w.value),
    TREND_HALF_WIDTH_DAYS,
  )
  if (!weightTrend) return null

  // The readings from the one governing the first weigh-in to the end of the last week.
  const firstDay = used[0].date
  const lastDay = points[points.length - 1].date
  const governing = [...readings].reverse().find((r) => r.date <= firstDay) ?? readings[0]
  const inSpan = readings.filter((r) => r.date >= governing.date && daysBetween(lastDay, r.date) <= 6)
  const fatTrend = localTrend(
    inSpan.map((r) => x(r.date)),
    inSpan.map((r) => r.value),
    TREND_HALF_WIDTH_DAYS,
  )
  if (!fatTrend) return null

  // Each week is read where its weigh-ins were, on average, not at its Monday.
  const daySum = new Map<string, number>()
  for (const w of used) {
    const key = weekStartISO(w.date)
    daySum.set(key, (daySum.get(key) ?? 0) + x(w.date))
  }
  const mid = (p: MassPoint) => (daySum.get(p.date) ?? x(p.date)) / p.weighIns

  const read = (day: number) => {
    const w = weightTrend.at(day)
    const b = fatTrend.at(day)
    const fat = (w.value * b.value) / 100
    return { w, b, weight: w.value, bodyFat: b.value, fat, lean: w.value - fat }
  }
  const startDay = mid(points[0])
  const start = read(startDay)

  const errors = (here: ReturnType<typeof read>) => {
    const weightSE = localDiffSE(weightTrend, here.w, start.w)
    const bfSE = localDiffSE(fatTrend, here.b, start.b) / 100
    const bf = (here.bodyFat + start.bodyFat) / 200
    const weight = (here.weight + start.weight) / 2
    return {
      weightSE,
      muscleSE: Math.hypot((1 - bf) * weightSE, weight * bfSE),
      fatSE: Math.hypot(bf * weightSE, weight * bfSE),
    }
  }

  const out: MassTrendPoint[] = points.map((p) => {
    const here = read(mid(p))
    const se = errors(here)
    return {
      date: p.date,
      weighIns: p.weighIns,
      weight: round1(here.weight),
      bodyFat: round1(here.bodyFat),
      muscleGain: round1(here.lean - start.lean),
      fatGain: round1(here.fat - start.fat),
      weightError: round1(BAND_ERROR_SE * se.weightSE),
      muscleError: round1(BAND_ERROR_SE * se.muscleSE),
      fatError: round1(BAND_ERROR_SE * se.fatSE),
    }
  })

  const first = out[0]
  const last = out[out.length - 1]
  const end = read(mid(points[points.length - 1]))
  const spanWeeks = (mid(points[points.length - 1]) - startDay) / 7
  const perWeek = (n: number) => (spanWeeks > 0 ? n / spanWeeks : 0)
  const weightPerWeek = perWeek(end.weight - start.weight)
  const fatPerWeek = perWeek(end.fat - start.fat)
  return {
    points: out,
    days: daysBetween(first.date, last.date),
    startWeight: round1(start.weight),
    weightPerWeek: round2(weightPerWeek),
    leanPerWeek: round2(weightPerWeek - fatPerWeek),
    fatPerWeek: round2(fatPerWeek),
    fatPerWeekSE: round2(perWeek(errors(end).fatSE)),
    weighIns: weightTrend.n,
    readings: fatTrend.n,
  }
}

/**
 * Where each band's far edge sits above the start, in the stack the chart
 * draws: gains pile up from the start weight, muscle first, and losses hang
 * below it the same way, so the seam is always the muscle band's far edge and
 * `top` the fat band's — the top of the whole stack when both went the same
 * way, the fat's own far edge when they did not.
 */
export function bandEdges(p: { muscleGain: number; fatGain: number }): { seam: number; top: number } {
  const floor = p.fatGain >= 0 ? Math.max(0, p.muscleGain) : Math.min(0, p.muscleGain)
  return { seam: p.muscleGain, top: floor + p.fatGain }
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
