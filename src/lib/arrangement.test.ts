import { describe, expect, it } from 'vitest'
import { arrange, dropAt, isComboId, type Arrangement } from './arrangement'
import { buildSetOrder } from './circuit'
import { dayEntries } from './circuitEntry'
import { restBeforeNextSet, CIRCUIT_STATION_REST_SEC } from './rest'
import { DEFAULT_PLAN } from '../config/plan'
import { performedExercises } from './performed'

type Ex = { key: string; circuit?: string; circuitRestSec?: number; circuitRoundRestSec?: number; roundScreen?: boolean; restSec?: number }

const ex = (key: string, extra: Partial<Ex> = {}): Ex => ({ key, ...extra })

/** bench, row, then a three-station plan circuit run a round at a time, then curl. */
const day: Ex[] = [
  ex('bench'),
  ex('row'),
  ex('push', { circuit: 'arms', roundScreen: true, circuitRoundRestSec: 120 }),
  ex('raise', { circuit: 'arms', roundScreen: true, circuitRoundRestSec: 120 }),
  ex('ext', { circuit: 'arms', roundScreen: true, circuitRoundRestSec: 120, circuitRestSec: 0 }),
  ex('curl'),
]

/** The list as its entries: a key, or `[a+b]` for a circuit. */
const shape = (list: readonly Ex[]) =>
  dayEntries(list).map((e) => (e.kind === 'circuit' ? `[${e.stations.map((s) => s.key).join('+')}]` : e.exercise.key))

const after = (natural: Ex[], a: Arrangement | null, keys: string[], target: Parameters<typeof dropAt>[3]) => {
  const next = dropAt(natural, a, keys, target)
  return { next, list: arrange(natural, next) }
}

describe('arrange', () => {
  it('hands the day back untouched when nothing has been rearranged', () => {
    expect(arrange(day, null)).toBe(day)
    expect(arrange(day, undefined)).toBe(day)
  })

  it('puts the day in the arranged order', () => {
    const list = arrange(day, { order: ['curl', 'bench', 'push', 'raise', 'ext', 'row'], circuits: {} })
    expect(shape(list)).toEqual(['curl', 'bench', '[push+raise+ext]', 'row'])
  })

  it('lands an exercise it has never seen after the one the day puts it after', () => {
    const a: Arrangement = { order: ['row', 'bench'], circuits: {} }
    expect(arrange([ex('bench'), ex('dips'), ex('row')], a).map((e) => e.key)).toEqual(['row', 'bench', 'dips'])
    expect(arrange([ex('warmup'), ex('bench'), ex('row')], a).map((e) => e.key)).toEqual(['warmup', 'row', 'bench'])
  })

  it("lands a new arrival past the end of its neighbour's circuit rather than inside it", () => {
    const a: Arrangement = { order: ['bench', 'row'], circuits: { bench: 'combo:1', row: 'combo:1' } }
    const list = arrange([ex('bench'), ex('dips'), ex('row')], a)
    expect(shape(list)).toEqual(['[bench+row]', 'dips'])
  })

  it('reads a station left alone in a circuit as a plain exercise', () => {
    const a: Arrangement = { order: ['bench', 'row'], circuits: { bench: 'combo:1' } }
    const list = arrange([ex('bench'), ex('row')], a)
    expect(list.every((e) => e.circuit == null)).toBe(true)
  })

  it('forgets an exercise that is no longer in the day', () => {
    const a: Arrangement = { order: ['gone', 'row', 'bench'], circuits: { gone: 'combo:1', row: 'combo:1' } }
    const list = arrange([ex('bench'), ex('row')], a)
    expect(list.map((e) => e.key)).toEqual(['row', 'bench'])
    expect(list[0].circuit).toBeUndefined()
  })
})

