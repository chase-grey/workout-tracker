import { describe, it, expect } from 'vitest'
import { bodyFatOn, fmtGain, gainRatioLabel, massPoints, massTrend, MAX_READING_GAP_DAYS, SEAM_ERROR_SE } from './massSplit'

describe('bodyFatOn', () => {
  const readings = [
    { date: '2026-01-01', value: 20 },
    { date: '2026-01-11', value: 15 },
  ]

  it('has nothing to say before the first reading', () => {
    expect(bodyFatOn(readings, '2025-12-31')).toBeNull()
    expect(bodyFatOn([], '2026-01-05')).toBeNull()
  })

  it('reads a reading back on its own day', () => {
    expect(bodyFatOn(readings, '2026-01-01')).toBe(20)
    expect(bodyFatOn(readings, '2026-01-11')).toBe(15)
  })

  it('runs a straight line between two readings', () => {
    expect(bodyFatOn(readings, '2026-01-06')).toBe(17.5)
    expect(bodyFatOn(readings, '2026-01-03')).toBe(19)
  })

  it('holds the last reading flat after it, but not forever', () => {
    expect(bodyFatOn(readings, '2026-02-01')).toBe(15)
    expect(bodyFatOn(readings, '2026-04-01')).toBeNull()
    expect(MAX_READING_GAP_DAYS).toBe(45)
  })

  it('will not draw a line across a gap longer than it trusts', () => {
    const sparse = [
      { date: '2025-10-31', value: 11 },
      { date: '2026-09-29', value: 13.6 },
      { date: '2026-10-14', value: 13.7 },
    ]
    expect(bodyFatOn(sparse, '2026-03-04')).toBeNull()
    expect(bodyFatOn(sparse, '2025-11-10')).toBeNull()
    expect(bodyFatOn(sparse, '2026-10-01')).toBeCloseTo(13.613, 2)
  })
})

describe('massPoints', () => {
  // 2026-01-01 is a Thursday; its week starts Monday 2025-12-29. 2026-01-21 is
  // the Wednesday of the week starting 2026-01-19.
  const bodyFat = [
    { date: '2026-01-01', value: 20 },
    { date: '2026-01-21', value: 20 },
  ]

  it('leaves out weigh-ins from before the first reading', () => {
    const out = massPoints([{ date: '2025-12-01', value: 170 }, { date: '2026-01-01', value: 180 }], bodyFat)
    expect(out.map((p) => p.date)).toEqual(['2025-12-29'])
  })

  it('splits each week by the body fat in force and reads gains off the first', () => {
    const out = massPoints(
      [
        { date: '2026-01-01', value: 180 },
        { date: '2026-01-21', value: 190 },
      ],
      bodyFat,
    )
    expect(out[0]).toMatchObject({ date: '2025-12-29', weight: 180, bodyFat: 20, lean: 144, fat: 36, muscleGain: 0, fatGain: 0 })
    expect(out[1]).toMatchObject({ date: '2026-01-19', weight: 190, bodyFat: 20, lean: 152, fat: 38, muscleGain: 8, fatGain: 2 })
  })

  it('folds a week of mornings into one mean, whatever order they came in', () => {
    const out = massPoints(
      [
        { date: '2026-01-03', value: 182 },
        { date: '2026-01-01', value: 180 },
        { date: '2026-01-02', value: 184 },
        { date: '2026-01-20', value: 189 },
        { date: '2026-01-21', value: 191 },
      ],
      bodyFat,
    )
    expect(out.map((p) => [p.date, p.weight, p.weighIns])).toEqual([
      ['2025-12-29', 182, 3],
      ['2026-01-19', 190, 2],
    ])
    expect(out[1].muscleGain).toBe(6.4)
    expect(out[1].fatGain).toBe(1.6)
  })

  it('averages the body fat in force across the week too, not just the weight', () => {
    // Readings 20 → 10 over ten days: 18 in force on the 3rd, 16 on the 5th.
    const out = massPoints(
      [
        { date: '2026-01-03', value: 180 },
        { date: '2026-01-05', value: 180 },
      ],
      [
        { date: '2026-01-01', value: 20 },
        { date: '2026-01-11', value: 10 },
      ],
    )
    expect(out).toHaveLength(2)
    expect(out[0].bodyFat).toBe(18)
    expect(out[1].bodyFat).toBe(16)
  })

  it('shows fat lost on a recomp as a negative gain', () => {
    const out = massPoints(
      [
        { date: '2026-01-01', value: 180 },
        { date: '2026-01-21', value: 180 },
      ],
      [
        { date: '2026-01-01', value: 20 },
        { date: '2026-01-21', value: 15 },
      ],
    )
    expect(out[1]).toMatchObject({ muscleGain: 9, fatGain: -9 })
  })

  it('is empty with no readings at all', () => {
    expect(massPoints([{ date: '2026-01-01', value: 180 }], [])).toEqual([])
  })

  it('starts where the readings become regular, not at a lone one long before', () => {
    const out = massPoints(
      [
        { date: '2026-03-04', value: 167 },
        { date: '2026-09-29', value: 174 },
        { date: '2026-10-14', value: 176 },
      ],
      [
        { date: '2025-10-31', value: 11 },
        { date: '2026-09-29', value: 13.6 },
        { date: '2026-10-14', value: 13.7 },
      ],
    )
    expect(out.map((p) => p.date)).toEqual(['2026-09-28', '2026-10-12'])
    expect(out[0].muscleGain).toBe(0)
  })
})

