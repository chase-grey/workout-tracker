import { describe, it, expect } from 'vitest'
import { buildSetOrder, circuitStations, roundSteps } from './circuit'

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

describe('circuitStations', () => {
  const arms = [{ circuit: 'arms' }, { circuit: 'arms' }, { circuit: 'arms' }]

  it('gives every station of the circuit, from any one of them', () => {
    expect(circuitStations(arms, 0)).toEqual([0, 1, 2])
    expect(circuitStations(arms, 1)).toEqual([0, 1, 2])
    expect(circuitStations(arms, 2)).toEqual([0, 1, 2])
  })

  it('gives nothing for an exercise outside any circuit', () => {
    expect(circuitStations([{}, { circuit: 'a' }], 0)).toEqual([])
  })

  it('stops at the ends of the consecutive run, like buildSetOrder', () => {
    // Same id either side of an unrelated exercise: two separate circuits, and
    // neither reaches through the one between them.
    const day = [{ circuit: 'a' }, { circuit: 'a' }, {}, { circuit: 'a' }]
    expect(circuitStations(day, 1)).toEqual([0, 1])
    expect(circuitStations(day, 3)).toEqual([3])
  })

  it('does not mix two adjacent circuits together', () => {
    const day = [{ circuit: 'a' }, { circuit: 'a' }, { circuit: 'b' }, { circuit: 'b' }]
    expect(circuitStations(day, 0)).toEqual([0, 1])
    expect(circuitStations(day, 3)).toEqual([2, 3])
  })

  it('gives nothing for an index off the end of the day', () => {
    expect(circuitStations(arms, 9)).toEqual([])
  })
})

describe('roundSteps', () => {
  // A press, then a four-station circuit done a round at a time, three rounds.
  const day = [
    {},
    { circuit: 'arms', roundScreen: true },
    { circuit: 'arms', roundScreen: true },
    { circuit: 'arms', roundScreen: true },
    { circuit: 'arms', roundScreen: true },
  ]
  const slots = buildSetOrder(day, [2, 3, 3, 3, 3])
  const none = slots.map(() => false)
  const at = (exIndex: number, setIndex: number) =>
    slots.findIndex((s) => s.exIndex === exIndex && s.setIndex === setIndex)

  it('puts every station of the round on one screen', () => {
    const round = roundSteps(day, slots, none, at(1, 1))
    expect(round.map((i) => slots[i])).toEqual([
      { exIndex: 1, setIndex: 1 },
      { exIndex: 2, setIndex: 1 },
      { exIndex: 3, setIndex: 1 },
      { exIndex: 4, setIndex: 1 },
    ])
  })

  it('gathers the round from whichever station you land on', () => {
    expect(roundSteps(day, slots, none, at(3, 2))).toEqual(roundSteps(day, slots, none, at(1, 2)))
  })

  it('leaves out stations of the round already logged, but never the one on screen', () => {
    const done = none.slice()
    done[at(2, 0)] = true
    done[at(1, 0)] = true
    const round = roundSteps(day, slots, done, at(1, 0))
    expect(round.map((i) => slots[i].exIndex)).toEqual([1, 3, 4])
  })

  it('is just the set on screen outside a round-screen circuit', () => {
    expect(roundSteps(day, slots, none, at(0, 1))).toEqual([at(0, 1)])
    const plain = [{ circuit: 'neck' }, { circuit: 'neck' }]
    expect(roundSteps(plain, buildSetOrder(plain, [3, 3]), [], 2)).toEqual([2])
  })

  it('runs a station with an extra set as a round of one', () => {
    const uneven = buildSetOrder(day, [2, 4, 3, 3, 3])
    const last = uneven.findIndex((s) => s.exIndex === 1 && s.setIndex === 3)
    expect(roundSteps(day, uneven, [], last)).toEqual([last])
  })
})
