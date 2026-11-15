import { describe, expect, it, vi } from 'vitest'
import { afterReloadToast, pullNewWorker } from './version'

/** A fake container whose registration can be told to swap in a new worker. */
function fakeContainer(reg: { installing?: unknown; waiting?: unknown }) {
  const listeners: (() => void)[] = []
  const registration = {
    installing: reg.installing ?? null,
    waiting: reg.waiting ?? null,
    update: vi.fn(async () => undefined),
  }
  return {
    registration,
    takeOver: () => listeners.forEach((l) => l()),
    sw: {
      addEventListener: (_type: 'controllerchange', listener: () => void) => {
        listeners.push(listener)
      },
      getRegistrations: async () => [registration],
    },
  }
}

describe('pullNewWorker', () => {
  it('waits for the new worker to take over before resolving', async () => {
    const { sw, takeOver } = fakeContainer({ installing: {} })
    let done = false
    const outcome = pullNewWorker(sw)
    const pull = outcome.then(() => (done = true))

    // The update has been kicked off but nothing owns the page yet — resolving
    // here is what made the first tap reload from the old worker's caches.
    await Promise.resolve()
    await Promise.resolve()
    expect(done).toBe(false)

    takeOver()
    await pull
    expect(done).toBe(true)
    await expect(outcome).resolves.toBe('swapped')
  })

  it('resolves right away when there is no newer worker', async () => {
    const { sw, registration } = fakeContainer({})
    // No timeout budget at all: this must not be waiting on one.
    await expect(pullNewWorker(sw, 0)).resolves.toBe('current')
    expect(registration.update).toHaveBeenCalledOnce()
  })

  it('gives up waiting after the timeout so the reload still happens', async () => {
    vi.useFakeTimers()
    try {
      const { sw } = fakeContainer({ waiting: {} })
      const pull = pullNewWorker(sw, 10_000)
      await vi.advanceTimersByTimeAsync(10_000)
      // There is a newer build; the reload is still the way onto it.
      await expect(pull).resolves.toBe('swapped')
    } finally {
      vi.useRealTimers()
    }
  })

  it('still waits when the update check fails', async () => {
    const { sw, registration, takeOver } = fakeContainer({ installing: {} })
    registration.update.mockRejectedValueOnce(new Error('offline'))
    const pull = pullNewWorker(sw)
    takeOver()
    await expect(pull).resolves.toBe('swapped')
  })

  it('says it failed, not that you are current, when no check got through', async () => {
    const { sw, registration } = fakeContainer({})
    registration.update.mockRejectedValueOnce(new Error('offline'))
    await expect(pullNewWorker(sw, 0)).resolves.toBe('failed')
  })
})

describe('afterReloadToast', () => {
  it('says nothing on a load the app did not trigger', () => {
    expect(afterReloadToast(null, 'abc1234')).toBeNull()
  })

  it('names the new build when the reload landed one', () => {
    expect(afterReloadToast('abc1234', 'def5678')).toBe('updated to def5678')
  })

  it('says you are current when the reload landed the same build', () => {
    expect(afterReloadToast('abc1234', 'abc1234')).toBe('you’re on the latest version')
  })
})
