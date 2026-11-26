import { describe, expect, it } from 'vitest'
import { loadCoachSwitches, saveCoachSwitches } from './coachSwitches'

function fakeStore(initial?: string) {
  const kept = new Map<string, string>()
  if (initial !== undefined) kept.set('wt:coachSwitches', initial)
  return {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
  }
}

describe('the coach switches', () => {
  it('all start off on a device that has never set them', () => {
    expect(loadCoachSwitches(fakeStore())).toEqual({ planEdits: false, keepContext: false, issues: false })
  })

  it('come back as they were left, each on its own', () => {
    const store = fakeStore()
    saveCoachSwitches({ planEdits: false, keepContext: true, issues: true }, store)
    // A reload reads the device again: nothing but a tap changes a switch.
    expect(loadCoachSwitches(store)).toEqual({ planEdits: false, keepContext: true, issues: true })
    saveCoachSwitches({ planEdits: false, keepContext: true, issues: false }, store)
    expect(loadCoachSwitches(store)).toEqual({ planEdits: false, keepContext: true, issues: false })
  })

  it('read anything unexpected as off', () => {
    expect(loadCoachSwitches(fakeStore('not json'))).toEqual({ planEdits: false, keepContext: false, issues: false })
    expect(loadCoachSwitches(fakeStore('{"issues":"yes","planEdits":1,"keepContext":true}'))).toEqual({ planEdits: false, keepContext: true, issues: false })
  })
})
