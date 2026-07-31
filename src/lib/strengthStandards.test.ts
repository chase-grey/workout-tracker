import { describe, expect, it } from 'vitest'
import {
  bandFor,
  legsVsUpper,
  liftPercentile,
  liftReadouts,
  muscleDevelopment,
  PRESENCE_DEV,
  type MuscleScore,
} from './strengthStandards'

const BW = 180 // reference bracket (factor ~1.0)

describe('liftPercentile — lookup', () => {
  it('places an intermediate squat near the median', () => {
    // Intermediate squat ≈ 1.5× bodyweight → ~50th percentile.
    const r = liftPercentile('squat', 1.5 * BW, BW)
    expect(r.percentile).toBeGreaterThanOrEqual(45)
    expect(r.percentile).toBeLessThanOrEqual(55)
    expect(r.band).toBe('intermediate')
    expect(r.developmentScore).toBeCloseTo(r.percentile / 100, 5)
  })

  it('rates a bodyweight bench above novice but below advanced', () => {
    // 1.0× bodyweight bench = Intermediate anchor.
    const r = liftPercentile('bench', 1.0 * BW, BW)
    expect(r.percentile).toBeGreaterThanOrEqual(45)
    expect(r.percentile).toBeLessThanOrEqual(55)
  })

  it('a clean bodyweight pull-up scores intermediate via total load', () => {
    // Total load = bodyweight (added weight 0) → ratio 1.0 → Novice/Intermediate edge.
    const r = liftPercentile('pullup', BW, BW)
    expect(r.percentile).toBeGreaterThanOrEqual(20)
    expect(r.band === 'novice' || r.band === 'intermediate').toBe(true)
  })

  it('is monotonic — heavier lift ⇒ higher percentile', () => {
    const light = liftPercentile('squat', 1.0 * BW, BW).percentile
    const heavy = liftPercentile('squat', 2.2 * BW, BW).percentile
    expect(heavy).toBeGreaterThan(light)
  })
})

describe('liftPercentile — clamping', () => {
  it('clamps a zero / negative load to 0', () => {
    expect(liftPercentile('squat', 0, BW).percentile).toBe(0)
    expect(liftPercentile('squat', -50, BW).percentile).toBe(0)
    expect(liftPercentile('squat', 100, 0).percentile).toBe(0)
  })

  it('caps an absurd lift at 99', () => {
    const r = liftPercentile('squat', 10 * BW, BW)
    expect(r.percentile).toBe(99)
    expect(r.band).toBe('elite')
    expect(r.developmentScore).toBeLessThanOrEqual(1)
  })

  it('rewards the same ratio more for a heavier lifter (lower bracket standards)', () => {
    // Heavier men carry lower ratio standards, so an equal ratio ranks higher.
    const light = liftPercentile('squat', 1.5 * 140, 140).percentile
    const heavy = liftPercentile('squat', 1.5 * 240, 240).percentile
    expect(heavy).toBeGreaterThan(light)
  })
})

describe('bandFor', () => {
  it('labels the percentile ranges', () => {
    expect(bandFor(0)).toBe('beginner')
    expect(bandFor(30)).toBe('novice')
    expect(bandFor(50)).toBe('intermediate')
    expect(bandFor(80)).toBe('advanced')
    expect(bandFor(95)).toBe('elite')
  })
})

describe('muscleDevelopment — mapping', () => {
  it('maps compound lifts to the right muscles', () => {
    const best = {
      barbell_squat: 1.5 * BW, // quads
      flat_bench: 1.0 * BW, // chest
      db_overhead_press: 0.7 * BW, // shoulders
      cable_row: 0.95 * BW, // back
      incline_db_curl: 0.6 * BW, // biceps
      tricep_pushdown: 0.6 * BW, // triceps
      hamstring_curl: 0.55 * BW, // hamstrings
    }
    const scores = muscleDevelopment(best, BW)
    for (const m of ['quads', 'chest', 'shoulders', 'back', 'biceps', 'triceps', 'hamstrings'] as const) {
      expect(scores[m].hasData).toBe(true)
      if (scores[m].hasData) {
        expect((scores[m] as Extract<MuscleScore, { hasData: true }>).hasStandard).toBe(true)
      }
    }
  })

  it('marks a muscle with no logged exercise as "no data" (not 0)', () => {
    const scores = muscleDevelopment({ flat_bench: 1.0 * BW }, BW)
    expect(scores.quads.hasData).toBe(false)
    expect(scores.hamstrings.hasData).toBe(false)
    expect(scores.chest.hasData).toBe(true)
  })

  it('treats standard-less work (dead bug, fly) as trained at PRESENCE_DEV', () => {
    const scores = muscleDevelopment({ deadbug: 0, iso_chest: 0 }, BW)
    expect(scores.core.hasData).toBe(true)
    if (scores.core.hasData) {
      expect(scores.core.hasStandard).toBe(false)
      expect(scores.core.developmentScore).toBe(PRESENCE_DEV)
      expect(scores.core.percentile).toBeNull()
    }
    if (scores.chest.hasData) expect(scores.chest.hasStandard).toBe(false)
  })

  it('takes the best percentile across a muscle with several sources', () => {
    // A heavier incline set outranks a lighter flat bench (both feed chest).
    const scores = muscleDevelopment({ flat_bench: 0.8 * BW, incline_bench: 0.9 * BW }, BW)
    const flatOnly = muscleDevelopment({ flat_bench: 0.8 * BW }, BW)
    if (scores.chest.hasData && flatOnly.chest.hasData) {
      expect(scores.chest.developmentScore).toBeGreaterThan(flatOnly.chest.developmentScore)
    }
  })
})

describe('liftReadouts', () => {
  it('emits one readout per standardized lift with data, in order', () => {
    const readouts = liftReadouts({ barbell_squat: 1.5 * BW, flat_bench: 1.0 * BW }, BW)
    expect(readouts.map((r) => r.lift)).toEqual(['squat', 'bench'])
    expect(readouts[0].load).toBe(Math.round(1.5 * BW))
  })

  it('skips standard-less and zero-load exercises', () => {
    const readouts = liftReadouts({ iso_chest: 0, deadbug: 0 }, BW)
    expect(readouts).toHaveLength(0)
  })
})

describe('legsVsUpper', () => {
  it('returns null without both a leg and an upper data point', () => {
    expect(legsVsUpper(muscleDevelopment({ barbell_squat: 1.5 * BW }, BW))).toBeNull()
  })

  it('calls out legs ahead of upper body', () => {
    const b = legsVsUpper(muscleDevelopment({ barbell_squat: 2.2 * BW, flat_bench: 0.6 * BW }, BW))
    expect(b).not.toBeNull()
    expect(b!.legs).toBeGreaterThan(b!.upper)
    expect(b!.verdict).toMatch(/legs are proportionally ahead/i)
  })

  it('calls out a balanced physique', () => {
    const b = legsVsUpper(muscleDevelopment({ barbell_squat: 1.5 * BW, flat_bench: 1.0 * BW }, BW))
    expect(b!.verdict).toMatch(/balance/i)
  })
})
