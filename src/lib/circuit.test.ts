import { describe, it, expect } from 'vitest'
import { buildSetOrder } from './circuit'

describe('buildSetOrder', () => {
  it('runs a non-circuit day one exercise at a time', () => {
    const order = buildSetOrder([{}, {}], [2, 2])
    expect(order).toEqual([
      { exIndex: 0, setIndex: 0 },
      { exIndex: 0, setIndex: 1 },
      { exIndex: 1, setIndex: 0 },
      { exIndex: 1, setIndex: 1 },
    ])
  })

  it('rotates through circuit stations round by round', () => {
    // pushdown → lateral raise → overhead extension, three rounds.
    const order = buildSetOrder(
      [{ circuit: 'arms' }, { circuit: 'arms' }, { circuit: 'arms' }],
      [3, 3, 3],
    )
    expect(order.map((s) => s.exIndex)).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2])
    expect(order.map((s) => s.setIndex)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2])
  })

  it('never puts two sets of the same station back to back', () => {
    const order = buildSetOrder([{ circuit: 'a' }, { circuit: 'a' }], [3, 3])
    for (let i = 1; i < order.length; i++) {
      expect(order[i].exIndex).not.toBe(order[i - 1].exIndex)
    }
  })

  it('skips a station that has run out of sets', () => {
    const order = buildSetOrder([{ circuit: 'a' }, { circuit: 'a' }], [1, 3])
    expect(order).toEqual([
      { exIndex: 0, setIndex: 0 },
      { exIndex: 1, setIndex: 0 },
      { exIndex: 1, setIndex: 1 },
      { exIndex: 1, setIndex: 2 },
    ])
  })

  it('keeps a circuit local to its consecutive run', () => {
    // The same id reused after a gap is a separate circuit, not one that reaches
    // back across the exercise in between.
    const order = buildSetOrder([{ circuit: 'a' }, {}, { circuit: 'a' }], [2, 1, 2])
    expect(order.map((s) => s.exIndex)).toEqual([0, 0, 1, 2, 2])
  })

  it('mixes plain exercises and circuits in list order', () => {
    const order = buildSetOrder([{}, { circuit: 'a' }, { circuit: 'a' }], [2, 2, 2])
    expect(order.map((s) => s.exIndex)).toEqual([0, 0, 1, 2, 1, 2])
  })

  it('emits nothing for an exercise with no sets', () => {
    expect(buildSetOrder([{}], [0])).toEqual([])
    expect(buildSetOrder([{ circuit: 'a' }, { circuit: 'a' }], [0, 0])).toEqual([])
  })

  it('totals exactly the sets it was given', () => {
    const counts = [4, 3, 3]
    const order = buildSetOrder([{ circuit: 'a' }, { circuit: 'a' }, { circuit: 'a' }], counts)
    expect(order).toHaveLength(counts.reduce((a, b) => a + b, 0))
  })
})
