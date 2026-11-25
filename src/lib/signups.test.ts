import { describe, expect, it, vi } from 'vitest'
import { createSignupStore, readSignups, shownSignups, signupDay, type Signup, type SignupIO } from './signups'

const ann: Signup = { id: 'abc234', name: 'Ann', email: 'ann@example.com', createdAt: '2026-11-25T15:04:00.000Z' }
const bob: Signup = { id: 'def567', name: 'Bob', email: 'bob@example.com', createdAt: '2026-11-24T09:00:00.000Z' }
const cy: Signup = { id: 'ghj892', name: 'Cy', email: '', createdAt: '2026-11-20T09:00:00.000Z' }

function io(over: Partial<SignupIO> = {}): SignupIO & { saved: Signup[][] } {
  const saved: Signup[][] = []
  return {
    list: async () => [ann, bob],
    keep: async () => ({ saved: 1 }),
    decline: async () => ({ saved: 1 }),
    load: () => null,
    save: (s) => saved.push(s),
    saved,
    ...over,
  }
}

describe('signupDay', () => {
  it('says the day the way a person would', () => {
    expect(signupDay(new Date(2026, 10, 25, 9, 30).toISOString())).toBe('nov 25')
    expect(signupDay(new Date(2026, 0, 3, 23, 59).toISOString())).toBe('jan 3')
  })

  it('says nothing for a date it cannot read', () => {
    expect(signupDay('')).toBe('')
    expect(signupDay('soon')).toBe('')
  })
})

describe('readSignups', () => {
  it('takes a list of accounts and nothing else', () => {
    expect(readSignups([ann, null, { name: 'no id' }, { id: 'xyz234' }])).toEqual([
      ann,
      { id: 'xyz234', name: '', email: '', createdAt: '' },
    ])
    for (const other of [null, undefined, 'x', { error: 'Unknown route' }, { saved: 1 }]) {
      expect(readSignups(other)).toEqual([])
    }
  })
})

describe('who sees notices', () => {
  it('is the owner, and nobody else even with a list on the device', () => {
    expect(shownSignups(true, [ann, bob])).toEqual([ann, bob])
    expect(shownSignups(false, [ann, bob])).toEqual([])
    expect(shownSignups(true, [])).toEqual([])
  })
})

describe('the list of notices', () => {
  it('opens on what the device kept, then on what the backend says', async () => {
    const store = createSignupStore(io({ load: () => [cy] }))
    expect(store.get()).toEqual([cy])
    await store.refresh()
    expect(store.get()).toEqual([ann, bob])
  })

  it('tells whoever is listening, and keeps the list for next time', async () => {
    const world = io()
    const store = createSignupStore(world)
    const heard = vi.fn()
    const stop = store.subscribe(heard)
    await store.refresh()
    expect(heard).toHaveBeenCalledTimes(1)
    expect(world.saved.at(-1)).toEqual([ann, bob])
    stop()
    await store.refresh()
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a backend without the route', new Error('GET signups failed: Unknown route')],
    ['an account that is not the owner', new Error('GET signups failed: Owner only')],
    ['no connection', new TypeError('Failed to fetch')],
  ])('is left as it was, quietly, by %s', async (_why, error) => {
    const store = createSignupStore(io({ load: () => [cy], list: async () => { throw error } }))
    await expect(store.refresh()).resolves.toBeUndefined()
    expect(store.get()).toEqual([cy])
    const empty = createSignupStore(io({ list: async () => { throw error } }))
    await empty.refresh()
    expect(empty.get()).toEqual([])
  })

  it('reads an answer of the wrong shape as no notices', async () => {
    const store = createSignupStore(io({ list: async () => ({ saved: 1 }) }))
    await store.refresh()
    expect(store.get()).toEqual([])
  })

  it('drops a notice once it is kept or declined', async () => {
    const world = io({ keep: vi.fn(async () => ({ saved: 1 })), decline: vi.fn(async () => ({ saved: 1 })) })
    const store = createSignupStore(world)
    await store.refresh()
    await store.keep(ann.id)
    expect(world.keep).toHaveBeenCalledWith(ann.id)
    expect(store.get()).toEqual([bob])
    await store.decline(bob.id)
    expect(world.decline).toHaveBeenCalledWith(bob.id)
    expect(store.get()).toEqual([])
    expect(world.saved.at(-1)).toEqual([])
  })

  it('leaves the notice there when the answer did not go through', async () => {
    const store = createSignupStore(io({ decline: async () => { throw new Error('offline') } }))
    await store.refresh()
    await expect(store.decline(ann.id)).rejects.toThrow('offline')
    expect(store.get()).toEqual([ann, bob])
  })

  it('does not bring an answered notice back from a read that was already on its way', async () => {
    let finish: (list: Signup[]) => void = () => {}
    const store = createSignupStore(io({ load: () => [ann, bob], list: () => new Promise((r) => { finish = r }) }))
    const reading = store.refresh()
    await store.keep(ann.id)
    finish([ann, bob])
    await reading
    expect(store.get()).toEqual([bob])
  })
})
