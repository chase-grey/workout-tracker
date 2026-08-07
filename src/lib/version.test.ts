import { describe, expect, it, vi } from 'vitest'
import { pullNewWorker } from './version'

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
    const pull = pullNewWorker(sw).then(() => (done = true))

    // The update has been kicked off but nothing owns the page yet — resolving
    // here is what made the first tap reload from the old worker's caches.
    await Promise.resolve()
    await Promise.resolve()
    expect(done).toBe(false)

    takeOver()
    await pull
    expect(done).toBe(true)
  })

  it('resolves right away when there is no newer worker', async () => {
    const { sw, registration } = fakeContainer({})
    // No timeout budget at all: this must not be waiting on one.
    await pullNewWorker(sw, 0)
    expect(registration.update).toHaveBeenCalledOnce()
  })

  it('gives up waiting after the timeout so the reload still happens', async () => {
    vi.useFakeTimers()
    try {
      const { sw } = fakeContainer({ waiting: {} })
      const pull = pullNewWorker(sw, 10_000)
      await vi.advanceTimersByTimeAsync(10_000)
      await expect(pull).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('still waits when the update check fails', async () => {
    const { sw, registration, takeOver } = fakeContainer({ installing: {} })
    registration.update.mockRejectedValueOnce(new Error('offline'))
    const pull = pullNewWorker(sw)
    takeOver()
    await expect(pull).resolves.toBeUndefined()
  })
})
