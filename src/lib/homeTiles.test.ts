import { describe, expect, it } from 'vitest'
import {
  arrangeTiles,
  candidateTiles,
  gridDropIndex,
  moveItem,
  spansRow,
  tileId,
  withAdded,
  withRemoved,
  type CardioPin,
  type HomeTile,
} from './homeTiles'

const soccer: CardioPin = { id: 's1', kind: 'soccer', minutes: 90 }
const all = (pins: CardioPin[] = []) =>
  candidateTiles({ liftDays: ['fullbody', 'push', 'pull'], core: true, routines: ['head_to_toe', 'side_split'], pins })
const ids = (ts: HomeTile[]) => ts.map(tileId)

describe('candidateTiles', () => {
  it('groups strength, then flexibility, then cardio, with full body last of the lifts', () => {
    expect(ids(all([soccer]))).toEqual([
      'lift:push',
      'lift:pull',
      'lift:fullbody',
      'core',
      'stretch:head_to_toe',
      'stretch:side_split',
      'cardio',
      'pin:s1',
    ])
  })
})

describe('arrangeTiles', () => {
  it('shows the default order with no layout saved', () => {
    expect(ids(arrangeTiles(all(), undefined))).toEqual(ids(all()))
  })

  it('follows the saved order and drops what was removed', () => {
    const layout = { order: ['stretch:side_split', 'lift:push', 'cardio'], removed: ['lift:pull', 'core', 'lift:fullbody', 'stretch:head_to_toe'] }
    expect(ids(arrangeTiles(all(), layout))).toEqual(['stretch:side_split', 'lift:push', 'cardio'])
  })

  it('puts a tile the order has never seen beside the rest of its pillar', () => {
    const layout = { order: ['cardio', 'lift:push', 'lift:pull', 'lift:fullbody', 'core', 'stretch:head_to_toe', 'stretch:side_split'], removed: [] }
    expect(ids(arrangeTiles(all([soccer]), layout))).toEqual([
      'cardio',
      'pin:s1',
      'lift:push',
      'lift:pull',
      'lift:fullbody',
      'core',
      'stretch:head_to_toe',
      'stretch:side_split',
    ])
  })

  it('places a newcomer with no neighbours where its pillar falls', () => {
    // Flexibility switched on after a layout of strength and cardio was saved.
    const layout = { order: ['lift:push', 'cardio'], removed: ['lift:pull', 'lift:fullbody', 'core'] }
    expect(ids(arrangeTiles(all(), layout))).toEqual(['lift:push', 'stretch:head_to_toe', 'stretch:side_split', 'cardio'])
  })
})

describe('withRemoved / withAdded', () => {
  it('takes a tile off and puts it back at the end', () => {
    const shown = ['lift:push', 'core', 'cardio']
    const off = withRemoved({ order: shown, removed: [] }, shown, 'core')
    expect(off).toEqual({ order: ['lift:push', 'cardio'], removed: ['core'] })
    expect(withAdded(off, off.order, 'core')).toEqual({ order: ['lift:push', 'cardio', 'core'], removed: [] })
  })
})

describe('spansRow', () => {
  it('stretches only the odd one out at the bottom', () => {
    expect(spansRow(4, 5)).toBe(true)
    expect(spansRow(3, 5)).toBe(false)
    expect(spansRow(3, 4)).toBe(false)
  })
})

describe('moveItem', () => {
  it('moves forward and back', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })
})

describe('gridDropIndex', () => {
  // Two columns of 100×50 with a 10px gap, and a full-width fifth.
  const slots = [
    { left: 0, top: 0, width: 100, height: 50 },
    { left: 110, top: 0, width: 100, height: 50 },
    { left: 0, top: 60, width: 100, height: 50 },
    { left: 110, top: 60, width: 100, height: 50 },
    { left: 0, top: 120, width: 210, height: 50 },
  ]
  it('stays put until the tile is nearer another slot', () => {
    expect(gridDropIndex(slots, 0, 40, 10)).toBe(0)
    expect(gridDropIndex(slots, 0, 70, 0)).toBe(1)
  })
  it('crosses rows and columns', () => {
    expect(gridDropIndex(slots, 0, 110, 60)).toBe(3)
    expect(gridDropIndex(slots, 3, -110, -60)).toBe(0)
  })
  it('drops into the wide bottom slot from either column', () => {
    expect(gridDropIndex(slots, 2, 0, 60)).toBe(4)
    expect(gridDropIndex(slots, 3, 0, 60)).toBe(4)
  })
})
