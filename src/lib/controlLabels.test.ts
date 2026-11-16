import { describe, expect, it } from 'vitest'
import {
  LABEL_USES,
  anyRetired,
  bump,
  labelModeFor,
  mergeControlUses,
  retiredNotice,
  retires,
  showLabel,
} from './controlLabels'

describe('controlLabels', () => {
  it('defaults the owner to bare controls and everyone else to labels', () => {
    expect(labelModeFor(undefined, true)).toBe('never')
    expect(labelModeFor(undefined, false)).toBe('auto')
    expect(labelModeFor('always', true)).toBe('always')
    expect(showLabel('more', undefined, undefined, true)).toBe(false)
    expect(showLabel('more', undefined, undefined, false)).toBe(true)
  })

  it('drops a label after three uses in auto, and only that one', () => {
    let uses = bump(undefined, 'more')
    uses = bump(uses, 'more')
    expect(showLabel('more', 'auto', uses, false)).toBe(true)
    uses = bump(uses, 'more')
    expect(showLabel('more', 'auto', uses, false)).toBe(false)
    expect(showLabel('skip', 'auto', uses, false)).toBe(true)
  })

  it('always and never ignore the counters', () => {
    const spent = { more: LABEL_USES }
    expect(showLabel('more', 'always', spent, false)).toBe(true)
    expect(showLabel('skip', 'never', {}, false)).toBe(false)
  })

  it('stops counting at the cap, handing back the same object', () => {
    const spent = { more: LABEL_USES }
    expect(bump(spent, 'more')).toBe(spent)
  })

  it('names the use that retires a label, once', () => {
    expect(retires({ more: 2 }, { more: 3 }, 'more')).toBe(true)
    expect(retires({ more: 3 }, { more: 3 }, 'more')).toBe(false)
    expect(retires({ more: 1 }, { more: 2 }, 'more')).toBe(false)
  })

  it('says where labels come back only the first time', () => {
    expect(anyRetired({ more: 2 })).toBe(false)
    expect(anyRetired({ more: 3 })).toBe(true)
    expect(retiredNotice('skip', true)).toContain('settings')
    expect(retiredNotice('skip', false)).not.toContain('settings')
  })

  it('merges two devices by the larger count per control', () => {
    expect(mergeControlUses({ uses: { more: 1, skip: 3 } }, { uses: { more: 3, list: 2 } })).toEqual({
      uses: { more: 3, skip: 3, list: 2 },
      resetAt: undefined,
    })
  })

  it('lets a newer reset win outright over older counts', () => {
    const reset = { uses: {}, resetAt: '2026-11-16T10:00:00Z' }
    const stale = { uses: { more: 3 }, resetAt: '2026-11-01T10:00:00Z' }
    expect(mergeControlUses(stale, reset)).toBe(reset)
    expect(mergeControlUses(reset, { uses: { more: 3 } })).toBe(reset)
  })
})
