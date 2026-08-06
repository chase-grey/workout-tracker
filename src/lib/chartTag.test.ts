import { describe, it, expect } from 'vitest'
import { tagBox, textWidth, type Rect } from './chartTag'

/** A 300×140 chart with a 40px Y axis, roughly what a goal row draws. */
const PLOT: Rect = { x: 40, y: 6, width: 260, height: 120 }

const W = 40
const H = 13

/** A horizontal target line spans the plot with no height. */
const hLine = (y: number): Rect => ({ x: PLOT.x, y, width: PLOT.width, height: 0 })
/** A vertical rule sits at one x and runs the full height of the plot. */
const vLine = (x: number): Rect => ({ x, y: PLOT.y, width: 0, height: PLOT.height })
const dot = (cx: number, cy: number, r = 4): Rect => ({ x: cx - r, y: cy - r, width: 2 * r, height: 2 * r })

type Opts = Omit<Parameters<typeof tagBox>[0], 'vb' | 'plot' | 'w' | 'h'>

const box = (vb: Rect, opts: Opts = {}) => tagBox({ vb, plot: PLOT, w: W, h: H, ...opts })

const inside = (b: { left: number; top: number }) =>
  b.left >= PLOT.x &&
  b.top >= PLOT.y &&
  b.left + W <= PLOT.x + PLOT.width &&
  b.top + H <= PLOT.y + PLOT.height

describe('tagBox', () => {
  it('hangs a tag under its line when there is room', () => {
    const b = box(hLine(60), { side: 'below' })
    expect(b.top).toBeGreaterThan(60)
    expect(inside(b)).toBe(true)
  })

  it('flips a tag that would run off the top of the plot', () => {
    // A target line on the axis ceiling: "above" has nowhere to go.
    const b = box(hLine(PLOT.y), { side: 'above' })
    expect(b.top).toBeGreaterThanOrEqual(PLOT.y)
    expect(inside(b)).toBe(true)
  })

  it('flips a tag that would run off the bottom of the plot', () => {
    const b = box(hLine(PLOT.y + PLOT.height), { side: 'below' })
    expect(b.top + H).toBeLessThanOrEqual(PLOT.y + PLOT.height)
    expect(inside(b)).toBe(true)
  })

  it('keeps a tag off the axis break when its rule sits on the left edge', () => {
    // The zigzag straddles the axis line by ~5px at the baseline; a tag pulled
    // back inside has to clear it rather than print on top of it.
    const b = box(vLine(PLOT.x + 2), { side: 'below', align: 'end' })
    expect(b.left).toBeGreaterThan(PLOT.x + 5)
    expect(inside(b)).toBe(true)
  })

  it('parks a vertical rule tag at the end it was pointed at', () => {
    const bottom = box(vLine(150), { side: 'below' })
    const top = box(vLine(150), { side: 'above' })
    expect(bottom.top).toBeGreaterThan(top.top)
    expect(inside(bottom)).toBe(true)
    expect(inside(top)).toBe(true)
  })

  it('centres a dot tag on the dot and pulls it in at the right edge', () => {
    const middle = box(dot(150, 60), { align: 'center' })
    expect(middle.left + W / 2).toBeCloseTo(150, 5)

    const edge = box(dot(PLOT.x + PLOT.width - 2, 60), { align: 'center' })
    expect(inside(edge)).toBe(true)
  })

  it('stacks a nudged tag clear of the one above it', () => {
    const first = box(dot(150, 60), { align: 'center', side: 'below' })
    const second = box(dot(150, 60), { align: 'center', side: 'below', nudge: 12 })
    expect(second.top - first.top).toBe(12)
  })

  it('leaves placement alone until the chart has measured itself', () => {
    const b = tagBox({ vb: hLine(60), plot: null, w: W, h: H, side: 'above' })
    expect(b.top).toBeLessThan(60)
  })
})

describe('textWidth', () => {
  it('grows with the text and the type size', () => {
    expect(textWidth('goal 270', 9)).toBeGreaterThan(textWidth('goal', 9))
    expect(textWidth('goal 270', 10)).toBeGreaterThan(textWidth('goal 270', 9))
  })

  it('estimates a short label near its rendered width', () => {
    // "goal 270" at 9px in the app's sans face measures ~34px; the chip errs wide.
    expect(textWidth('goal 270', 9)).toBeGreaterThan(30)
    expect(textWidth('goal 270', 9)).toBeLessThan(48)
  })
})
