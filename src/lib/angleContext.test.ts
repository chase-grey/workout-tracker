import { describe, expect, it } from 'vitest'
import { angleTrends, TREND_POINTS } from './angleContext'
import type { FlexEntry } from './flex'

const entry = (date: string, fields: Partial<FlexEntry> = {}): FlexEntry => ({
  date,
  splitDeg: null,
  tailorsLeftDeg: null,
  tailorsRightDeg: null,
  ...fields,
})

const TODAY = '2026-08-05'

describe('angleTrends', () => {
  it('compares a warm split against the last earlier session', () => {
    const entries = [
      entry('2026-07-22', { warmSplitDeg: 110 }),
      entry('2026-07-29', { warmSplitDeg: 114 }),
    ]
    const [row] = angleTrends(entries, { splitDeg: 118 }, 'warm', TODAY)

    expect(row.metric).toBe('split')
    expect(row.value).toBe(118)
    expect(row.prev).toEqual({ date: '2026-07-29', value: 114 })
    expect(row.delta).toBe(4)
  })

  it('ignores same-day entries so a reading is not compared against itself', () => {
    const entries = [
      entry('2026-07-29', { warmSplitDeg: 114 }),
      // The capture being measured, already logged by the time the card renders.
      entry(TODAY, { warmSplitDeg: 118 }),
    ]
    const [row] = angleTrends(entries, { splitDeg: 118 }, 'warm', TODAY)

    expect(row.prev).toEqual({ date: '2026-07-29', value: 114 })
    expect(row.priorBest).toBe(114)
    expect(row.isBest).toBe(true)
  })

  it('reports a new best only when it beats every earlier reading', () => {
    const entries = [
      entry('2026-07-22', { warmSplitDeg: 120 }),
      entry('2026-07-29', { warmSplitDeg: 114 }),
    ]
    const beaten = angleTrends(entries, { splitDeg: 118 }, 'warm', TODAY)[0]
    expect(beaten.priorBest).toBe(120)
    expect(beaten.isBest).toBe(false)

    const best = angleTrends(entries, { splitDeg: 121 }, 'warm', TODAY)[0]
    expect(best.isBest).toBe(true)
  })

  it('has no previous or best on the first reading', () => {
    const [row] = angleTrends([], { splitDeg: 96 }, 'cold', TODAY)
    expect(row.prev).toBeNull()
    expect(row.delta).toBeNull()
    expect(row.priorBest).toBeNull()
    expect(row.isBest).toBe(false)
  })

  it('reads cold against cold, leaving warm readings out of it', () => {
    const entries = [entry('2026-07-29', { coldSplitDeg: 100, warmSplitDeg: 114 })]
    const [row] = angleTrends(entries, { splitDeg: 104 }, 'cold', TODAY)

    expect(row.prev).toEqual({ date: '2026-07-29', value: 100 })
    expect(row.delta).toBe(4)
  })

  it("counts a legacy untagged split as a previous warm reading", () => {
    const entries = [entry('2026-07-29', { splitDeg: 112 })]
    expect(angleTrends(entries, { splitDeg: 116 }, 'warm', TODAY)[0].delta).toBe(4)
    expect(angleTrends(entries, { splitDeg: 116 }, 'cold', TODAY)[0].prev).toBeNull()
  })

  it("carries today's cold reading on a warm shot, and never on a cold one", () => {
    const entries = [entry(TODAY, { coldSplitDeg: 109 })]
    expect(angleTrends(entries, { splitDeg: 118 }, 'warm', TODAY)[0].coldToday).toBe(109)
    expect(angleTrends(entries, { splitDeg: 109 }, 'cold', TODAY)[0].coldToday).toBeNull()
  })

  it('points at the lowest goal the reading has not cleared', () => {
    expect(angleTrends([], { splitDeg: 118 }, 'warm', TODAY)[0].goal).toEqual({
      target: 120,
      toGo: 2,
    })
    // Past every split goal — nothing left to aim at.
    expect(angleTrends([], { splitDeg: 181 }, 'warm', TODAY)[0].goal).toBeNull()
  })

  it("gives tailor's shots a row per side, each with its own history", () => {
    const entries = [entry('2026-07-29', { tailorsWarmLeftDeg: 60, tailorsWarmRightDeg: 64 })]
    const rows = angleTrends(entries, { tailorsLeftDeg: 62, tailorsRightDeg: 63 }, 'warm', TODAY)

    expect(rows.map((r) => r.metric)).toEqual(['tailorsLeft', 'tailorsRight'])
    expect(rows[0].delta).toBe(2)
    expect(rows[1].delta).toBe(-1)
    expect(rows[0].goal).toEqual({ target: 70, toGo: 8 })
  })

  it('ends the trend on the new reading and keeps it short', () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      entry(`2026-0${i < 5 ? 1 : 2}-0${(i % 5) + 1}`, { warmSplitDeg: 100 + i }),
    )
    const [row] = angleTrends(entries, { splitDeg: 118 }, 'warm', TODAY)

    expect(row.history).toHaveLength(TREND_POINTS)
    expect(row.history[row.history.length - 1]).toEqual({ date: TODAY, value: 118 })
    // Oldest-first, so the sparkline runs left to right in time.
    expect(row.history.map((p) => p.date)).toEqual([...row.history.map((p) => p.date)].sort())
  })

  it('skips angles the measurement did not produce', () => {
    expect(angleTrends([], { splitDeg: 118 }, 'warm', TODAY).map((r) => r.metric)).toEqual(['split'])
    expect(angleTrends([], {}, 'warm', TODAY)).toEqual([])
  })
})
