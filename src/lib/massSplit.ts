import type { Point } from './progress'
import { daysBetween, weekStartISO } from './dates'
import { localDiffSE, localTrend } from './fitLine'

/**
 * Pounds of muscle and pounds of fat put on over time, estimated from the scale.
 *
 * A week on the chart is that week's average: the mean of its weigh-ins, split
 * by the mean of the body-fat readings logged in it. Fat mass is weight × bf,
 * and everything else — muscle, but also bone, water and the glycogen a bulk
 * carries — is lean mass, which the chart calls muscle because that is what
 * the training is putting there. Both are read as *gains* against the first
 * week's average, so the chart answers the question that matters on a bulk: of
 * the weight that went on, how much was muscle?
 *
 * The rule is the same for every week, finished or not. The week in progress
 * is the average of what it has so far, so on Monday it is Monday's weigh-in
 * and reading, and it moves with each one logged after; once the week is over
 * its point is the average of the whole week and stays there. Earlier cuts
 * drew something else and each was sent back: a three-week trend through the
 * mornings (smooth, but it sat a pound and a half under a week of weigh-ins
 * and looked like it was waiting for the week to end), each week's last
 * weigh-in (a saw-tooth), and the newest week as its latest weigh-in alone
 * (one light Saturday morning stood for a week that averaged a pound more).
 * The cost of the average is that a week weighed lighter than the one before
 * it shows as a dip, because that is what the scale said that week.
 *
 * Each figure still carries a give-or-take, and that is still read off trends
 * (see {@link massTrend}): how far off a line through the surrounding three
 * weeks could be at that week. It is nothing at the start, where every band
 * is zero by definition, and widens as the weeks move away from it.
 *
 * Body fat is read less often than weight. A week with no reading of its own
 * takes the body fat in force on its weigh-in mornings: off the straight line
 * joining the readings either side, or the last one held flat — the newest
 * number is the best guess until the next one. Neither is stretched past
 * {@link MAX_READING_GAP_DAYS}: a line drawn across most of a year between a
 * lone old reading and the first regular one is not evidence of anything, so
 * weigh-ins that fall in a gap that long, or before the first reading, are
 * left out, and the chart starts where the readings really do.
 */

/** The longest stretch a body-fat reading is trusted to cover, either side. */
export const MAX_READING_GAP_DAYS = 45

