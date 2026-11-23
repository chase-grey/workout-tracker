import { describe, it, expect } from 'vitest'
import { bandEdges, bodyFatOn, fmtGain, gainRatioLabel, massPoints, massTrend, MAX_READING_GAP_DAYS, BAND_ERROR_SE } from './massSplit'

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

  it("splits a week by the average of the readings logged in it, weigh-in that day or not", () => {
    // Monday 2026-01-05 to Sunday the 11th: two weigh-ins, three readings.
    const out = massPoints(
      [
        { date: '2026-01-01', value: 180 },
        { date: '2026-01-05', value: 180 },
        { date: '2026-01-09', value: 182 },
      ],
      [
        { date: '2026-01-01', value: 20 },
        { date: '2026-01-05', value: 19 },
        { date: '2026-01-07', value: 18 },
        { date: '2026-01-09', value: 17 },
      ],
    )
    expect(out[1]).toMatchObject({ date: '2026-01-05', weight: 181, bodyFat: 18, weighIns: 2 })
  })

  it('gives a week with no reading of its own the body fat in force on its mornings', () => {
    // Readings 20 → 10 over twenty days: 16 in force on the 9th, 14 on the 13th.
    const out = massPoints(
      [
        { date: '2026-01-01', value: 180 },
        { date: '2026-01-09', value: 180 },
        { date: '2026-01-13', value: 180 },
      ],
      [
        { date: '2026-01-01', value: 20 },
        { date: '2026-01-21', value: 10 },
      ],
    )
    expect(out.map((p) => p.bodyFat)).toEqual([20, 16, 14])
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

  it('reads the bands off the weekly averages, with no doubt when the data is a line', () => {
    // 0.1 lb a day at a steady 20 % fat: each pound is 0.2 fat and 0.8 lean.
    const t = massTrend(mornings(28, 0.1), readings(28, 7, 20))
    expect(t).not.toBeNull()
    if (!t) return
    expect(t.points.map((p) => p.date)).toEqual([day(0), day(7), day(14), day(21)])
    expect(t.days).toBe(21)
    expect(t.weighIns).toBe(28)
    expect(t.readings).toBe(4)
    // Each week is the mean of its seven mornings, three weeks apart first to last.
    expect(t.startWeight).toBeCloseTo(180.3, 1)
    expect(t.weightPerWeek).toBeCloseTo(0.7)
    expect(t.fatPerWeek).toBeCloseTo(0.14, 1)
    expect(t.leanPerWeek).toBeCloseTo(0.56, 1)
    expect(t.fatPerWeekSE).toBeCloseTo(0)
    // The newest week too: the mean of days 21 to 27, not day 27's 182.7.
    const last = t.points[3]
    expect(last.weight).toBeCloseTo(182.4, 1)
    expect(last.bodyFat).toBe(20)
    expect(last.muscleGain).toBeCloseTo(1.7, 1)
    expect(last.fatGain).toBeCloseTo(0.4, 1)
    expect(t.points[2].weight).toBeCloseTo(181.7, 1)
    expect(last.weightError).toBe(0)
    expect(last.muscleError).toBe(0)
    expect(last.fatError).toBe(0)
    // The stack's top is the week's average weight, give or take the tenth each band is rounded to.
    for (const p of t.points) {
      expect(Math.abs(t.startWeight + p.muscleGain + p.fatGain - p.weight)).toBeLessThanOrEqual(0.15)
    }
  })

  it('ends where the newest week is, not where a line over the whole span would', () => {
    // Four flat weeks, then two pounds on in the last ten days.
    const t = massTrend(mornings(38, 0, (i) => (i >= 28 ? 0.2 * (i - 28) : 0)), readings(38, 2, 20))
    if (!t) throw new Error('no trend')
    const last = t.points[t.points.length - 1]
    // The last week's three mornings average 181.6; a line over the whole span ends near 180.9.
    expect(last.weight).toBeGreaterThan(181.3)
    expect(t.points[1].weight).toBeCloseTo(180, 0)
    expect(last.muscleGain + last.fatGain).toBeCloseTo(last.weight - t.startWeight, 0)
  })

  it('widens the give-or-take on each band as the weeks move away from the start', () => {
    const wobble = (i: number) => (i % 2 === 0 ? 0.4 : -0.4)
    const t = massTrend(mornings(42, 0.1, (i) => wobble(i) * 2), readings(42, 2, 20, wobble))
    if (!t) throw new Error('no trend')
    expect(t.points[0]).toMatchObject({ weightError: 0, muscleError: 0, fatError: 0 })
    for (let i = 1; i < t.points.length; i++) {
      const p = t.points[i]
      expect(p.fatError).toBeGreaterThan(0)
      expect(p.muscleError).toBeGreaterThan(0)
      expect(p.weightError).toBeGreaterThan(0)
      // Muscle is the rest of the weight: under half body fat it carries more of
      // the weight's doubt than the fat does, but never more than both together.
      expect(p.muscleError).toBeGreaterThanOrEqual(p.fatError)
      expect(p.muscleError).toBeLessThanOrEqual(p.weightError + p.fatError + 0.1)
    }
    const last = t.points[t.points.length - 1]
    expect(last.fatError).toBeGreaterThan(t.points[1].fatError)
    expect(t.fatPerWeekSE).toBeGreaterThan(0)
    // The dashes are BAND_ERROR_SE errors wide, grown over the weeks since the start.
    const weeksAcross = t.points.length - 1
    expect(last.fatError).toBeCloseTo(BAND_ERROR_SE * t.fatPerWeekSE * weeksAcross, 0)
    expect(BAND_ERROR_SE).toBe(1)
  })

  it('is surer of the fat the more readings it has', () => {
    const wobble = (i: number) => (i % 2 === 0 ? 0.4 : -0.4)
    const sparse = massTrend(mornings(42, 0.1), readings(42, 7, 20, wobble))
    const dense = massTrend(mornings(42, 0.1), readings(42, 1, 20, wobble))
    if (!sparse || !dense) throw new Error('no trend')
    expect(dense.fatPerWeekSE).toBeLessThan(sparse.fatPerWeekSE)
  })

  it('lets one heavy morning move its week by its share of the average, not by a pound', () => {
    const t = massTrend(mornings(28, 0.1, (i) => (i === 10 ? 3 : 0)), readings(28, 7, 20))
    if (!t) throw new Error('no trend')
    const heavy = t.points[1]
    expect(heavy.weight - 181).toBeGreaterThan(0)
    expect(heavy.weight - 181).toBeLessThan(0.5)
    expect(t.weightPerWeek).toBeCloseTo(0.7, 0)
  })

  // Three weeks at 176 and 14 %, then the week of day 21 as it was logged.
  const before = Array.from({ length: 21 }, (_, i) => ({ date: day(i), value: 176 }))
  const fats = Array.from({ length: 11 }, (_, i) => ({ date: day(i * 2), value: 14 }))
  const weekWeights = [
    { date: day(21), value: 179.7 },
    { date: day(22), value: 179.5 },
    { date: day(25), value: 179.8 },
    { date: day(26), value: 178 },
  ]
  const weekFats = [
    { date: day(21), value: 14.4 },
    { date: day(22), value: 14.5 },
    { date: day(25), value: 14.5 },
    { date: day(26), value: 14.3 },
  ]

  it("is Monday's weigh-in and reading on Monday, the only ones the week has", () => {
    const monday = massTrend([...before, weekWeights[0]], [...fats, weekFats[0]])
    expect(monday?.points.at(-1)).toMatchObject({ date: day(21), weight: 179.7, bodyFat: 14.4, weighIns: 1 })
  })

  it('moves the week in progress to the average of what it has so far, not to what was logged last', () => {
    const friday = massTrend([...before, ...weekWeights.slice(0, 3)], [...fats, ...weekFats.slice(0, 3)])
    if (!friday) throw new Error('no trend')
    const last = friday.points.at(-1)
    // (179.7 + 179.5 + 179.8) / 3 and (14.4 + 14.5 + 14.5) / 3.
    expect(last).toMatchObject({ weight: 179.7, bodyFat: 14.5, weighIns: 3 })

    // A light Saturday pulls the average down by its share; it does not become the week.
    const saturday = massTrend([...before, ...weekWeights], [...fats, ...weekFats])
    if (!saturday) throw new Error('no trend')
    const end = saturday.points.at(-1)
    expect(end).toMatchObject({ weight: 179.3, bodyFat: 14.4, weighIns: 4 })
    if (!end) return
    // The stack ends on that average weight, split by that average body fat.
    expect(saturday.startWeight + end.muscleGain + end.fatGain).toBeCloseTo(179.25, 0)
    expect(end.fatGain).toBeCloseTo((179.25 * 14.425 - 176 * 14) / 100, 1)
    expect(end.muscleGain).toBeCloseTo(179.25 * (1 - 0.14425) - 176 * 0.86, 1)
  })

  it("leaves a finished week on its own average when the next week opens, and the new week on its Monday", () => {
    const finished = massTrend([...before, ...weekWeights], [...fats, ...weekFats])
    const nextMonday = massTrend(
      [...before, ...weekWeights, { date: day(28), value: 180.4 }],
      [...fats, ...weekFats, { date: day(28), value: 14.6 }],
    )
    if (!finished || !nextMonday) throw new Error('no trend')
    const was = finished.points.at(-1)
    const now = nextMonday.points.at(-2)
    // Not one figure of the finished week moves, the give-or-takes aside.
    expect(now).toMatchObject({
      date: day(21),
      weight: 179.3,
      bodyFat: 14.4,
      muscleGain: was?.muscleGain,
      fatGain: was?.fatGain,
      weighIns: 4,
    })
    expect(nextMonday.points.at(-1)).toMatchObject({ date: day(28), weight: 180.4, bodyFat: 14.6, weighIns: 1 })
  })

  it('draws every earlier week as its own average too', () => {
    const t = massTrend(
      [...mornings(21, 0), { date: day(21), value: 183 }, { date: day(23), value: 181 }, ...mornings(7, 0).map((m, i) => ({ ...m, date: day(28 + i) }))],
      readings(35, 7, 20),
    )
    if (!t) throw new Error('no trend')
    expect(t.points.map((p) => p.weight)).toEqual([180, 180, 180, 182, 180])
    expect(t.points[3].muscleGain + t.points[3].fatGain).toBeCloseTo(2, 1)
  })

  it('holds the newest body fat reading when this week has a weigh-in and no reading yet', () => {
    const before = Array.from({ length: 21 }, (_, i) => ({ date: day(i), value: 176 }))
    const fats = Array.from({ length: 10 }, (_, i) => ({ date: day(i * 2), value: 14 + i * 0.05 }))
    const t = massTrend([...before, { date: day(22), value: 178 }], fats)
    expect(t?.points.at(-1)).toMatchObject({ weight: 178, bodyFat: 14.5, weighIns: 1 })
  })

  it('does not read a steady bulk weighed on noisy mornings as muscle lost and regained', () => {
    // Half a pound a week at a steady 14 % fat, on a scale that swings a pound
    // and a half either way from one morning to the next: the last morning of
    // a week is as often two pounds under the one before as over it.
    const swing = (i: number) => 1.5 * Math.sin(i * 2.4) + (i % 7 === 6 ? (i % 2 ? 2 : -2) : 0)
    const t = massTrend(mornings(56, 0.5 / 7, swing), readings(56, 2, 14))
    if (!t) throw new Error('no trend')
    const muscle = t.points.map((p) => p.muscleGain)
    for (let i = 1; i < muscle.length; i++) {
      // No week gives back more than half a pound of the muscle before it.
      expect(muscle[i] - muscle[i - 1]).toBeGreaterThan(-0.5)
    }
    expect(muscle[muscle.length - 1]).toBeGreaterThan(2)
  })

  it('ends on figures that split the gain the way the rates the grade reads do', () => {
    // The header prints the last week's two gains and their ratio; the grade
    // under it prints lean's share of the pounds a week. They are one bulk.
    const swing = (i: number) => 1.5 * Math.sin(i * 2.4)
    const t = massTrend(mornings(56, 0.5 / 7, swing), readings(56, 2, 13.5, (i) => i * 0.03))
    if (!t) throw new Error('no trend')
    const last = t.points[t.points.length - 1]
    const shown = last.muscleGain / (last.muscleGain + last.fatGain)
    const graded = t.leanPerWeek / t.weightPerWeek
    expect(Math.abs(shown - graded)).toBeLessThan(0.03)
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

describe('bandEdges', () => {
  it('stacks gains up from the start, muscle first, and hangs losses below it', () => {
    expect(bandEdges({ muscleGain: 3, fatGain: 1 })).toEqual({ seam: 3, top: 4 })
    expect(bandEdges({ muscleGain: -2, fatGain: -1 })).toEqual({ seam: -2, top: -3 })
  })

  it('keeps each band on its own side of the start on a recomp', () => {
    expect(bandEdges({ muscleGain: 3, fatGain: -1 })).toEqual({ seam: 3, top: -1 })
    expect(bandEdges({ muscleGain: -1, fatGain: 2 })).toEqual({ seam: -1, top: 2 })
    expect(bandEdges({ muscleGain: 0, fatGain: 0 })).toEqual({ seam: 0, top: 0 })
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
