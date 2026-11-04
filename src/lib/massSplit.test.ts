import { describe, it, expect } from 'vitest'
import { bodyFatOn, fmtGain, gainRatioLabel, massPoints, MAX_READING_GAP_DAYS, smoothWeights } from './massSplit'

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

describe('smoothWeights', () => {
  it('averages the weigh-ins within three days either side', () => {
    const out = smoothWeights([
      { date: '2026-01-01', value: 180 },
      { date: '2026-01-02', value: 184 },
      { date: '2026-01-03', value: 182 },
      { date: '2026-01-20', value: 190 },
    ])
    expect(out.map((p) => p.value)).toEqual([182, 182, 182, 190])
  })

  it('sorts by date whatever order it was handed', () => {
    const out = smoothWeights([
      { date: '2026-01-10', value: 185 },
      { date: '2026-01-01', value: 180 },
    ])
    expect(out.map((p) => p.date)).toEqual(['2026-01-01', '2026-01-10'])
  })
})

describe('massPoints', () => {
  const bodyFat = [
    { date: '2026-01-01', value: 20 },
    { date: '2026-01-21', value: 20 },
  ]

  it('leaves out weigh-ins from before the first reading', () => {
    const out = massPoints([{ date: '2025-12-01', value: 170 }, { date: '2026-01-01', value: 180 }], bodyFat)
    expect(out.map((p) => p.date)).toEqual(['2026-01-01'])
  })

  it('splits each weigh-in by the body fat in force and reads gains off the first', () => {
    const out = massPoints(
      [
        { date: '2026-01-01', value: 180 },
        { date: '2026-01-21', value: 190 },
      ],
      bodyFat,
    )
    expect(out[0]).toMatchObject({ weight: 180, bodyFat: 20, lean: 144, fat: 36, muscleGain: 0, fatGain: 0 })
    expect(out[1]).toMatchObject({ weight: 190, bodyFat: 20, lean: 152, fat: 38, muscleGain: 8, fatGain: 2 })
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
    expect(out.map((p) => p.date)).toEqual(['2026-09-29', '2026-10-14'])
    expect(out[0].muscleGain).toBe(0)
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
