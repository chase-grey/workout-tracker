import { describe, expect, it } from 'vitest'
import { createRotation } from './variantRotation'

const SHAPES = ['a', 'b', 'c', 'd', 'e', 'f'] as const

/** A `random` that walks a fixed list, so a pick can be aimed at a known slot. */
const scripted = (values: readonly number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

/**
 * A seeded generator for the statistical claims below — mulberry32. Real sampling
 * that happens to be repeatable, so a bound measured once holds every run instead of
 * flaking on the tail, and a plain ramp can't quietly resonate with the weighting.
 */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const drawn = (count: number, random: () => number, items: readonly string[] = SHAPES) => {
  const rotation = createRotation(items, random)
  return Array.from({ length: count }, () => rotation.next())
}

/** What the rotation replaced: uniform picking with nothing but a no-repeat rule. */
const uniformPicks = (count: number, random: () => number) => {
  let last: string | null = null
  return Array.from({ length: count }, () => {
    const pool = SHAPES.filter((item) => item !== last)
    last = pool[Math.floor(random() * pool.length)]
    return last
  })
}

describe('createRotation', () => {
  it('never shows the same item twice in a row', () => {
    // The one hard rule: everything else here is a tendency, this is a guarantee.
    // Including at both extremes of the ticket, which are the picks most likely to
    // land on an item the rotation was supposed to have taken off the table.
    const runs = [seeded(1), seeded(99), scripted([0]), scripted([0.999]), Math.random]
    runs.forEach((random) => {
      const picks = drawn(400, random)
      for (let i = 1; i < picks.length; i++) {
        expect(picks[i]).not.toBe(picks[i - 1])
      }
    })
  })

  it('only ever returns items it was given', () => {
    drawn(200, seeded(7)).forEach((pick) => {
      expect(SHAPES).toContain(pick)
    })
  })

  it('favours whatever has waited longest', () => {
    // Lowest ticket lands on the front of the queue, which is the stalest item. Over
    // a long run that turns into a strict cycle — the extreme the bias points at.
    const picks = drawn(12, scripted([0]))
    expect(new Set(picks.slice(0, SHAPES.length)).size).toBe(SHAPES.length)
    expect(picks.slice(6)).toEqual(picks.slice(0, 6))
  })

  it('still reaches the item that only just played', () => {
    // Highest ticket lands on the back of the pool — the freshest thing still
    // eligible. A bias that shut those out would be a queue, not a rotation.
    const picks = drawn(30, scripted([0.9999]))
    const seen = new Set(picks)
    expect(seen.size).toBeGreaterThan(1)
    // Two items batting back and forth is exactly what "freshest each time" means.
    expect(seen.size).toBeLessThan(SHAPES.length)
  })

  it('gives every item its fair share of a long run', () => {
    const counts = new Map<string, number>()
    drawn(600, seeded(3)).forEach((pick) => {
      counts.set(pick, (counts.get(pick) ?? 0) + 1)
    })
    expect(counts.size).toBe(SHAPES.length)
    const share = 600 / SHAPES.length
    counts.forEach((count) => {
      expect(count).toBeGreaterThan(share * 0.75)
      expect(count).toBeLessThan(share * 1.25)
    })
  })

  it('cuts the droughts that uniform picking leaves', () => {
    // The complaint the weighting exists to answer: a shape you stop seeing for long
    // enough to assume it is gone. Fair shares alone don't rule that out — the same
    // count can arrive in clumps — so this measures the wait, against a uniform
    // picker with the same no-repeat rule and the same numbers to draw on.
    const gaps = (picks: readonly string[]) => {
      const lastSeen = new Map<string, number>()
      const out: number[] = []
      picks.forEach((pick, i) => {
        const previous = lastSeen.get(pick)
        if (previous !== undefined) out.push(i - previous)
        lastSeen.set(pick, i)
      })
      expect(lastSeen.size).toBe(SHAPES.length)
      return out
    }

    const ours = gaps(drawn(2000, seeded(11)))
    const uniform = gaps(uniformPicks(2000, seeded(11)))
    expect(Math.max(...ours)).toBeLessThan(Math.max(...uniform))
    // And in absolute terms: under three passes over the set at worst, against the
    // six-plus that uniform picking stretches to on the same numbers.
    expect(Math.max(...ours)).toBeLessThanOrEqual(SHAPES.length * 3)
  })

  it('starts somewhere different from one rotation to the next', () => {
    // Nothing has been shown when a rotation is built, so the queue is shuffled
    // rather than left in declaration order.
    const firsts = new Set(Array.from({ length: 40 }, () => drawn(1, Math.random)[0]))
    expect(firsts.size).toBeGreaterThan(1)
  })

  it('repeats rather than failing when there is only one item', () => {
    expect(drawn(3, Math.random, ['only'])).toEqual(['only', 'only', 'only'])
  })

  it('alternates a pair', () => {
    expect(drawn(4, seeded(5), ['a', 'b']).join('')).toMatch(/^(abab|baba)$/)
  })

  it('refuses an empty set', () => {
    expect(() => createRotation([])).toThrow()
  })

  it('keeps its memory to itself', () => {
    // The rest shapes and each rhythm family run their own rotation, so one of them
    // drawing must not move another's queue along. Same script, same shuffle: a
    // fresh rotation's first pick is repeatable, and the untouched one still gives
    // it however far its neighbour has run.
    const first = createRotation(SHAPES, scripted([0])).next()
    const left = createRotation(SHAPES, scripted([0]))
    const right = createRotation(SHAPES, scripted([0]))
    left.next()
    left.next()
    expect(right.next()).toBe(first)
  })
})
