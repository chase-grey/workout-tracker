import { describe, it, expect } from 'vitest'
import { fatCells, fiberPath, muscleFibers, seeded } from './tissue'

describe('seeded', () => {
  it('gives the same stream for the same seed, in 0–1', () => {
    const a = seeded(3)
    const b = seeded(3)
    const run = Array.from({ length: 20 }, () => a())
    expect(Array.from({ length: 20 }, () => b())).toEqual(run)
    for (const v of run) expect(v).toBeGreaterThanOrEqual(0)
    for (const v of run) expect(v).toBeLessThan(1)
  })
})

describe('muscleFibers', () => {
  it('lays fibres from the top of the tile to the bottom, the same every time', () => {
    const fibers = muscleFibers(200)
    expect(fibers.length).toBeGreaterThan(40)
    expect(fibers[0].y).toBeLessThan(3)
    expect(fibers[fibers.length - 1].y).toBeGreaterThan(190)
    for (const f of fibers) expect(f.y).toBeLessThan(200)
    expect(muscleFibers(200)).toEqual(fibers)
  })

  it('mixes lit and shaded strands with the odd seam between bundles', () => {
    const tones = new Set(muscleFibers(300).map((f) => f.tone))
    expect(tones).toEqual(new Set(['light', 'dark', 'seam']))
  })
})

describe('fiberPath', () => {
  it('starts before the tile and runs past its far edge from any phase', () => {
    for (const phase of [0, 0.5, 1]) {
      const d = fiberPath({ y: 5, amplitude: 1, phase, width: 1, tone: 'light', opacity: 1 }, 96)
      const [, startX] = d.match(/^M (-?[\d.]+)/)!
      const quarters = (d.match(/ t /g) ?? []).length + 1
      const endX = Number(startX) + quarters * 24
      expect(Number(startX)).toBeLessThanOrEqual(0)
      expect(endX).toBeGreaterThanOrEqual(96)
    }
  })
})

describe('fatCells', () => {
  it('draws a cell again on the far side when it crosses an edge', () => {
    const cells = fatCells(72, 54)
    const crossing = cells.filter((c) => c.cx - c.rx < 0)
    expect(crossing.length).toBeGreaterThan(0)
    for (const c of crossing) {
      const twin = cells.find((o) => o.cy === c.cy && Math.abs(o.cx - (c.cx + 72)) < 1e-9)
      expect(twin).toBeDefined()
    }
  })

  it('keeps only cells that touch the tile', () => {
    for (const c of fatCells(72, 54)) {
      const reach = Math.max(c.rx, c.ry)
      expect(c.cx + reach).toBeGreaterThanOrEqual(0)
      expect(c.cx - reach).toBeLessThanOrEqual(72)
      expect(c.cy + reach).toBeGreaterThanOrEqual(0)
      expect(c.cy - reach).toBeLessThanOrEqual(54)
    }
  })

  it('is the same pack every time', () => {
    expect(fatCells(72, 54)).toEqual(fatCells(72, 54))
  })
})
