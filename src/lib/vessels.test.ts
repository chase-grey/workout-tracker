import { describe, expect, it } from 'vitest'
import { createVessel, spanBetween, VESSEL_KINDS, type Vessel } from './vessels'

/** Cycles the given draws, so a random vessel can be built to order. */
const rolls =
  (...values: number[]) =>
  () => {
    const next = values.shift() ?? 0.5
    values.push(next)
    return next
  }

const width = (span: readonly [number, number] | null) => (span ? span[1] - span[0] : 0)

const midHeight = (vessel: Vessel) => (vessel.top + vessel.bottom) / 2

describe('createVessel', () => {
  it('builds every shape in the rotation inside the box', () => {
    for (const kind of VESSEL_KINDS) {
      const vessel = createVessel(kind, rolls(0.3, 0.7, 0.5, 0.9, 0.1))
      expect(vessel.kind).toBe(kind)
      expect(vessel.top).toBeGreaterThanOrEqual(0)
      expect(vessel.bottom).toBeLessThanOrEqual(100)
      // Tall enough for a water line to fall a readable distance down it.
      expect(vessel.bottom - vessel.top).toBeGreaterThan(50)
    }
  })

  it('holds water at every height between its top and its bottom', () => {
    for (const kind of VESSEL_KINDS) {
      const vessel = createVessel(kind, rolls(0.2, 0.8, 0.4, 0.6))
      const depth = vessel.bottom - vessel.top
      for (let i = 1; i < 10; i++) {
        const span = vessel.spanAt(vessel.top + (depth * i) / 10)
        expect(width(span), `${kind} at ${i / 10} deep`).toBeGreaterThan(0)
      }
      // And nothing above the rim or below the floor.
      expect(vessel.spanAt(vessel.top - 1)).toBeNull()
      expect(vessel.spanAt(vessel.bottom + 1)).toBeNull()
    }
  })

  it('gives every shape a clip path and an outline the browser can use', () => {
    for (const kind of VESSEL_KINDS) {
      const vessel = createVessel(kind, rolls(0.5, 0.25, 0.75))
      expect(vessel.clip).toMatch(/^(polygon|ellipse)\(/)
      expect(vessel.clip.endsWith(')')).toBe(true)
      expect(vessel.outline.startsWith('M ')).toBe(true)
      expect(vessel.outline.endsWith('Z')).toBe(true)
      expect(vessel.outline).not.toMatch(/NaN/)
    }
  })

  it('narrows the circle toward its floor and holds the square square', () => {
    const circle = createVessel('circle')
    expect(width(circle.spanAt(midHeight(circle)))).toBeGreaterThan(
      width(circle.spanAt(circle.bottom - 4)) * 2,
    )

    const square = createVessel('square')
    expect(width(square.spanAt(square.top + 2))).toBeCloseTo(width(square.spanAt(square.bottom - 2)), 6)
  })

  it('spreads the oval wider than it is tall', () => {
    const oval = createVessel('oval')
    expect(width(oval.spanAt(midHeight(oval)))).toBeGreaterThan(oval.bottom - oval.top)
  })

  it('widens the triangle as the water drains out of it', () => {
    const triangle = createVessel('triangle')
    const near = width(triangle.spanAt(triangle.top + 10))
    const far = width(triangle.spanAt(triangle.bottom - 10))
    expect(far).toBeGreaterThan(near * 3)
  })

  it('draws a fresh polygon each time, and never the same one twice', () => {
    const one = createVessel('polygon', rolls(0.1, 0.9, 0.2, 0.8))
    const two = createVessel('polygon', rolls(0.9, 0.1, 0.8, 0.2))
    expect(one.clip).not.toBe(two.clip)
    // However the corners fell, it is still a closed shape with room inside it.
    for (const vessel of [one, two]) {
      expect(width(vessel.spanAt(midHeight(vessel)))).toBeGreaterThan(20)
    }
  })

  it('keeps a random polygon inside the box whatever the draws', () => {
    for (let i = 0; i < 200; i++) {
      const vessel = createVessel('polygon')
      const coords = vessel.clip.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
      expect(coords.length).toBeGreaterThan(0)
      for (const n of coords) {
        expect(n).toBeGreaterThanOrEqual(0)
        expect(n).toBeLessThanOrEqual(100)
      }
    }
  })
})

describe('spanBetween', () => {
  it('measures the walls at their closest over the stretch, not at one end', () => {
    const circle = createVessel('circle')
    const middle = circle.spanAt(midHeight(circle))
    const room = spanBetween(circle, midHeight(circle), circle.bottom - 4)
    // A bubble rising from near the floor gets the floor's room, not the middle's.
    expect(width(room)).toBeLessThan(width(middle))
    expect(width(room)).toBeCloseTo(width(circle.spanAt(circle.bottom - 4)), 6)
  })

  it('reads the same span whichever end it is given first', () => {
    const vessel = createVessel('diamond')
    const up = spanBetween(vessel, 30, 70)
    const down = spanBetween(vessel, 70, 30)
    expect(up).toEqual(down)
  })

  it('finds no room at all outside the vessel', () => {
    const vessel = createVessel('circle')
    expect(spanBetween(vessel, vessel.top - 10, vessel.bottom)).toBeNull()
  })

  it('leaves a bubble room to rise through the middle of every shape', () => {
    for (const kind of VESSEL_KINDS) {
      // Random polygons vary, so this asks the same of a good many of them.
      for (let i = 0; i < 40; i++) {
        const vessel = createVessel(kind)
        const depth = vessel.bottom - vessel.top
        const room = spanBetween(vessel, vessel.top + depth * 0.35, vessel.top + depth * 0.65)
        expect(width(room), kind).toBeGreaterThan(8)
      }
    }
  })

  it('reports a pinched tip as no room rather than as the wrong room', () => {
    const triangle = createVessel('triangle')
    // Right up under the apex there is nothing for a bubble to rise through — which
    // is exactly what stops one surfacing into the glass, and what leaves the biggest
    // pops for later in the rest, once the water has fallen somewhere wide enough to
    // take them (see RestTimer).
    expect(width(spanBetween(triangle, triangle.top + 1, triangle.bottom - 4))).toBeLessThan(2)
    expect(spanBetween(triangle, triangle.top, triangle.bottom)).toBeNull()
  })
})
