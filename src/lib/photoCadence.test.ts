import { describe, expect, it } from 'vitest'
import { dueGate, shotsThisWeek } from './photoCadence'
import { coldGate, type PhotoGate } from './photoSteps'
import type { FlexEntry } from './flex'

const entry = (date: string, fields: Partial<FlexEntry> = {}): FlexEntry => ({
  date,
  splitDeg: null,
  tailorsLeftDeg: null,
  tailorsRightDeg: null,
  ...fields,
})

// 2026-08-03 is a Monday; 2026-08-09 the Sunday closing that week.
const MON = '2026-08-03'
const WED = '2026-08-05'
const SUN = '2026-08-09'
const NEXT_MON = '2026-08-10'

const COLD_GATE = coldGate('side_split')

const WARM_GATE: PhotoGate = {
  id: 'warm-split',
  title: 'warm photos',
  shots: ['warm-tailors', 'warm-split'],
}

describe('shotsThisWeek', () => {
  it('collects shots logged anywhere in the Mon–Sun week', () => {
    const entries = [entry(MON, { coldSplitDeg: 90 }), entry(SUN, { warmSplitDeg: 100 })]
    expect([...shotsThisWeek(entries, WED)].sort()).toEqual(['cold-split', 'warm-split'])
  })

  it('ignores other weeks', () => {
    expect(shotsThisWeek([entry(MON, { coldSplitDeg: 90 })], NEXT_MON).size).toBe(0)
  })

  it('counts a tailor\'s shot from either side', () => {
    expect(shotsThisWeek([entry(WED, { tailorsColdRightDeg: 45 })], WED).has('cold-tailors')).toBe(true)
  })

  it('counts legacy untagged readings as the warm shots', () => {
    const have = shotsThisWeek([entry(WED, { splitDeg: 95, tailorsLeftDeg: 40 })], WED)
    expect([...have].sort()).toEqual(['warm-split', 'warm-tailors'])
  })
})

describe('dueGate', () => {
  it('asks for everything when the week has no readings yet', () => {
    expect(dueGate(COLD_GATE, [], MON)).toBe(COLD_GATE)
  })

  it('skips the screen once the week has every shot', () => {
    const entries = [entry(MON, { coldSplitDeg: 90, tailorsColdLeftDeg: 40 })]
    expect(dueGate(COLD_GATE, entries, WED)).toBeNull()
  })

  it('asks again in a new week', () => {
    const entries = [entry(MON, { coldSplitDeg: 90, tailorsColdLeftDeg: 40 })]
    expect(dueGate(COLD_GATE, entries, NEXT_MON)).toBe(COLD_GATE)
  })

  it('asks for only the shots the week is still missing', () => {
    const entries = [entry(MON, { warmSplitDeg: 100 })]
    expect(dueGate(WARM_GATE, entries, WED)).toEqual({ ...WARM_GATE, shots: ['warm-tailors'] })
  })

  it('passes a null gate through', () => {
    expect(dueGate(null, [], MON)).toBeNull()
  })
})