describe('massTrend', () => {
  // 2026-01-05 is a Monday. `day(n)` is n days on from it.
  const day = (n: number): string => {
    const d = new Date(Date.UTC(2026, 0, 5 + n))
    return d.toISOString().slice(0, 10)
  }
  /** A weigh-in every morning for `days`, climbing `perDay` from 180. */
  const mornings = (days: number, perDay: number, wobble = (_: number) => 0) =>
    Array.from({ length: days }, (_, i) => ({ date: day(i), value: 180 + perDay * i + wobble(i) }))
  /** A body-fat reading every `every` days across `days`, `pct` plus whatever `wobble` says. */
  const readings = (days: number, every: number, pct: number, wobble = (_: number) => 0) =>
    Array.from({ length: Math.ceil(days / every) }, (_, i) => ({ date: day(i * every), value: pct + wobble(i) }))

  it('reads the bands off straight lines, with no doubt when the data is a line', () => {
    // 0.1 lb a day at a steady 20 % fat: each pound is 0.2 fat and 0.8 lean.
    const t = massTrend(mornings(28, 0.1), readings(28, 7, 20))
    expect(t).not.toBeNull()
    if (!t) return
    expect(t.points.map((p) => p.date)).toEqual([day(0), day(7), day(14), day(21)])
    expect(t.days).toBe(21)
    expect(t.weighIns).toBe(28)
    expect(t.readings).toBe(4)
    // Each week is read at the middle of its mornings, three weeks apart first to last.
    expect(t.startWeight).toBeCloseTo(180.3, 1)
    expect(t.weightPerWeek).toBeCloseTo(0.7)
    expect(t.fatPerWeek).toBeCloseTo(0.14, 1)
    expect(t.leanPerWeek).toBeCloseTo(0.56, 1)
    expect(t.fatPerWeekSE).toBeCloseTo(0)
    const last = t.points[3]
    expect(last.muscleGain).toBeCloseTo(1.7, 1)
    expect(last.fatGain).toBeCloseTo(0.4, 1)
    expect(last.seamError).toBe(0)
    // The weeks' own means sit on the lines, give or take the tenth they are rounded to.
    for (const p of t.points) {
      expect(Math.abs(p.weekTotalGain - (p.muscleGain + p.fatGain))).toBeLessThanOrEqual(0.15)
      expect(Math.abs(p.weekMuscleGain - p.muscleGain)).toBeLessThanOrEqual(0.15)
    }
  })

  it('widens the give-or-take on the seam with the span when the readings scatter', () => {
    const wobble = (i: number) => (i % 2 === 0 ? 0.4 : -0.4)
    const t = massTrend(mornings(42, 0.1), readings(42, 2, 20, wobble))
    if (!t) throw new Error('no trend')
    expect(t.points[0].seamError).toBe(0)
    for (let i = 1; i < t.points.length; i++) {
      expect(t.points[i].seamError).toBeGreaterThan(t.points[i - 1].seamError)
    }
    expect(t.fatPerWeekSE).toBeGreaterThan(0)
    // The haze is SEAM_ERROR_SE errors wide, grown over the days since the start.
    const last = t.points[t.points.length - 1]
    const weeksAcross = (t.points.length - 1) * 1
    expect(last.seamError).toBeCloseTo(SEAM_ERROR_SE * t.fatPerWeekSE * weeksAcross, 0)
    expect(SEAM_ERROR_SE).toBe(2)
  })

  it('is surer of the seam the more readings it has', () => {
    const wobble = (i: number) => (i % 2 === 0 ? 0.4 : -0.4)
    const sparse = massTrend(mornings(42, 0.1), readings(42, 7, 20, wobble))
    const dense = massTrend(mornings(42, 0.1), readings(42, 1, 20, wobble))
    if (!sparse || !dense) throw new Error('no trend')
    expect(dense.fatPerWeekSE).toBeLessThan(sparse.fatPerWeekSE)
  })

  it('keeps the weeks\' own means as dots that stray from the lines', () => {
    const t = massTrend(mornings(28, 0.1, (i) => (i === 10 ? 3 : 0)), readings(28, 7, 20))
    if (!t) throw new Error('no trend')
    // The week with the heavy morning sits above the line; the trend barely moves.
    const heavy = t.points[1]
    expect(heavy.weekTotalGain).toBeGreaterThan(heavy.muscleGain + heavy.fatGain + 0.2)
    expect(t.weightPerWeek).toBeCloseTo(0.7, 0)
  })

  it('reads rising body fat at a steady weight as fat on and lean off', () => {
    const t = massTrend(mornings(28, 0), readings(28, 7, 20, (i) => i * 0.5))
    if (!t) throw new Error('no trend')
    const last = t.points[t.points.length - 1]
    expect(last.fatGain).toBeGreaterThan(0)
    expect(last.muscleGain).toBeCloseTo(-last.fatGain, 1)
    expect(t.weightPerWeek).toBeCloseTo(0)
  })

  it('has no trend inside one week, or on fewer than three of either', () => {
    expect(massTrend(mornings(6, 0.1), readings(6, 2, 20))).toBeNull()
    expect(massTrend(mornings(28, 0.1), readings(28, 14, 20))).toBeNull()
    expect(massTrend([{ date: day(0), value: 180 }, { date: day(8), value: 181 }], readings(14, 3, 20))).toBeNull()
    expect(massTrend([], [])).toBeNull()
  })
})

describe('gainRatioLabel', () => {
  it('names the ratio when both went up', () => {
    expect(gainRatioLabel(6.4, 2)).toBe('3.2 : 1')
    expect(gainRatioLabel(1, 4)).toBe('0.3 : 1')
  })

  it('says which one it was when only one went up', () => {
    expect(gainRatioLabel(3, 0)).toBe('all muscle')
    expect(gainRatioLabel(3, -1)).toBe('all muscle')
    expect(gainRatioLabel(-1, 2)).toBe('all fat')
  })

  it('says nothing when nothing has been gained', () => {
    expect(gainRatioLabel(0, 0)).toBe('')
    expect(gainRatioLabel(-2, -1)).toBe('')
  })
})

describe('fmtGain', () => {
  it('signs the figure', () => {
    expect(fmtGain(4.2)).toBe('+4.2 lbs')
    expect(fmtGain(-1.3)).toBe('−1.3 lbs')
    expect(fmtGain(0)).toBe('0 lbs')
  })
})
