import { describe, expect, it } from 'vitest'
import { clamp, earthFragments } from './comet'

describe('Earth debris screen exits', () => {
  it('tiles the globe with chunky cells and releases the impact side first', () => {
    const bits = earthFragments(100, 100)
    const area = bits.reduce((sum, bit) => sum + Math.abs(bit.vertices.reduce((cross, a, i) => {
      const b = bit.vertices[(i + 1) % bit.vertices.length]
      return cross + a[0] * b[1] - b[0] * a[1]
    }, 0)) / 2, 0)
    expect(area).toBeCloseTo(96 / 2 * 17 ** 2 * Math.sin(2 * Math.PI / 96), 6)
    expect(bits.every(bit => bit.vertices.length >= 4)).toBe(true)
    const near = bits.filter(bit => bit.vertices.every(([x]) => x < 0))
    const far = bits.filter(bit => bit.vertices.every(([x]) => x > 0))
    expect(Math.min(...near.map(bit => bit.delay))).toBeLessThan(Math.min(...far.map(bit => bit.delay)))
  })
  for (const height of [45, 100, 180, 240]) {
    it(`keeps the last piece visible until zero in a 100 by ${height} viewport`, () => {
      const bits = earthFragments(100, height)
      const visible = (elapsed: number) => bits.filter(bit => {
        const flight = clamp((elapsed - bit.delay) / (bit.exitsAt - bit.delay))
        const xs = bit.vertices.map(([x]) => 50 + x + bit.dx * flight)
        const ys = bit.vertices.map(([, y]) => height / 2 + y + bit.dy * flight)
        return Math.min(...xs) < 100 && Math.max(...xs) > 0 && Math.min(...ys) < height && Math.max(...ys) > 0
      })
      expect(visible(0)).toHaveLength(32)
      expect(visible(.99999)).toHaveLength(1)
      expect(visible(1)).toHaveLength(0)
      expect(visible(1.1)).toHaveLength(0)
    })
  }
})
