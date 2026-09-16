import { describe, expect, it } from 'vitest'
import { clamp, earthFragments } from './comet'

describe('Earth debris screen exits', () => {
  for (const height of [45, 100, 180, 240]) {
    it(`keeps the last piece visible until zero in a 100 by ${height} viewport`, () => {
      const bits = earthFragments(100, height)
      const visible = (elapsed: number) => bits.filter(bit => {
        const flight = clamp(elapsed / bit.exitsAt)
        const xs = bit.vertices.map(([x]) => 50 + x + bit.dx * flight)
        const ys = bit.vertices.map(([, y]) => height / 2 + y + bit.dy * flight)
        return Math.min(...xs) < 100 && Math.max(...xs) > 0 && Math.min(...ys) < height && Math.max(...ys) > 0
      })
      expect(visible(0)).toHaveLength(16)
      expect(visible(.99999)).toHaveLength(1)
      expect(visible(1)).toHaveLength(0)
      expect(visible(1.1)).toHaveLength(0)
    })
  }
})
