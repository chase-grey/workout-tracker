import type { MassTrend } from './massSplit'

/**
 * The whole body on the scale, in three parts: fat, skeletal muscle, and the
 * rest — bone, organs, blood, skin, gut, and the water none of those count as
 * muscle. The scale gives the first split honestly: fat is weight × body fat,
 * and everything else is fat-free. The second split it cannot give at all. No
 * reading we take says how much of the fat-free mass is muscle, so that part
 * is a population estimate — Lee et al. 2000 (Am J Clin Nutr 72:796), a line
 * fitted through MRI-measured whole-body skeletal muscle against height,
 * weight, age and sex. It is good to {@link SKELETAL_MUSCLE_SEE_KG} either
 * way, a standard error, on a body it has never seen; the chart draws that
 * doubt on the seam, where it belongs, so the three bands read as what they
 * are: one measured line and one guessed one.
 *
 * The guess is made once, on the first week's average, and from it the rest of
 * the body is taken: fat-free mass less the muscle the equation puts there.
 * That remainder is then held fixed across the span, and each week's muscle
 * is whatever fat-free mass is left over it. Bone and organs do not move in
 * the months a chart covers; what does move in the fat-free mass is muscle and
 * the water and glycogen that come with it, which is exactly what the muscle
 * vs fat chart already calls muscle. Running the equation afresh each week
 * would have done the opposite — its weight term hands a quarter of every
 * pound gained to muscle whether the pound was fat or not — and the two charts
 * would have disagreed about the same weeks.
 *
 * Age is a term in the equation and not a setting here, so
 * {@link ASSUMED_AGE_YEARS} stands in. A decade either way moves the estimate
 * a kilogram, inside the error it already carries. Sex is taken as male, as
 * the six-pack target already assumes.
 */

export const LB_PER_KG = 2.2046226218
export const M_PER_IN = 0.0254

/** The age the muscle equation is read at, since none is recorded. */
export const ASSUMED_AGE_YEARS = 30

/** How far off the equation's muscle figure is, one standard error, on the population it was fitted to. */
export const SKELETAL_MUSCLE_SEE_KG = 2.8

/**
 * Whole-body skeletal muscle, kg, from height, weight, age and sex: Lee 2000's
 * body-mass model. Race term left at zero (the white / Hispanic reference).
 */
export function leeSkeletalMuscleKg(weightKg: number, heightM: number, ageYears: number, male = true): number {
  return 0.244 * weightKg + 7.8 * heightM + 6.6 * (male ? 1 : 0) - 0.098 * ageYears - 3.3
}

/** One week of the body, in pounds and as shares of the weight. */
export type WholeBodyPoint = {
  /** The Monday the week starts on. */
  date: string
  weighIns: number
  /** The week's average weigh-in, lbs, and its average body fat, %. */
  weight: number
  bodyFat: number
  muscle: number
  fat: number
  rest: number
  /** Whole percentages of the weight; they can miss a hundred by one. */
  musclePct: number
  fatPct: number
  restPct: number
  /**
   * Pounds either side of each part's figure. The rest's is the equation's
   * standard error alone, the same every week; the fat's is the split's
   * alone. The muscle's is the two added, not joined in quadrature: the
   * muscle is what is left of the weight once the fat and the rest are taken
   * out, so its best case is the least fat with the least rest and its worst
   * the most of both, and the chart draws exactly that span — the body is
   * somewhere between the two stacks, and this is how far apart they are.
   */
  muscleError: number
  fatError: number
  restError: number
  /** The same give-or-takes as points of body weight, to a tenth. */
  musclePctError: number
  fatPctError: number
  restPctError: number
  /** Pounds either side of the top of the stack. */
  weightError: number
}

