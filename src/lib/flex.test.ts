import { describe, it, expect } from 'vitest'
import {
  dedupeFlexByDate,
  flexStats,
  splitSeries,
  tailorsAvgSeries,
  tailorsSeries,
  type FlexEntry,
} from './flex'

// Fixed "today": Wednesday, 2026-07-08. Its Mon–Sun week is 2026-07-06 … 2026-07-12.
const TODAY = new Date(2026, 6, 8)

/** A blank entry with all angles null; override the fields a test cares about. */
function entry(over: Partial<FlexEntry> & { date: string }): FlexEntry {
  return {
    splitDeg: null,
    tailorsLeftDeg: null,
    tailorsRightDeg: null,
    ...over,
  }
}

describe('dedupeFlexByDate', () => {
  it('merges a measurement and a marker on the same date, kept once', () => {
    const entries: FlexEntry[] = [
      entry({ date: '2026-07-06' }), // marker (all null)
      entry({ date: '2026-07-06', splitDeg: 150, tailorsLeftDeg: 40 }), // measurement
      entry({ date: '2026-07-07' }),
    ]
    const out = dedupeFlexByDate(entries)
    expect(out).toHaveLength(2)
    const merged = out.find((e) => e.date === '2026-07-06')!
    expect(merged.splitDeg).toBe(150)
    expect(merged.tailorsLeftDeg).toBe(40)
    expect(merged.tailorsRightDeg).toBeNull()
  })

  it('keeps the latest non-null value per field and the latest non-empty note', () => {
    const entries: FlexEntry[] = [
      entry({ date: '2026-07-06', splitDeg: 150, note: 'first' }),
      entry({ date: '2026-07-06', splitDeg: null, tailorsRightDeg: 42 }), // does not clobber split
      entry({ date: '2026-07-06', splitDeg: 155, note: '' }), // does not clobber note
      entry({ date: '2026-07-06', note: 'latest note' }),
    ]
    const out = dedupeFlexByDate(entries)
    expect(out).toHaveLength(1)
    expect(out[0].splitDeg).toBe(155)
    expect(out[0].tailorsRightDeg).toBe(42)
    expect(out[0].note).toBe('latest note')
  })

  it('sorts ascending by date', () => {
    const out = dedupeFlexByDate([
      entry({ date: '2026-07-08' }),
      entry({ date: '2026-07-01' }),
      entry({ date: '2026-07-05' }),
    ])
    expect(out.map((e) => e.date)).toEqual([
      '2026-07-01',
      '2026-07-05',
      '2026-07-08',
    ])
  })
})

describe('flexStats', () => {
  it('counts distinct in-week dates, including all-null markers', () => {
    const entries: FlexEntry[] = [
      entry({ date: '2026-07-06', splitDeg: 150 }), // Mon, in week
      entry({ date: '2026-07-06', splitDeg: 151 }), // dup date, same week
      entry({ date: '2026-07-08', note: 'did my stretch' }), // in week, marker
      entry({ date: '2026-07-12', splitDeg: 152 }), // Sun, in week
      entry({ date: '2026-07-05', splitDeg: 149 }), // prev week
      entry({ date: '2026-07-13', splitDeg: 153 }), // next week
    ]
    const s = flexStats(entries, TODAY)
    expect(s.sessionsThisWeek).toBe(3) // distinct dates: 07-06, 07-08, 07-12
    expect(s.weeklyGoal).toBe(2)
  })

  it('honors a custom weeklyGoal', () => {
    const s = flexStats([], TODAY, { weeklyGoal: 3 })
    expect(s.weeklyGoal).toBe(3)
  })

  it('per metric: latest picks the newest entry with a value, best is the max, ignoring nulls', () => {
    const entries: FlexEntry[] = [
      entry({ date: '2026-06-01', splitDeg: 140, tailorsLeftDeg: 30, tailorsRightDeg: 32 }),
      entry({ date: '2026-06-15', splitDeg: 165, tailorsLeftDeg: 45 }),
      entry({ date: '2026-07-01', splitDeg: 155, tailorsRightDeg: 50 }),
      entry({ date: '2026-07-08' }), // newest date, all null — ignored everywhere
    ]
    const s = flexStats(entries, TODAY)

    expect(s.warmSplit.latest).toBe(155) // legacy splitDeg counts as warm; newest is 07-01
    expect(s.warmSplit.best).toBe(165)

    expect(s.tailorsLeft.latest).toBe(45) // newest non-null left is 06-15
    expect(s.tailorsLeft.best).toBe(45)

    expect(s.tailorsRight.latest).toBe(50) // newest non-null right is 07-01
    expect(s.tailorsRight.best).toBe(50)
  })

  it('returns null latest/best when a metric has no measurements', () => {
    const entries: FlexEntry[] = [
      entry({ date: '2026-07-06' }),
      entry({ date: '2026-07-08' }),
    ]
    const s = flexStats(entries, TODAY)
    expect(s.coldSplit).toEqual({ latest: null, best: null })
    expect(s.warmSplit).toEqual({ latest: null, best: null })
    expect(s.tailorsLeft).toEqual({ latest: null, best: null })
    expect(s.tailorsRight).toEqual({ latest: null, best: null })
  })

  it('tracks cold and warm split independently', () => {
    const entries: FlexEntry[] = [
      entry({ date: '2026-06-01', coldSplitDeg: 80, warmSplitDeg: 95 }),
      entry({ date: '2026-06-15', coldSplitDeg: 84, warmSplitDeg: 100 }),
      entry({ date: '2026-07-01', splitDeg: 120 }), // legacy untagged → warm only
    ]
    const s = flexStats(entries, TODAY)
    expect(s.coldSplit).toEqual({ latest: 84, best: 84 })
    expect(s.warmSplit).toEqual({ latest: 120, best: 120 }) // legacy split is newest warm
  })

  it("tracks cold and warm tailor's independently", () => {
    const entries: FlexEntry[] = [
      entry({
        date: '2026-06-01',
        tailorsColdLeftDeg: 40,
        tailorsColdRightDeg: 42,
        tailorsWarmLeftDeg: 55,
        tailorsWarmRightDeg: 58,
      }),
      entry({ date: '2026-07-01', tailorsLeftDeg: 60, tailorsRightDeg: 61 }), // legacy → warm only
    ]
    const s = flexStats(entries, TODAY)
    expect(s.coldTailorsLeft).toEqual({ latest: 40, best: 40 })
    expect(s.coldTailorsRight).toEqual({ latest: 42, best: 42 })
    expect(s.tailorsLeft).toEqual({ latest: 60, best: 60 }) // legacy pair is newest warm
    expect(s.tailorsRight).toEqual({ latest: 61, best: 61 })
  })

  it("prefers the tagged warm tailor's reading over the legacy pair on one entry", () => {
    const entries: FlexEntry[] = [
      entry({ date: '2026-07-01', tailorsLeftDeg: 50, tailorsWarmLeftDeg: 57 }),
    ]
    expect(flexStats(entries, TODAY).tailorsLeft).toEqual({ latest: 57, best: 57 })
  })
})