describe('dropAt', () => {
  it('moves a row dropped into a gap', () => {
    expect(shape(after(day, null, ['curl'], { kind: 'gap', index: 0 }).list)).toEqual(['curl', 'bench', 'row', '[push+raise+ext]'])
    expect(shape(after(day, null, ['bench'], { kind: 'gap', index: 4 }).list)).toEqual(['row', '[push+raise+ext]', 'curl', 'bench'])
    expect(shape(after(day, null, ['bench'], { kind: 'gap', index: 2 }).list)).toEqual(['row', 'bench', '[push+raise+ext]', 'curl'])
  })

  it('moves a whole circuit as the circuit it is', () => {
    const { list } = after(day, null, ['push', 'raise', 'ext'], { kind: 'gap', index: 0 })
    expect(shape(list)).toEqual(['[push+raise+ext]', 'bench', 'row', 'curl'])
    expect(list[0]).toEqual(day[2])
  })

  it('changes nothing when a row is dropped where it already is', () => {
    expect(dropAt(day, null, ['bench'], { kind: 'gap', index: 0 })).toBeNull()
    expect(dropAt(day, null, ['bench'], { kind: 'gap', index: 1 })).toBeNull()
    const a = dropAt(day, null, ['bench'], { kind: 'gap', index: 2 })
    expect(dropAt(day, a, ['bench'], { kind: 'gap', index: 1 })).toBe(a)
    expect(dropAt(day, a, ['nothing'], { kind: 'gap', index: 0 })).toBe(a)
  })

  it('joins two exercises into a circuit when one is dropped onto the other', () => {
    const { next, list } = after(day, null, ['curl'], { kind: 'onto', index: 0 })
    expect(shape(list)).toEqual(['[bench+curl]', 'row', '[push+raise+ext]'])
    expect(isComboId(list[0].circuit)).toBe(true)
    expect(list[1].circuit).toBe(list[0].circuit)
    expect(next?.circuits).toEqual({ bench: 'combo:1', curl: 'combo:1' })
    // A plain rotation: not a round to a screen, no round rest of its own.
    expect(list[0].roundScreen).toBeUndefined()
    expect(list[0].circuitRoundRestSec).toBeUndefined()
  })

  it('gives a second circuit made by hand an id of its own', () => {
    const many = [ex('a'), ex('b'), ex('c'), ex('d')]
    const first = dropAt(many, null, ['b'], { kind: 'onto', index: 0 })
    const { list } = after(many, first, ['d'], { kind: 'onto', index: 1 })
    expect(shape(list)).toEqual(['[a+b]', '[c+d]'])
    expect(list[0].circuit).not.toBe(list[2].circuit)
  })

  it('adds a station to a circuit it is dropped onto', () => {
    const first = dropAt(day, null, ['curl'], { kind: 'onto', index: 0 })
    const { list } = after(day, first, ['row'], { kind: 'onto', index: 0 })
    expect(shape(list)).toEqual(['[bench+curl+row]', '[push+raise+ext]'])
  })

  it("runs a station dropped into one of the plan's circuits the way that circuit is run", () => {
    const { next, list } = after(day, null, ['curl'], { kind: 'onto', index: 2 })
    expect(shape(list)).toEqual(['bench', 'row', '[push+raise+ext+curl]'])
    expect(list[5]).toMatchObject({ key: 'curl', circuit: 'arms', roundScreen: true, circuitRoundRestSec: 120 })
    expect(next?.circuits).toEqual({ curl: 'arms' })
  })

  it('merges a circuit dropped onto an exercise, and onto another circuit', () => {
    expect(shape(after(day, null, ['push', 'raise', 'ext'], { kind: 'onto', index: 0 }).list)).toEqual(['[bench+push+raise+ext]', 'row', 'curl'])
    const combo = dropAt(day, null, ['row'], { kind: 'onto', index: 0 })
    expect(shape(arrange(day, combo))).toEqual(['[bench+row]', '[push+raise+ext]', 'curl'])
    const { list } = after(day, combo, ['bench', 'row'], { kind: 'onto', index: 1 })
    expect(shape(list)).toEqual(['[push+raise+ext+bench+row]', 'curl'])
    expect(list.slice(0, 5).every((e) => e.circuit === 'arms' && e.roundScreen)).toBe(true)
  })

  it('takes a station out of its circuit when it is dragged to a gap', () => {
    const { next, list } = after(day, null, ['raise'], { kind: 'gap', index: 0 })
    expect(shape(list)).toEqual(['raise', 'bench', 'row', '[push+ext]', 'curl'])
    expect(list[0]).toEqual({ key: 'raise' })
    expect(next?.circuits).toEqual({ raise: null })
  })

  it('takes a station out to the gap right beside its circuit', () => {
    expect(shape(after(day, null, ['raise'], { kind: 'gap', index: 2 }).list)).toEqual(['bench', 'row', 'raise', '[push+ext]', 'curl'])
    expect(shape(after(day, null, ['raise'], { kind: 'gap', index: 3 }).list)).toEqual(['bench', 'row', '[push+ext]', 'raise', 'curl'])
  })

  it('dissolves a circuit left with one station', () => {
    const combo = dropAt(day, null, ['curl'], { kind: 'onto', index: 0 })
    const { next, list } = after(day, combo, ['curl'], { kind: 'gap', index: 4 })
    expect(shape(list)).toEqual(['bench', 'row', '[push+raise+ext]', 'curl'])
    expect(list.find((e) => e.key === 'bench')).toEqual({ key: 'bench' })
    expect(next?.circuits).toEqual({})

    const pair = [ex('a', { circuit: 'p', roundScreen: true, circuitRoundRestSec: 60 }), ex('b', { circuit: 'p', roundScreen: true, circuitRoundRestSec: 60 }), ex('c')]
    const split = after(pair, null, ['b'], { kind: 'gap', index: 2 })
    expect(shape(split.list)).toEqual(['a', 'c', 'b'])
    expect(split.list.every((e) => e.circuit == null && !e.roundScreen && e.circuitRoundRestSec == null)).toBe(true)
  })

  it('puts a station back into the circuit the plan had it in, with nothing left to remember', () => {
    const out = dropAt(day, null, ['raise'], { kind: 'gap', index: 0 })
    const { next, list } = after(day, out, ['raise'], { kind: 'onto', index: 3 })
    expect(shape(list)).toEqual(['bench', 'row', '[push+ext+raise]', 'curl'])
    expect(next?.circuits).toEqual({})
    expect(list[4]).toEqual(day[3])
  })

  it('changes nothing when a row is dropped onto itself or a station onto its own circuit', () => {
    expect(dropAt(day, null, ['bench'], { kind: 'onto', index: 0 })).toBeNull()
    expect(dropAt(day, null, ['raise'], { kind: 'onto', index: 2 })).toBeNull()
    expect(dropAt(day, null, ['bench'], { kind: 'onto', index: 9 })).toBeNull()
  })

  it('moves both sides of a pair together, each side its own row', () => {
    const sided = [ex('a'), ex('hip_l'), ex('hip_r'), ex('b')]
    expect(shape(after(sided, null, ['hip_l', 'hip_r'], { kind: 'gap', index: 4 }).list)).toEqual(['a', 'b', 'hip_l', 'hip_r'])
    expect(shape(after(sided, null, ['hip_l', 'hip_r'], { kind: 'onto', index: 0 }).list)).toEqual(['[a+hip_l+hip_r]', 'b'])
  })
})