export type WholeBody = {
  points: WholeBodyPoint[]
  /** Everything that is neither fat nor muscle, lbs: fixed across the span. */
  rest: number
  /** The equation's muscle at the start, lbs, and how much of the fat-free mass that was. */
  startMuscle: number
  startMuscleShareOfLean: number
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/**
 * The muscle vs fat trend read as a whole body. Null without a trend or a
 * height, or when the equation asks for more muscle than there is fat-free
 * mass — a scale reading that far off is not worth drawing a body from.
 */
export function wholeBody(
  trend: MassTrend | null,
  heightIn: number,
  ageYears: number = ASSUMED_AGE_YEARS,
): WholeBody | null {
  if (!trend || trend.points.length === 0 || !(heightIn > 0)) return null
  const split = (weight: number, bodyFat: number) => {
    const fat = (weight * bodyFat) / 100
    return { fat, lean: weight - fat }
  }
  const start = trend.points[0]
  const startSplit = split(start.weight, start.bodyFat)
  const startMuscle = leeSkeletalMuscleKg(start.weight / LB_PER_KG, heightIn * M_PER_IN, ageYears) * LB_PER_KG
  const rest = startSplit.lean - startMuscle
  if (!(startMuscle > 0) || !(rest > 0)) return null
  const see = SKELETAL_MUSCLE_SEE_KG * LB_PER_KG

  const points: WholeBodyPoint[] = trend.points.map((p) => {
    const { fat, lean } = split(p.weight, p.bodyFat)
    const muscle = lean - rest
    const pct = (n: number) => Math.round((100 * n) / p.weight)
    const pctError = (lbs: number) => round1((100 * lbs) / p.weight)
    const muscleError = see + p.fatError
    return {
      date: p.date,
      weighIns: p.weighIns,
      weight: p.weight,
      bodyFat: p.bodyFat,
      muscle: round1(muscle),
      fat: round1(fat),
      rest: round1(rest),
      musclePct: pct(muscle),
      // The fat's share is the body fat itself, to the tenth it is logged in:
      // rounded to a whole percent, a 14.5 printed as 15 under a header reading 14.5.
      fatPct: p.bodyFat,
      restPct: pct(rest),
      muscleError: round1(muscleError),
      fatError: p.fatError,
      restError: round1(see),
      musclePctError: pctError(muscleError),
      fatPctError: pctError(p.fatError),
      restPctError: pctError(see),
      weightError: p.weightError,
    }
  })
  return {
    points,
    rest: round1(rest),
    startMuscle: round1(startMuscle),
    startMuscleShareOfLean: round1((100 * startMuscle) / startSplit.lean),
  }
}

/**
 * What a kilogram of each compartment takes up, kg per litre: Siri 1961's two
 * figures, the same pair every body-fat reading — callipers, a tape, a scale's
 * current — is calibrated against. Fat is light and everything else is not, so
 * a body that is 15% fat on the scale is nearer 18% fat in the mirror. The
 * muscle and the rest share the fat-free figure: muscle alone runs about 1.06
 * and bone well over, but that four percent is inside what the muscle estimate
 * is already unsure by, and one figure keeps the fat-free mass at the density
 * the reading assumed.
 */
export const FAT_KG_PER_L = 0.9007
export const FAT_FREE_KG_PER_L = 1.1

/**
 * The same weeks by volume: every pound figure and its give-or-take in litres,
 * `weight` the whole body's volume, and the shares shares of that volume, the
 * fat's still to a tenth. `bodyFat` stays the scale's, by weight.
 *
 * The give-or-takes go over at the density of the tissue that would be gained
 * or lost. The whole volume has one the weight does not: a pound called fat
 * that was muscle is the same pound on the scale and a different size, so the
 * fat's doubt widens the top of the stack by the difference.
 */
export function wholeBodyByVolume(points: WholeBodyPoint[]): WholeBodyPoint[] {
  const fatL = (lbs: number) => lbs / LB_PER_KG / FAT_KG_PER_L
  const leanL = (lbs: number) => lbs / LB_PER_KG / FAT_FREE_KG_PER_L
  return points.map((p) => {
    const fatLbs = (p.weight * p.bodyFat) / 100
    const fat = fatL(fatLbs)
    const rest = leanL(p.rest)
    const muscle = leanL(p.weight - fatLbs) - rest
    const volume = fat + rest + muscle
    const muscleError = leanL(p.muscleError)
    const fatError = fatL(p.fatError)
    const restError = leanL(p.restError)
    const pct = (n: number) => Math.round((100 * n) / volume)
    const pctError = (litres: number) => round1((100 * litres) / volume)
    return {
      date: p.date,
      weighIns: p.weighIns,
      weight: round1(volume),
      bodyFat: p.bodyFat,
      muscle: round1(muscle),
      fat: round1(fat),
      rest: round1(rest),
      musclePct: pct(muscle),
      // Off the two figures as printed, so the share can be checked against them.
      fatPct: round1((100 * round1(fat)) / round1(volume)),
      restPct: pct(rest),
      muscleError: round1(muscleError),
      fatError: round1(fatError),
      restError: round1(restError),
      musclePctError: pctError(muscleError),
      fatPctError: pctError(fatError),
      restPctError: pctError(restError),
      weightError: round1(leanL(p.weightError) + fatError - leanL(p.fatError)),
    }
  })
}

/** A whole percentage with its give-or-take in points: "38 ± 3.4%", or just "15%" when there is none to speak of. */
export function fmtPctError(pct: number, error: number): string {
  return error > 0 ? `${pct} ± ${error}%` : `${pct}%`
}

/** A pound figure with its give-or-take: "186 ± 0.8 lbs", or "186 lbs" when the figure is sure. */
export function fmtLbsError(lbs: number, error: number): string {
  return fmtUnitError(lbs, error, 'lbs')
}

/** The same in any unit: "81.2 ± 0.4 L". */
export function fmtUnitError(n: number, error: number, unit: string): string {
  return error > 0 ? `${n} ± ${error} ${unit}` : `${n} ${unit}`
}
