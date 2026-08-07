import { beforeEach, describe, expect, it } from 'vitest'
import { stashResumeTab, takeResumeTab } from './resumeTab'

// Stands in for sessionStorage, which the node test env doesn't have.
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  })
})

describe('resumeTab', () => {
  it('hands back the stashed tab exactly once', () => {
    stashResumeTab('settings')
    expect(takeResumeTab()).toBe('settings')
    // A later reload (a real one, not the update button) starts fresh.
    expect(takeResumeTab()).toBeNull()
  })

  it('has nothing to hand back when nothing was stashed', () => {
    expect(takeResumeTab()).toBeNull()
  })

  it('ignores a value that is not a tab', () => {
    store.set('wt:resume-tab', 'nonsense')
    expect(takeResumeTab()).toBeNull()
  })

  it('shrugs off storage it cannot write to', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => {
          throw new Error('blocked')
        },
        removeItem: () => undefined,
      },
    })
    expect(() => stashResumeTab('settings')).not.toThrow()
    expect(takeResumeTab()).toBeNull()
  })
})