describe('a circuit made by hand, run by the machinery that runs the plan ones', () => {
  it('rotates the stations round by round, and lets the longer one finish alone', () => {
    const combo = dropAt(day, null, ['row'], { kind: 'onto', index: 0 })
    const list = arrange(day, combo)
    const counts = list.map((e) => (e.key === 'bench' ? 3 : e.key === 'row' ? 2 : 1))
    const order = buildSetOrder(list, counts).map((s) => `${list[s.exIndex].key}:${s.setIndex}`)
    expect(order.slice(0, 5)).toEqual(['bench:0', 'row:0', 'bench:1', 'row:1', 'bench:2'])
  })

  it('rests the walk between stations, and the next station’s own rest after a round', () => {
    const between = restBeforeNextSet({ currentRestSec: 150, sameExercise: false, nextRestSec: 90, sameCircuit: true, newCircuitRound: false })
    expect(between).toBe(CIRCUIT_STATION_REST_SEC)
    const round = restBeforeNextSet({ currentRestSec: 90, sameExercise: false, nextRestSec: 150, sameCircuit: true, newCircuitRound: true })
    expect(round).toBeGreaterThan(CIRCUIT_STATION_REST_SEC)
    expect(round).toBeLessThanOrEqual(150)
  })

  it('combines real plan movements on every day without losing or doubling one', () => {
    for (const d of ['push', 'pull', 'fullbody'] as const) {
      const natural = performedExercises(DEFAULT_PLAN[d], { length: 'full', startSide: 'left' })
      const entries = dayEntries(natural)
      const last = entries[entries.length - 1]
      const keys = last.kind === 'circuit' ? last.stations.map((s) => s.key) : [last.exercise.key]
      const a = dropAt(natural, null, keys, { kind: 'onto', index: 0 })
      const list = arrange(natural, a)
      expect(list.map((e) => e.key).sort()).toEqual(natural.map((e) => e.key).sort())
      expect(dayEntries(list)).toHaveLength(entries.length - 1)
      // And survives being written down and read back.
      expect(arrange(natural, JSON.parse(JSON.stringify(a)))).toEqual(list)
    }
  })
})
