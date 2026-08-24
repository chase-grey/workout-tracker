import { describe, it, expect } from 'vitest'
import {
  coldLegLiftLeftOf,
  coldLegLiftRightOf,
  coldToeTouchOf,
  dedupeFlexByDate,
  flexStats,
  legLiftSeries,
  splitSeries,
  tailorsAvgSeries,
  tailorsSeries,
  toeTouchSeries,
  warmLegLiftLeftOf,
  warmLegLiftRightOf,
  warmToeTouchOf,
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

describe('the head-to-toe angle fields', () => {
  it('reads cold and warm apart, with no legacy fallback', () => {
    const e = entry({ date: '2026-08-24',
      coldToeTouchDeg: 118,
      warmToeTouchDeg: 96,
      coldLegLiftLeftDeg: 70,
      warmLegLiftLeftDeg: 84,
      coldLegLiftRightDeg: 68,
      warmLegLiftRightDeg: 80,
    })
    expect(coldToeTouchOf(e)).toBe(118)
    expect(warmToeTouchOf(e)).toBe(96)
    expect(coldLegLiftLeftOf(e)).toBe(70)
    expect(warmLegLiftLeftOf(e)).toBe(84)
    expect(coldLegLiftRightOf(e)).toBe(68)
    expect(warmLegLiftRightOf(e)).toBe(80)
  })

  it('is null on an entry that never carried one', () => {
    const e = entry({ date: '2026-08-24', splitDeg: 120 })
    expect(warmToeTouchOf(e)).toBeNull()
    expect(warmLegLiftLeftOf(e)).toBeNull()
  })
})

describe('dedupeFlexByDate — the head-to-toe fields', () => {
  it('keeps the latest non-null reading per field, like the rest', () => {
    const merged = dedupeFlexByDate([
      entry({ date: '2026-08-24', coldToeTouchDeg: 118 }),
      entry({ date: '2026-08-24', warmToeTouchDeg: 96, warmLegLiftLeftDeg: 84 }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].coldToeTouchDeg).toBe(118)
    expect(merged[0].warmToeTouchDeg).toBe(96)
    expect(merged[0].warmLegLiftLeftDeg).toBe(84)
  })
})

describe('dedupeFlexByDate — routines', () => {
  it('unions a day that ran both, in completion order', () => {
    const merged = dedupeFlexByDate([
      entry({ date: '2026-08-24', routines: ['head_to_toe'] }),
      entry({ date: '2026-08-24', routines: ['side_split'] }),
    ])
    expect(merged[0].routines).toEqual(['head_to_toe', 'side_split'])
  })

  it('does not let a second sync of the same routine duplicate it', () => {
    const merged = dedupeFlexByDate([
      entry({ date: '2026-08-24', routines: ['side_split'] }),
      entry({ date: '2026-08-24', routines: ['side_split'] }),
    ])
    expect(merged[0].routines).toEqual(['side_split'])
  })

  // A measurement logged after the session must not wipe the routine off the day.
  it('keeps the routine through an untagged entry on the same date', () => {
    const merged = dedupeFlexByDate([
      entry({ date: '2026-08-24', routines: ['head_to_toe'] }),
      entry({ date: '2026-08-24', note: 'measurement', coldToeTouchDeg: 118 }),
    ])
    expect(merged[0].routines).toEqual(['head_to_toe'])
  })

  it('leaves the field off a date that recorded none', () => {
    expect(dedupeFlexByDate([entry({ date: '2026-08-24' })])[0].routines).toBeUndefined()
  })
})

describe('toeTouchSeries', () => {
  it('carries cold and warm per date, oldest first', () => {
    const series = toeTouchSeries([
      entry({ date: '2026-08-24', coldToeTouchDeg: 110, warmToeTouchDeg: 92 }),
      entry({ date: '2026-08-20', warmToeTouchDeg: 99 }),
    ])
    expect(series).toEqual([
      { date: '2026-08-20', cold: null, warm: 99 },
      { date: '2026-08-24', cold: 110, warm: 92 },
    ])
  })

  it('drops a date with neither reading', () => {
    expect(toeTouchSeries([entry({ date: '2026-08-24', splitDeg: 120 })])).toEqual([])
  })
})

describe('legLiftSeries', () => {
  it('carries all four readings per date, oldest first', () => {
    const series = legLiftSeries([
      entry({ date: '2026-08-24', warmLegLiftLeftDeg: 84, coldLegLiftRightDeg: 66 }),
      entry({ date: '2026-08-20', coldLegLiftLeftDeg: 62 }),
    ])
    expect(series).toEqual([
      { date: '2026-08-20', coldLeft: 62, coldRight: null, warmLeft: null, warmRight: null },
      { date: '2026-08-24', coldLeft: null, coldRight: 66, warmLeft: 84, warmRight: null },
    ])
  })

  it('drops a date with no leg-lift reading at all', () => {
    expect(legLiftSeries([entry({ date: '2026-08-24', warmToeTouchDeg: 92 })])).toEqual([])
  })
})

describe('flexStats — which way each pose improves', () => {
  const entries = [
    entry({ date: '2026-08-20', warmToeTouchDeg: 104, warmLegLiftLeftDeg: 70 }),
    entry({ date: '2026-08-24', warmToeTouchDeg: 96, warmLegLiftLeftDeg: 84 }),
    entry({ date: '2026-08-22', warmToeTouchDeg: 112, warmLegLiftLeftDeg: 62 }),
  ]

  // The fold's best is its smallest reading — a max would report the shallowest
  // fold of the week as the personal best.
  it('takes the toe touch’s best as its lowest', () => {
    const s = flexStats(entries)
    expect(s.warmToeTouch.best).toBe(96)
    expect(s.warmToeTouch.latest).toBe(96)
  })

  it('takes the leg lift’s best as its highest', () => {
    const s = flexStats(entries)
    expect(s.legLiftLeft.best).toBe(84)
    expect(s.legLiftLeft.latest).toBe(84)
  })

  it('reports the cold readings apart from the warm ones', () => {
    const s = flexStats([entry({ date: '2026-08-24', coldToeTouchDeg: 130, warmToeTouchDeg: 96 })])
    expect(s.coldToeTouch.latest).toBe(130)
    expect(s.warmToeTouch.latest).toBe(96)
  })
})
