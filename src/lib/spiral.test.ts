import { describe, expect, it } from 'vitest'
import { createSpiral, pointAt, shareAt, spiralPath, type SpiralSpec } from './spiral'

const SPEC: SpiralSpec = { cx: 50, cy: 50, inner: 6, outer: 42, turns: 3.2 }

const radius = (p: { x: number; y: number }) => Math.hypot(p.x - SPEC.cx, p.y - SPEC.cy)

describe('createSpiral', () => {
  it('runs from the inner radius out to the outer one', () => {
    const { points } = createSpiral(SPEC)
    expect(radius(points[0])).toBeCloseTo(SPEC.inner, 6)
    expect(radius(points[points.length - 1])).toBeCloseTo(SPEC.outer, 6)
  })

  it('grows steadily outward rather than doubling back', () => {
    const { points } = createSpiral(SPEC)
    for (let i = 1; i < points.length; i++) {
      expect(radius(points[i])).toBeGreaterThan(radius(points[i - 1]))
    }
  })

  it('winds the whole way round as many times as asked', () => {
    // Unwrapped angle: each step is a small forward turn, so summing them recovers
    // the total sweep and catches a spiral that quietly lost a turn.
    const { points } = createSpiral({ ...SPEC, turns: 3 })
    let swept = 0
    for (let i = 1; i < points.length; i++) {
      const a = Math.atan2(points[i - 1].y - SPEC.cy, points[i - 1].x - SPEC.cx)
      const b = Math.atan2(points[i].y - SPEC.cy, points[i].x - SPEC.cx)
      let step = b - a
      while (step <= -Math.PI) step += 2 * Math.PI
      while (step > Math.PI) step -= 2 * Math.PI
      swept += step
    }
    expect(swept).toBeCloseTo(3 * 2 * Math.PI, 3)
  })

  it('accumulates length shares from nothing to the whole', () => {
    const { shares } = createSpiral(SPEC)
    expect(shares[0]).toBe(0)
    expect(shares[shares.length - 1]).toBeCloseTo(1, 12)
    for (let i = 1; i < shares.length; i++) {
      expect(shares[i]).toBeGreaterThan(shares[i - 1])
    }
  })

  it('survives a spiral with no length at all', () => {
    const flat = createSpiral({ cx: 0, cy: 0, inner: 5, outer: 5, turns: 0, samples: 8 })
    expect(flat.shares.every(Number.isFinite)).toBe(true)
    expect(flat.shares[flat.shares.length - 1]).toBe(1)
  })

  it('never samples fewer than the two points a line needs', () => {
    expect(createSpiral({ ...SPEC, samples: 0 }).points).toHaveLength(2)
    expect(createSpiral({ ...SPEC, samples: 1 }).points).toHaveLength(2)
  })
})

describe('shareAt', () => {
  const spiral = createSpiral(SPEC)

  it('draws nothing at the inner end and everything at the outer', () => {
    expect(shareAt(spiral, 0)).toBe(0)
    expect(shareAt(spiral, 1)).toBeCloseTo(1, 12)
  })

  it('rises without ever going back', () => {
    let last = -1
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const share = shareAt(spiral, t)
      expect(share).toBeGreaterThanOrEqual(last)
      last = share
    }
  })

  it('holds a fraction outside 0–1 to the ends', () => {
    expect(shareAt(spiral, -3)).toBe(0)
    expect(shareAt(spiral, 4)).toBeCloseTo(1, 12)
  })

  it('spends more of its length on the outer half than the inner one', () => {
    // The reason this module exists: half the *radius* is well under half the
    // *length*, so a dash cut straight from the fraction would barely move the
    // coil for most of the rest and then collapse it.
    expect(shareAt(spiral, 0.5)).toBeLessThan(0.35)
  })
})

describe('pointAt', () => {
  const spiral = createSpiral(SPEC)

  it('sits at the ends of the coil for 0 and 1', () => {
    expect(radius(pointAt(spiral, 0))).toBeCloseTo(SPEC.inner, 6)
    expect(radius(pointAt(spiral, 1))).toBeCloseTo(SPEC.outer, 6)
  })

  it('pulls the free end inward as the rest runs down', () => {
    let last = Infinity
    for (let f = 1; f >= 0; f -= 0.05) {
      const r = radius(pointAt(spiral, f))
      expect(r).toBeLessThan(last)
      last = r
    }
  })

  it('moves the end at a steady rate, which is what a glance reads', () => {
    // Radius is linear in the fraction by construction, and `pointAt` reads the
    // curve rather than the polyline so it is linear exactly. This is the property
    // the shape's honesty rests on.
    const at = (f: number) => radius(pointAt(spiral, f))
    const early = at(1) - at(0.9)
    const late = at(0.2) - at(0.1)
    expect(late).toBeCloseTo(early, 9)
  })

  it('agrees with the drawn coil at the points it is drawn through', () => {
    // The tracer has to sit on the stroke, not merely near it.
    const coarse = createSpiral({ ...SPEC, samples: 25 })
    coarse.points.forEach((point, i) => {
      const exact = pointAt(coarse, i / (coarse.points.length - 1))
      expect(exact.x).toBeCloseTo(point.x, 9)
      expect(exact.y).toBeCloseTo(point.y, 9)
    })
  })

  it('never lands on a broken coordinate', () => {
    for (let t = -0.5; t <= 1.5; t += 0.017) {
      const p = pointAt(spiral, t)
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })
})

describe('spiralPath', () => {
  it('starts at the inner end so a dash from the start keeps the inside', () => {
    const spiral = createSpiral({ ...SPEC, samples: 5 })
    const path = spiralPath(spiral)
    const [, x, y] = /^M (-?[\d.]+) (-?[\d.]+)/.exec(path)!
    expect(radius({ x: Number(x), y: Number(y) })).toBeCloseTo(SPEC.inner, 1)
  })

  it('draws one segment per step along the coil', () => {
    const path = spiralPath(createSpiral({ ...SPEC, samples: 12 }))
    expect(path.match(/L /g)).toHaveLength(11)
    expect(path).not.toContain('NaN')
  })
})
