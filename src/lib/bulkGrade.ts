import { daysBetween } from './dates'
import type { MassPoint } from './massSplit'

/**
 * How clean a bulk has been, judged on the two things the research actually
 * measures: what share of the weight gained was lean, and how fast it went on.
 *
 * The share bands follow Nuckols' reading of the five rate-of-gain trials
 * (Rozenek, Garthe, Helms, Smith, Sanchez — macrofactor.com/bulking-calculator):
 * a well-run surplus should land two thirds to three quarters of the gain as
 * fat-free mass; trained lifters gaining at ~0.16 %/week put on ~85 % lean,
 * at ~0.38 %/week ~65 %, and the "very aggressive" end is defined there as
 * accepting fat as half of what you gain. So three quarters and up is as lean as
 * a surplus gets, two thirds is the clean band, better than even is a little
 * loose, and more fat than muscle is the dirty bulk.
 *
 * The pace bands are the same source's table for an intermediate — conservative
 * 0.15, happy medium 0.325, aggressive 0.575, very aggressive 0.8 % of
 * bodyweight a week — which brackets the 0.25–0.5 %/week that Iraki et al.
 * (2019, Sports 7:154) give novice and intermediate bodybuilders. Past the
 * aggressive mark the trials on trained lifters found the extra weight was
 * mostly fat; past very aggressive, Garthe's fast group gained five times the
 * fat of the slow one for a small, non-significant edge in lean mass.
 *
 * Both are read over the whole span the chart shows, from the first body-fat
 * reading to the newest weigh-in. A couple of weeks is too short to grade — a
 * pound of water either way swamps the signal — so under {@link MIN_GRADE_DAYS}
 * there is no verdict yet.
 */

export const MIN_GRADE_DAYS = 14

/** Where muscle's share of the gain falls, best first. */
export const PARTITION_BANDS = ['lean', 'clean', 'loose', 'dirty'] as const
export type PartitionBand = (typeof PARTITION_BANDS)[number]

/** Share of the gain that is muscle at the bottom of each band but the last. */
export const PARTITION_FLOORS = [0.75, 2 / 3, 0.5] as const

/** Where the pace of gain falls, slowest first. */
export const PACE_BANDS = ['slow', 'steady', 'fast', 'too fast'] as const
export type PaceBand = (typeof PACE_BANDS)[number]

/** Percent of bodyweight a week at the top of each band but the last: the intermediate row. */
export const PACE_CEILINGS = [0.2, 0.45, 0.8] as const

export type Verdict = 'recomp' | 'clean bulk' | 'leaning dirty' | 'dirty bulk' | 'not gaining'

export type BulkGrade =
  | { ready: false; days: number }
  | {
      ready: true
      days: number
      verdict: Verdict
      /** Muscle's share of the weight gained, 0–1; over 1 on a recomp, null when nothing went on. */
      share: number | null
      partition: PartitionBand | null
      /** Where in the partition track the marker sits, 0 (leanest) to 1 (dirtiest). */
      partitionAt: number | null
      /** Pounds a week, and percent of starting bodyweight a week. */
      lbsPerWeek: number
      pctPerWeek: number
      pace: PaceBand
      /** Where in the pace track the marker sits, 0 (slowest) to 1 (fastest). */
      paceAt: number
    }

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n))

/** Which band `share` lands in, and how far along the whole track it sits. */
export function partitionOf(share: number): { band: PartitionBand; at: number } {
  // Each band is a quarter of the track; the marker slides within its quarter.
  const edges = [1, ...PARTITION_FLOORS, 0]
  for (let i = 0; i < PARTITION_BANDS.length; i++) {
    const top = edges[i]
    const floor = edges[i + 1]
    if (share >= floor || i === PARTITION_BANDS.length - 1) {
      const within = clamp01((top - share) / (top - floor))
      return { band: PARTITION_BANDS[i], at: (i + within) / PARTITION_BANDS.length }
    }
  }
  return { band: 'dirty', at: 1 }
}

/** Which band `pctPerWeek` lands in, and how far along the whole track it sits. */
export function paceOf(pctPerWeek: number): { band: PaceBand; at: number } {
  const edges = [0, ...PACE_CEILINGS, PACE_CEILINGS[2] * 2]
  for (let i = 0; i < PACE_BANDS.length; i++) {
    const floor = edges[i]
    const top = edges[i + 1]
    if (pctPerWeek < top || i === PACE_BANDS.length - 1) {
      const within = clamp01((pctPerWeek - floor) / (top - floor))
      return { band: PACE_BANDS[i], at: (i + within) / PACE_BANDS.length }
    }
  }
  return { band: 'too fast', at: 1 }
}

/** The one-line call, from where the two readings fall. */
export function verdictOf(partition: PartitionBand | null, pace: PaceBand, gained: number, muscle: number): Verdict {
  if (gained <= 0.5) return muscle > 0.5 ? 'recomp' : 'not gaining'
  if (partition === 'dirty' || pace === 'too fast') return 'dirty bulk'
  if (partition === 'loose' || pace === 'fast') return 'leaning dirty'
  return 'clean bulk'
}

export function bulkGrade(points: MassPoint[]): BulkGrade {
  const first = points[0]
  const last = points[points.length - 1]
  const days = first && last ? daysBetween(first.date, last.date) : 0
  if (!first || !last || days < MIN_GRADE_DAYS) return { ready: false, days }

  const muscle = last.muscleGain
  const fat = last.fatGain
  const gained = muscle + fat
  const weeks = days / 7
  const lbsPerWeek = gained / weeks
  const pctPerWeek = (100 * lbsPerWeek) / first.weight
  const { band: pace, at: paceAt } = paceOf(Math.max(0, pctPerWeek))

  // On a recomp — fat down, muscle up — muscle is more than all of the gain, and
  // the marker pins to the lean end rather than running off the track.
  const share = gained > 0 ? muscle / gained : null
  const split = share != null ? partitionOf(Math.min(1, share)) : null

  return {
    ready: true,
    days,
    verdict: verdictOf(split?.band ?? null, pace, gained, muscle),
    share,
    partition: split?.band ?? null,
    partitionAt: split?.at ?? null,
    lbsPerWeek: Math.round(lbsPerWeek * 100) / 100,
    pctPerWeek: Math.round(pctPerWeek * 100) / 100,
    pace,
    paceAt,
  }
}
