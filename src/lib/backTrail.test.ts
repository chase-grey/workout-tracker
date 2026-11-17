import { describe, it, expect } from 'vitest'
import { appendEvent, blankReason, loadVerdict, REOPEN_WINDOW_MS, type ScreenProbe } from './backTrail'

describe('appendEvent', () => {
  it('keeps only the newest events', () => {
    let trail = [{ t: 1, e: 'load' }]
    for (let t = 2; t <= 5; t++) trail = appendEvent(trail, { t, e: 'back' }, 3)
    expect(trail.map((ev) => ev.t)).toEqual([3, 4, 5])
  })
})

describe('blankReason', () => {
  const full: ScreenProbe = { rootChildren: 1, shellHeight: 800, viewportHeight: 800, sampled: 15, drawn: 9 }

  it('passes a screen with something on it', () => {
    expect(blankReason(full)).toBeNull()
  })

  it('names an unmounted tree', () => {
    expect(blankReason({ ...full, rootChildren: 0, drawn: 0 })).toBe('nothing mounted')
  })

  it('names a mounted tree that drew nothing', () => {
    expect(blankReason({ ...full, drawn: 0 })).toBe('nothing drawn')
  })

  it('names a shell squeezed to a sliver', () => {
    expect(blankReason({ ...full, shellHeight: 40 })).toBe('shell collapsed to 40px of 800px')
  })

  it('lets the keyboard take half the shell', () => {
    expect(blankReason({ ...full, shellHeight: 420 })).toBeNull()
  })

  it('says nothing when the screen could not be looked at', () => {
    expect(blankReason({ ...full, sampled: 0, drawn: 0 })).toBeNull()
  })
})

describe('loadVerdict', () => {
  const now = 1_000_000

  it('reports a load reached by going back', () => {
    expect(loadVerdict([], 'back_forward', now)).toBe('a back press loaded the page again')
  })

  it('reports a reopen right after a back press', () => {
    const trail = [
      { t: now - 60_000, e: 'load' },
      { t: now - 8_000, e: 'back' },
      { t: now - 3_000, e: 'hidden' },
    ]
    expect(loadVerdict(trail, 'navigate', now)).toBe('reopened 8s after a back press (navigate)')
  })

  it('does not count a guard the app dropped itself', () => {
    expect(loadVerdict([{ t: now - 2_000, e: 'back', ours: true }], 'navigate', now)).toBeNull()
  })

  it('ignores a back press from long ago', () => {
    expect(loadVerdict([{ t: now - REOPEN_WINDOW_MS - 1, e: 'back' }], 'navigate', now)).toBeNull()
  })

  it('ignores a back press that belongs to an earlier load', () => {
    const trail = [
      { t: now - 9_000, e: 'back' },
      { t: now - 5_000, e: 'load' },
    ]
    expect(loadVerdict(trail, 'reload', now)).toBeNull()
  })

  it('has nothing to say about an ordinary open', () => {
    expect(loadVerdict([{ t: now - 500, e: 'hidden' }], 'navigate', now)).toBeNull()
  })
})
