import { describe, expect, it } from 'vitest'
import {
  baselineOf,
  bandFor,
  ladderPosition,
  ladderReadouts,
  legsVsUpper,
  liftPercentile,
  liftReadouts,
  muscleDevelopment,
  PRESENCE_DEV,
  type ExerciseLog,
  type MuscleScore,
} from './strengthStandards'

const BW = 180 // reference bracket (factor ~1.0)

/** An exercise logged once at `v` — best and baseline are the same value. */
const at = (v: number): ExerciseLog => ({ best: v, earliest: [v] })

/** An exercise that started at `from` and has climbed to `to`. */
const grew = (from: number, to: number): ExerciseLog => ({ best: to, earliest: [from] })

const logs = (m: Record<string, number>): Record<string, ExerciseLog> =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, at(v)]))

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

describe('liftPercentile — calf raise', () => {
  it('scores the machine load, on the far heavier calf scale', () => {
    // Strength Level's male table reads ~317 lb Intermediate at 180 lb bodyweight.
    const r = liftPercentile('calfraise', 317, BW)
    expect(r.band).toBe('intermediate')
    // A load that would be an elite squat is only a novice calf raise.
    expect(liftPercentile('calfraise', 2.6 * BW, BW).band).toBe('advanced')
    expect(liftPercentile('calfraise', 1.0 * BW, BW).band).toBe('novice')
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

describe('baselineOf', () => {
  it('takes the median of the first three sessions', () => {
    expect(baselineOf([20, 30, 25])).toBe(25)
  })

  it('ignores sessions past the first three', () => {
    expect(baselineOf([20, 30, 25, 500, 900])).toBe(25)
  })

  it('averages the middle pair when only two sessions exist', () => {
    expect(baselineOf([20, 30])).toBe(25)
  })

  it('is the lone value after one session', () => {
    expect(baselineOf([20])).toBe(20)
  })

  it('skips zero/blank sessions and reports 0 when there are none left', () => {
    expect(baselineOf([0, 20, 0, 40])).toBe(30)
    expect(baselineOf([0, 0])).toBe(0)
    expect(baselineOf([])).toBe(0)
  })
})

describe('ladderPosition', () => {
  it('puts your very first session at beginner, with novice as the next band', () => {
    const r = ladderPosition('load', 20, 20)
    expect(r!.band).toBe('beginner')
    expect(r!.next).toEqual({ band: 'novice', value: 28 }) // 1.375× of 20
  })

  it('reads a doubled-and-a-bit load as intermediate', () => {
    // Rung three on the load ladder is 2.25× where you started.
    expect(ladderPosition('load', 20, 45)!.band).toBe('intermediate')
    expect(ladderPosition('load', 20, 45)!.next).toEqual({ band: 'advanced', value: 57 })
  })

  it('never names the band you are already in as the next one', () => {
    for (const best of [20, 25, 29, 30, 31, 40, 45, 60, 80, 89]) {
      const r = ladderPosition('load', 20, best)!
      if (r.next) expect(r.next.band).not.toBe(r.band)
    }
  })

  it('names a next load that actually reaches the band it promises', () => {
    for (const best of [20, 25, 29, 31, 45, 60, 80]) {
      const r = ladderPosition('load', 20, best)!
      if (r.next) expect(ladderPosition('load', 20, r.next.value)!.band).toBe(r.next.band)
    }
  })

  it('tops out at elite with no further rung', () => {
    const r = ladderPosition('load', 20, 200) // well past 4.5×
    expect(r!.band).toBe('elite')
    expect(r!.next).toBeNull()
    expect(r!.developmentScore).toBeLessThanOrEqual(1)
  })

  it('climbs monotonically', () => {
    const a = ladderPosition('load', 20, 25)!.position
    const b = ladderPosition('load', 20, 50)!.position
    expect(b).toBeGreaterThan(a)
  })

  it('uses gentler rungs for reps than for load', () => {
    // 1.9× reps is intermediate; 1.9× load is only novice.
    expect(ladderPosition('reps', 10, 19)!.band).toBe('intermediate')
    expect(ladderPosition('load', 10, 19)!.band).toBe('novice')
  })

  it('puts the hanging-raise graduation rep count mid-intermediate', () => {
    // The plan graduates knee raises to full leg raises at 20 reps — clearing the
    // easier variation, with the harder one still to climb.
    expect(ladderPosition('reps', 10, 20)!.band).toBe('intermediate')
    expect(ladderPosition('reps', 10, 20)!.next).toEqual({ band: 'advanced', value: 23 })
  })

  it('never falls back down the ladder, since the score reads the best session ever', () => {
    // Graduation makes the movement harder under the same key, so reps drop.
    expect(ladderPosition('reps', 10, 20)!.position).toBeGreaterThan(
      ladderPosition('reps', 10, 10)!.position,
    )
  })

  it('has no ladder without a usable anchor', () => {
    expect(ladderPosition('load', 0, 50)).toBeNull()
    expect(ladderPosition('reps', -1, 50)).toBeNull()
  })
})

describe('muscleDevelopment — mapping', () => {
  it('maps compound lifts to the right muscles', () => {
    const scores = muscleDevelopment(
      logs({
        barbell_squat: 1.5 * BW, // quads
        flat_bench: 1.0 * BW, // chest
        db_overhead_press: 0.7 * BW, // shoulders
        cable_row: 0.95 * BW, // back
        incline_db_curl: 0.6 * BW, // biceps
        tricep_pushdown: 0.6 * BW, // triceps
        hamstring_curl: 0.55 * BW, // hamstrings
        calf_raise: 1.75 * BW, // calves
      }),
      BW,
    )
    for (const m of [
      'quads',
      'chest',
      'shoulders',
      'back',
      'biceps',
      'triceps',
      'hamstrings',
      'calves',
    ] as const) {
      const s = scores[m] as Extract<MuscleScore, { hasData: true }>
      expect(s.hasData).toBe(true)
      expect(s.basis).toBe('standard')
    }
  })

  it('colors the glutes off the squat, at the same score as the quads', () => {
    const scores = muscleDevelopment(logs({ barbell_squat: 1.5 * BW }), BW)
    const quads = scores.quads as Extract<MuscleScore, { hasData: true }>
    const glutes = scores.glutes as Extract<MuscleScore, { hasData: true }>
    expect(glutes.hasData).toBe(true)
    expect(glutes.basis).toBe('standard')
    expect(glutes.developmentScore).toBe(quads.developmentScore)
  })

  it('leaves the glutes at "no data" when nothing squat-like is logged', () => {
    expect(muscleDevelopment(logs({ hamstring_curl: 0.55 * BW }), BW).glutes.hasData).toBe(false)
  })

  it('marks a muscle with no logged exercise as "no data" (not 0)', () => {
    const scores = muscleDevelopment(logs({ flat_bench: 1.0 * BW }), BW)
    expect(scores.quads.hasData).toBe(false)
    expect(scores.calves.hasData).toBe(false)
    expect(scores.neck.hasData).toBe(false)
    expect(scores.chest.hasData).toBe(true)
  })

  it('treats unscoreable work (fly, lateral raise) as trained at PRESENCE_DEV', () => {
    const scores = muscleDevelopment(logs({ iso_chest: 0, lateral_raise: 0 }), BW)
    for (const m of ['chest', 'shoulders'] as const) {
      const s = scores[m] as Extract<MuscleScore, { hasData: true }>
      expect(s.basis).toBe('presence')
      expect(s.developmentScore).toBe(PRESENCE_DEV)
      expect(s.percentile).toBeNull()
    }
  })

  it('takes the best percentile across a muscle with several sources', () => {
    // A heavier incline set outranks a lighter flat bench (both feed chest).
    const scores = muscleDevelopment(logs({ flat_bench: 0.8 * BW, incline_bench: 0.9 * BW }), BW)
    const flatOnly = muscleDevelopment(logs({ flat_bench: 0.8 * BW }), BW)
    if (scores.chest.hasData && flatOnly.chest.hasData) {
      expect(scores.chest.developmentScore).toBeGreaterThan(flatOnly.chest.developmentScore)
    }
  })
})

describe('muscleDevelopment — personal ladders', () => {
  it('scores the neck off its own baseline, not a population table', () => {
    const scores = muscleDevelopment({ neck_extension: grew(10, 25) }, BW)
    const s = scores.neck as Extract<MuscleScore, { hasData: true }>
    expect(s.basis).toBe('ladder')
    expect(s.percentile).toBeNull()
    expect(s.band).toBe('intermediate') // 2.5× where it started
  })

  it('takes the neck rung of whichever direction has climbed further', () => {
    const scores = muscleDevelopment(
      { neck_extension: grew(10, 12), neck_flexion: grew(10, 33) },
      BW,
    )
    expect((scores.neck as Extract<MuscleScore, { hasData: true }>).band).toBe('advanced')
  })

  it('starts a freshly logged neck at beginner rather than at zero', () => {
    const scores = muscleDevelopment({ neck_extension: at(10) }, BW)
    const s = scores.neck as Extract<MuscleScore, { hasData: true }>
    expect(s.band).toBe('beginner')
    expect(s.developmentScore).toBeGreaterThan(0)
  })

  it('ladders core off the cable crunch and the bodyweight raises alike', () => {
    const weighted = muscleDevelopment({ cable_crunch: grew(40, 90) }, BW)
    expect((weighted.core as Extract<MuscleScore, { hasData: true }>).band).toBe('intermediate')

    const reps = muscleDevelopment({ hanging_leg_raise: grew(10, 25) }, BW)
    const s = reps.core as Extract<MuscleScore, { hasData: true }>
    expect(s.basis).toBe('ladder')
    expect(s.band).toBe('advanced')
  })

  it('ladders the hips off the machines, keeping the two sides apart', () => {
    const scores = muscleDevelopment(
      { leg_adductor: grew(40, 90), leg_abductor: grew(40, 45) },
      BW,
    )
    const add = scores.adductors as Extract<MuscleScore, { hasData: true }>
    const abd = scores.abductors as Extract<MuscleScore, { hasData: true }>
    expect(add.basis).toBe('ladder')
    expect(add.percentile).toBeNull()
    expect(add.band).toBe('intermediate') // 2.25× where it started
    expect(abd.band).toBe('beginner')
  })

  it('ladders the outer hip off the sideways raise once the machine stops logging', () => {
    // The raise takes no weight, so its rung is read in reps — and each hip has its
    // own history, so the muscle takes whichever side has climbed further.
    const scores = muscleDevelopment(
      { sideways_leg_raise_l: grew(15, 21), sideways_leg_raise_r: grew(15, 38) },
      BW,
    )
    const abd = scores.abductors as Extract<MuscleScore, { hasData: true }>
    expect(abd.basis).toBe('ladder')
    expect(abd.percentile).toBeNull()
    expect(abd.band).toBe('advanced') // 2.5× the fifteen it opened at
  })

  it('leaves the hips out of the legs-vs-upper balance, being on a personal scale', () => {
    const laddered = muscleDevelopment(
      { leg_adductor: grew(40, 200), leg_abductor: grew(40, 200) },
      BW,
    )
    expect(legsVsUpper(laddered)).toBeNull() // no standard-scored leg to compare

    const withLift = muscleDevelopment(
      { ...logs({ barbell_squat: 1.5 * BW, flat_bench: 1.0 * BW }), leg_adductor: grew(40, 200) },
      BW,
    )
    const noHips = muscleDevelopment(logs({ barbell_squat: 1.5 * BW, flat_bench: 1.0 * BW }), BW)
    expect(legsVsUpper(withLift)!.legs).toBe(legsVsUpper(noHips)!.legs)
  })

  it('falls back to presence for laddered work with no anchor yet', () => {
    // Reps-only work logged with no reps recorded — nothing to measure from.
    const scores = muscleDevelopment({ deadbug: { best: 0, earliest: [0] } }, BW)
    const s = scores.core as Extract<MuscleScore, { hasData: true }>
    expect(s.basis).toBe('presence')
    expect(s.developmentScore).toBe(PRESENCE_DEV)
  })
})

describe('liftReadouts', () => {
  it('emits one readout per standardized lift with data, in order', () => {
    const readouts = liftReadouts(logs({ barbell_squat: 1.5 * BW, flat_bench: 1.0 * BW }), BW)
    expect(readouts.map((r) => r.lift)).toEqual(['squat', 'bench'])
    expect(readouts[0].load).toBe(Math.round(1.5 * BW))
  })

  it('puts the calf raise last and leaves laddered work out entirely', () => {
    const readouts = liftReadouts(
      logs({ calf_raise: 300, barbell_squat: 1.5 * BW, neck_extension: 25, cable_crunch: 90 }),
      BW,
    )
    expect(readouts.map((r) => r.lift)).toEqual(['squat', 'calfraise'])
  })

  it('skips unscoreable and zero-load exercises', () => {
    expect(liftReadouts(logs({ iso_chest: 0, deadbug: 0 }), BW)).toHaveLength(0)
  })

  it('names the load that unlocks the next band, above the current lift', () => {
    // An intermediate squat (1.5×) climbs to advanced somewhere under 2.0×.
    const [r] = liftReadouts(logs({ barbell_squat: 1.5 * BW }), BW)
    expect(r.band).toBe('intermediate')
    expect(r.next!.band).toBe('advanced')
    expect(r.next!.value).toBeGreaterThan(r.load)
    expect(r.next!.value).toBeLessThan(2.0 * BW)
    // And that load really does read advanced.
    expect(liftPercentile('squat', r.next!.value, BW).band).toBe('advanced')
  })

  it('has no next band once the lift is elite', () => {
    expect(liftReadouts(logs({ barbell_squat: 3.5 * BW }), BW)[0].next).toBeNull()
  })

  it('quotes the pull-up target as a total load, like the row it sits under', () => {
    const [r] = liftReadouts(logs({ weighted_pullups: 20 }), BW)
    expect(r.load).toBe(BW + 20) // bodyweight + added
    expect(r.next!.value).toBeGreaterThan(BW)
  })
})

describe('ladderReadouts', () => {
  it('reports where you started, where you are, and the next rung', () => {
    const rows = ladderReadouts({ neck_extension: grew(10, 25) })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      key: 'neck_extension',
      label: 'neck extension',
      unit: 'lbs',
      baseline: 10,
      best: 25,
      band: 'intermediate',
      next: { band: 'advanced', value: 29 }, // 2.85× of 10
    })
  })

  it('labels reps ladders in reps', () => {
    const rows = ladderReadouts({ hanging_leg_raise: grew(10, 14) })
    expect(rows[0].unit).toBe('reps')
  })

  it('orders neck before core work and skips exercises with no anchor', () => {
    const rows = ladderReadouts({
      cable_crunch: grew(40, 90),
      deadbug: { best: 0, earliest: [0] },
      neck_flexion: grew(5, 10),
    })
    expect(rows.map((r) => r.key)).toEqual(['neck_flexion', 'cable_crunch'])
  })

  it('leaves standard-backed lifts out', () => {
    expect(ladderReadouts(logs({ barbell_squat: 300, calf_raise: 300 }))).toHaveLength(0)
  })
})

describe('legsVsUpper', () => {
  it('returns null without both a leg and an upper data point', () => {
    expect(legsVsUpper(muscleDevelopment(logs({ barbell_squat: 1.5 * BW }), BW))).toBeNull()
  })

  it('calls out legs ahead of upper body', () => {
    const b = legsVsUpper(
      muscleDevelopment(logs({ barbell_squat: 2.2 * BW, flat_bench: 0.6 * BW }), BW),
    )
    expect(b).not.toBeNull()
    expect(b!.legs).toBeGreaterThan(b!.upper)
    expect(b!.verdict).toMatch(/legs are proportionally ahead/i)
  })

  it('calls out a balanced physique', () => {
    const b = legsVsUpper(
      muscleDevelopment(logs({ barbell_squat: 1.5 * BW, flat_bench: 1.0 * BW }), BW),
    )
    expect(b!.verdict).toMatch(/balance/i)
  })

  it('counts calves as legs and leaves the neck out of both columns', () => {
    const withNeck = muscleDevelopment(
      { calf_raise: at(2.55 * BW), flat_bench: at(1.0 * BW), neck_extension: grew(10, 45) },
      BW,
    )
    const withoutNeck = muscleDevelopment(
      { calf_raise: at(2.55 * BW), flat_bench: at(1.0 * BW) },
      BW,
    )
    expect(legsVsUpper(withNeck)).toEqual(legsVsUpper(withoutNeck))
    expect(legsVsUpper(withNeck)!.legs).toBeGreaterThan(0.7) // an advanced calf raise
  })
})

describe('the leg press is ranked as the squat it implies', () => {
  it('scores a press against the squat table through the conversion', () => {
    // 600 pressed reads as 270 squatted, which at 180 lb bodyweight is a 1.5×
    // squat — the Intermediate anchor. Scored raw it would read Elite.
    const scores = muscleDevelopment(logs({ leg_press: 600 }), BW)
    const quads = scores.quads
    expect(quads.hasData).toBe(true)
    if (!quads.hasData) return
    expect(quads.basis).toBe('standard')
    expect(quads.band).toBe('intermediate')
    // It carries the glutes too, the way the squat did — nothing else in the plan
    // scores them.
    expect(scores.glutes).toEqual(quads)
  })

  it('reports the converted load on the squat row of the readout', () => {
    const [row] = liftReadouts(logs({ leg_press: 600 }), BW)
    expect(row.lift).toBe('squat')
    expect(row.load).toBe(270)
  })

  it('takes the better of a real squat and a converted press', () => {
    const rows = liftReadouts(logs({ leg_press: 600, barbell_squat: 300 }), BW)
    expect(rows.find((r) => r.lift === 'squat')!.load).toBe(300)
  })
})
