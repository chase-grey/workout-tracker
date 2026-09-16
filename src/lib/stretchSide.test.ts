import { describe, expect, it } from 'vitest'
import { dedupeFlexByDate, type FlexEntry } from './flex'
import { nextStretchSide } from './stretchSide'
import { buildSessionSteps } from './flexSteps'
import { FLEX_ROUTINES } from '../config/flexRoutines'

const entry = (over: Partial<FlexEntry> = {}): FlexEntry => ({
  date: '2026-09-15', splitDeg: null, tailorsLeftDeg: null, tailorsRightDeg: null,
  ...over,
})

describe('stretch starting side', () => {
  it('starts new history left and flips legacy left-led routines to right', () => {
    expect(nextStretchSide([], 'head_to_toe')).toBe('left')
    expect(nextStretchSide([entry({ routines: ['head_to_toe'] })], 'head_to_toe')).toBe('right')
    expect(nextStretchSide([entry()], 'side_split')).toBe('right')
    expect(nextStretchSide([entry({ note: 'measurement' })], 'side_split')).toBe('left')
  })

  it('alternates both routines independently through flow, save, merge and reload', () => {
    let history: FlexEntry[] = []
    for (const expected of ['left', 'right', 'left', 'right'] as const) {
      for (const routine of ['side_split', 'head_to_toe'] as const) {
        const side = nextStretchSide(history, routine)
        expect(side).toBe(expected)
        const steps = buildSessionSteps(FLEX_ROUTINES[routine].blocks, { startSide: side })
        const sided = steps.filter((s) => s.kind === 'flex').filter((s) => s.side)
        for (let i = 0; i < sided.length; i += 2) {
          expect(sided[i].side).toBe(side)
          expect(sided[i + 1].side).not.toBe(side)
        }
        history = JSON.parse(JSON.stringify(dedupeFlexByDate([
          ...history, entry({ routines: [routine], startSides: { [routine]: side } }),
        ])))
      }
    }
    expect(history).toHaveLength(1)
    expect(history[0].startSides).toEqual({ side_split: 'right', head_to_toe: 'right' })
  })

  it('keeps the newest side through measurements and older entries', () => {
    const history = dedupeFlexByDate([
      entry({ routines: ['head_to_toe'], startSides: { head_to_toe: 'right' } }),
      entry({ note: 'measurement' }),
      entry({ date: '2026-09-14', routines: ['head_to_toe'] }),
    ])
    expect(nextStretchSide(history, 'head_to_toe')).toBe('left')
  })

  it('does not turn over when all sided work was skipped', () => {
    const history = [
      entry({ date: '2026-09-14', routines: ['head_to_toe'], startSides: { head_to_toe: 'right' } }),
      entry({ routines: ['head_to_toe'], startSides: {} }),
    ]
    expect(nextStretchSide(history, 'head_to_toe')).toBe('left')
  })
})
