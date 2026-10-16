import { describe, expect, it } from 'vitest'
import { CROWN, growRoots, grownLength, rootStrokes, seededRandom, widthAt } from './roots'

const roots = growRoots(seededRandom(7))

describe('growRoots', () => {
  it('grows the same system from the same seed', () => {
    expect(growRoots(seededRandom(7))).toEqual(roots)
  })

  it('branches down to tendrils', () => {
    const orders = new Set(roots.map(r => r.order))
    expect([...orders].sort()).toEqual([0, 1, 2, 3])
  })

  it('is not a mirror image of itself', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const system = growRoots(seededRandom(seed))
      // How much root lies on each side of the crown, weighted by how thick it gets.
      const mass = (side: number) =>
        system
          .filter(r => r.order === 0)
          .reduce((sum, r) => {
            const last = r.points[r.points.length - 1]
            return Math.sign(last.x - CROWN.x) === side ? sum + r.girth * r.points.length : sum
          }, 0)
      const [right, left] = [mass(1), mass(-1)]
      expect(Math.abs(right - left) / Math.max(right, left)).toBeGreaterThan(0.1)
    }
  })

  it('is fully grown out exactly by the end of rest, and not before it starts', () => {
    for (const root of roots) {
      expect(grownLength(root, 0)).toBe(0)
      expect(grownLength(root, 1)).toBeCloseTo((root.points.length - 1) * 2, 6)
    }
    expect(rootStrokes(roots, 0)).toEqual([])
  })
})

describe('widthAt', () => {
  const structural = roots.filter(r => r.order === 0)

  it('keeps thickening the top of a structural root for the whole rest', () => {
    for (const root of structural) {
      let last = 0
      for (const p of [0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
        const w = widthAt(root, 0, p)
        expect(w).toBeGreaterThan(last)
        last = w
      }
    }
  })

  it('leaves the structural roots far thicker than the tendrils', () => {
    const thickest = Math.max(...structural.map(r => widthAt(r, 0, 1)))
    const tendrils = roots.filter(r => r.order === 3).map(r => widthAt(r, 0, 1))
    expect(thickest).toBeGreaterThan(4)
    expect(Math.max(...tendrils)).toBeLessThan(1.2)
  })

  it('tapers toward the tip', () => {
    for (const root of structural) {
      const end = (root.points.length - 1) * 2
      expect(widthAt(root, end, 1)).toBeLessThan(widthAt(root, 0, 1))
    }
  })
})