/** One week on the scale, split: the week's own averages. */
export type MassPoint = {
  /** The Monday the week starts on. */
  date: string
  /** How many mornings on the scale went into the week's mean. */
  weighIns: number
  /** The week's mean weigh-in. */
  weight: number
  /** The mean of the body fat readings logged in the week, or with none, of the body fat in force on its weigh-in mornings. */
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

/** A week's averages, unrounded. */
type Week = {
  /** The Monday the week starts on. */
  date: string
  weighIns: number
  /** How many days past that Monday the week's weigh-ins fall, on average. */
  offset: number
  weight: number
  bodyFat: number
  lean: number
  fat: number
}

/**
 * The weeks from the first body-fat reading on, each the average of what was
 * logged in it. The weight is the mean of the week's weigh-ins. The body fat
 * is the mean of the readings logged that week, whether or not a weigh-in
 * came with them; a week with no reading takes the mean of the body fat in
 * force on its weigh-in mornings instead (see {@link bodyFatOn}). A week with
 * no weigh-in in a trusted stretch of readings is absent.
 */
function weeklyAverages(weights: Point[], bodyFat: Point[]): Week[] {
  const readings = [...bodyFat].sort((a, b) => a.date.localeCompare(b.date))
  const logged = new Map<string, number[]>()
  for (const r of readings) {
    const key = weekStartISO(r.date)
    logged.set(key, [...(logged.get(key) ?? []), r.value])
  }
  const weeks = new Map<string, { weights: number[]; inForce: number[]; offsets: number[] }>()
  for (const w of [...weights].sort((a, b) => a.date.localeCompare(b.date))) {
    const bf = bodyFatOn(readings, w.date)
    if (bf == null) continue
    const key = weekStartISO(w.date)
    const week = weeks.get(key) ?? { weights: [], inForce: [], offsets: [] }
    week.weights.push(w.value)
    week.inForce.push(bf)
    week.offsets.push(daysBetween(key, w.date))
    weeks.set(key, week)
  }
  return [...weeks].map(([date, week]) => {
    const weight = mean(week.weights)
    const bf = mean(logged.get(date) ?? week.inForce)
    const fat = (weight * bf) / 100
    return {
      date,
      weighIns: week.weights.length,
      offset: mean(week.offsets),
      weight,
      bodyFat: bf,
      lean: weight - fat,
      fat,
    }
  })
}

/**
 * The weeks from the first body-fat reading on, each the average of its
 * weigh-ins split by the average of its body fat, with lean and fat measured
 * as gains from the first week. The current, part-finished week is in,
 * averaged over what it has so far. Empty until there is a weigh-in on or
 * after a reading.
 */
export function massPoints(weights: Point[], bodyFat: Point[]): MassPoint[] {
  const weeks = weeklyAverages(weights, bodyFat)
  const first = weeks[0]
  return weeks.map((w) => ({
    date: w.date,
    weighIns: w.weighIns,
    weight: round1(w.weight),
    bodyFat: round1(w.bodyFat),
    lean: round1(w.lean),
    fat: round1(w.fat),
    muscleGain: round1(w.lean - first.lean),
    fatGain: round1(w.fat - first.fat),
  }))
}

/**
 * How many standard errors each edge's give-or-take is drawn, either side.
 * One, not the two of a confidence interval: the dashes are there to show how
 * much to trust the shape, and at two the fan swallowed the stack it was
 * qualifying for the first two months.
 */
export const BAND_ERROR_SE = 1

/** Days either side of a date the give-or-takes' trends weigh the weigh-ins and readings over — see fitLine.localTrend. */
export const TREND_HALF_WIDTH_DAYS = 21

/** One week on the chart: its average weight, and how that splits. */
export type MassTrendPoint = {
  /** The Monday the week starts on. */
  date: string
  /** How many weigh-ins the week's average is of. */
  weighIns: number
  /** The week's average weigh-in, lbs — the top of the stack — and its average body fat, %. */
  weight: number
  bodyFat: number
  /** Lean and fat put on, against the first week's average. */
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
  /** The first week's average weight, lbs: the floor the bands stand on. */
  startWeight: number
  /** Pounds a week put on between the first week's average and the newest's, in all, as lean, and as fat; the last two sum to the first. */
  weightPerWeek: number
  leanPerWeek: number
  fatPerWeek: number
  /** Standard error on `fatPerWeek`. */
  fatPerWeekSE: number
  /** How many weigh-ins and body-fat readings the give-or-takes rest on. */
  weighIns: number
  readings: number
}

/**
 * The chart's weeks: each one its own average (see {@link massPoints}), the
 * week in progress included, with gains measured from the first week's
 * average, a give-or-take on every figure, and the rates the grade reads.
 *
 * The rates run between the same two ends as the header's figures, the first
 * week's average and the newest week's, over the time between where each
 * week's weigh-ins fell. So the grade under the chart is the same bulk as the
 * figures over it, and both move when something is logged this week.
 *
 * Only the give-or-takes come off trends. A local line (see
 * {@link localTrend}) is run through every weigh-in in the span and another
 * through the readings, each weighing the points within
 * {@link TREND_HALF_WIDTH_DAYS} either side, and each week's doubt is the
 * error on the difference between two readings of those lines: at the mean
 * date of that week's weigh-ins, and at the first week's. Readings of a trend
 * share the mornings they were made from, so the doubt is nothing at the
 * start and grows as the weeks stop overlapping. The weight's is the doubt
 * about the top of the stack. The fat's is the doubt about its own figure:
 * the body-fat slope's error scaled by the weight and the weight's scaled by
 * the body fat, in quadrature. The muscle's is the same sum with the weight's
 * error scaled by the lean share instead — the lean is the rest of the
 * weight, so it owns most of the weight's doubt, and the muscle figure is
 * always the less sure of the two. The seam between the bands is drawn with
 * the fat's: given the top, that is how far the split could move it.
 *
 * Each trend needs three points, and the chart two weeks to have a span;
 * under that the caller shows nothing. The name is from when the bands
 * themselves were the trends.
 */
export function massTrend(weights: Point[], bodyFat: Point[]): MassTrend | null {
  const weeks = weeklyAverages(weights, bodyFat)
  if (weeks.length < 2) return null
  const readings = [...bodyFat].sort((a, b) => a.date.localeCompare(b.date))
  const origin = weeks[0].date
  const x = (date: string) => daysBetween(origin, date)

  // The weigh-ins the weeks were made of: those with a body fat in force.
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
  const lastDay = weeks[weeks.length - 1].date
  const governing = [...readings].reverse().find((r) => r.date <= firstDay) ?? readings[0]
  const inSpan = readings.filter((r) => r.date >= governing.date && daysBetween(lastDay, r.date) <= 6)
  const fatTrend = localTrend(
    inSpan.map((r) => x(r.date)),
    inSpan.map((r) => r.value),
    TREND_HALF_WIDTH_DAYS,
  )
  if (!fatTrend) return null

  // Where a week's weigh-ins fell, on average, in days from the first Monday.
  const mid = (w: Week) => x(w.date) + w.offset

  const read = (day: number) => {
    const w = weightTrend.at(day)
    const b = fatTrend.at(day)
    return { w, b, weight: w.value, bodyFat: b.value }
  }
  const first = weeks[0]
  const newest = weeks[weeks.length - 1]
  const start = read(mid(first))

  const errors = (week: Week) => {
    const here = read(mid(week))
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

  const points: MassTrendPoint[] = weeks.map((week) => {
    const se = errors(week)
    return {
      date: week.date,
      weighIns: week.weighIns,
      weight: round1(week.weight),
      bodyFat: round1(week.bodyFat),
      muscleGain: round1(week.lean - first.lean),
      fatGain: round1(week.fat - first.fat),
      weightError: round1(BAND_ERROR_SE * se.weightSE),
      muscleError: round1(BAND_ERROR_SE * se.muscleSE),
      fatError: round1(BAND_ERROR_SE * se.fatSE),
    }
  })

  const spanWeeks = (mid(newest) - mid(first)) / 7
  const perWeek = (n: number) => (spanWeeks > 0 ? n / spanWeeks : 0)
  const weightPerWeek = perWeek(newest.weight - first.weight)
  const fatPerWeek = perWeek(newest.fat - first.fat)
  return {
    points,
    days: daysBetween(first.date, newest.date),
    startWeight: round1(first.weight),
    weightPerWeek: round2(weightPerWeek),
    leanPerWeek: round2(weightPerWeek - fatPerWeek),
    fatPerWeek: round2(fatPerWeek),
    fatPerWeekSE: round2(perWeek(errors(newest).fatSE)),
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