describe('splitSeries', () => {
  it('emits a cold/warm row per date with a reading, sorted ascending', () => {
    const entries: FlexEntry[] = [
      entry({ date: '2026-07-08', coldSplitDeg: 90, warmSplitDeg: 108 }),
      entry({ date: '2026-07-01', splitDeg: 150 }), // legacy untagged → warm, cold null
      entry({ date: '2026-07-05' }), // no split — excluded
      entry({ date: '2026-07-05', tailorsLeftDeg: 40 }), // no split — excluded
    ]
    expect(splitSeries(entries)).toEqual([
      { date: '2026-07-01', cold: null, warm: 150 },
      { date: '2026-07-08', cold: 90, warm: 108 },
    ])
  })
})

describe('tailorsSeries', () => {
  it('emits a cold/warm L/R row per date with a reading, sorted ascending', () => {
    const entries: FlexEntry[] = [
      entry({
        date: '2026-07-08',
        tailorsColdLeftDeg: 44,
        tailorsColdRightDeg: 46,
        tailorsWarmLeftDeg: 57,
        tailorsWarmRightDeg: 59,
      }),
      entry({ date: '2026-07-01', tailorsLeftDeg: 40 }), // legacy untagged → warm, cold null
      entry({ date: '2026-07-05', splitDeg: 155 }), // no tailor's — excluded
    ]
    expect(tailorsSeries(entries)).toEqual([
      { date: '2026-07-01', coldLeft: null, coldRight: null, warmLeft: 40, warmRight: null },
      { date: '2026-07-08', coldLeft: 44, coldRight: 46, warmLeft: 57, warmRight: 59 },
    ])
  })
})

describe('tailorsAvgSeries', () => {
  it('averages available warm L/R values, filters entries with none, and sorts', () => {
    const entries: FlexEntry[] = [
      entry({ date: '2026-07-08', tailorsLeftDeg: 40, tailorsRightDeg: 50 }), // avg 45
      entry({ date: '2026-07-01', tailorsLeftDeg: 30 }), // only left — avg of the one = 30
      entry({ date: '2026-07-03', tailorsRightDeg: 60 }), // only right — avg of the one = 60
      entry({ date: '2026-07-04', splitDeg: 155 }), // no tailor's — excluded
    ]
    expect(tailorsAvgSeries(entries)).toEqual([
      { date: '2026-07-01', value: 30 },
      { date: '2026-07-03', value: 60 },
      { date: '2026-07-08', value: 45 },
    ])
  })

  it("ignores the cold reading and never lets it stand in for warm", () => {
    const entries: FlexEntry[] = [
      entry({ date: '2026-07-02', tailorsColdLeftDeg: 40, tailorsColdRightDeg: 42 }),
      entry({ date: '2026-07-09', tailorsColdLeftDeg: 41, tailorsWarmLeftDeg: 58 }),
    ]
    expect(tailorsAvgSeries(entries)).toEqual([{ date: '2026-07-09', value: 58 }])
  })
})
