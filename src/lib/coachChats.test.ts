import { describe, expect, it } from 'vitest'
import {
  chatTitle,
  chatWhen,
  keepChat,
  keptTurns,
  loadChats,
  MAX_CHARS,
  MAX_CHATS,
  pruneChats,
  withChat,
  withoutChat,
  type KeptChat,
  type LiveTurn,
} from './coachChats'

function memoryStore() {
  const held = new Map<string, string>()
  return {
    getItem: (k: string) => held.get(k) ?? null,
    setItem: (k: string, v: string) => void held.set(k, v),
    size: () => [...held.values()].reduce((n, v) => n + v.length, 0),
  }
}

const ask = (text: string): LiveTurn[] => [
  { role: 'user', content: text },
  { role: 'assistant', content: `about ${text}` },
]

describe('keeping a chat', () => {
  it('keeps a thread as it grows, as one chat with the start it had', () => {
    const store = memoryStore()
    keepChat('a', [{ role: 'user', content: 'why is my bench stuck' }], store)
    const started = loadChats(store)[0].startedAt
    keepChat('a', ask('why is my bench stuck'), store)
    const chats = loadChats(store)
    expect(chats).toHaveLength(1)
    expect(chats[0].turns).toHaveLength(2)
    expect(chats[0].startedAt).toBe(started)
  })

  it('keeps a report that failed, with the error the coach gave', () => {
    const store = memoryStore()
    keepChat(
      'a',
      [
        { role: 'user', content: 'file an issue: the rest timer skips' },
        { role: 'assistant', content: 'add your issue token in Settings to file issues.', error: true },
      ],
      store,
    )
    const [chat] = loadChats(store)
    expect(chat.turns[0].content).toBe('file an issue: the rest timer skips')
    expect(chat.turns[1]).toMatchObject({ error: true })
  })

  it('puts the chat last spoken in on top', () => {
    let chats: KeptChat[] = []
    chats = withChat(chats, 'a', ask('one'), new Date('2026-11-25T10:00:00Z'))
    chats = withChat(chats, 'b', ask('two'), new Date('2026-11-25T11:00:00Z'))
    chats = withChat(chats, 'a', [...ask('one'), ...ask('more')], new Date('2026-11-25T12:00:00Z'))
    expect(chats.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('keeps nothing for an empty thread', () => {
    const store = memoryStore()
    keepChat('a', [], store)
    expect(loadChats(store)).toEqual([])
  })

  it('leaves behind what a proposal would have saved', () => {
    const live = [
      { role: 'system' as const, content: 'the coach wants to change your plan', proposal: { changes: ['bench 3×8'], status: 'pending' as const, kind: 'plan', next: { huge: true } } },
    ]
    expect(keptTurns(live)[0].proposal).toEqual({ changes: ['bench 3×8'], status: 'pending' })
  })

  it('reads nothing from a store that holds something else', () => {
    const store = memoryStore()
    store.setItem('wt:coachChats', '{"not":"a list"}')
    expect(loadChats(store)).toEqual([])
    store.setItem('wt:coachChats', 'not json')
    expect(loadChats(store)).toEqual([])
    store.setItem('wt:coachChats', JSON.stringify([{ id: 1 }, null, 'x']))
    expect(loadChats(store)).toEqual([])
  })
})

describe('chats leaving', () => {
  it('keeps only the newest, however many are had and none ever removed', () => {
    const store = memoryStore()
    // A question a day, twice a day, for most of two years.
    for (let i = 0; i < 1200; i++) keepChat(`chat-${i}`, ask(`question ${i} `.repeat(20)), store)
    const chats = loadChats(store)
    expect(chats).toHaveLength(MAX_CHATS)
    expect(chats[0].id).toBe('chat-1199')
    expect(chats.at(-1)?.id).toBe(`chat-${1200 - MAX_CHATS}`)
  })

  it('lets the oldest go when long chats pass the size kept', () => {
    const store = memoryStore()
    const long = 'x'.repeat(50_000)
    for (let i = 0; i < 40; i++) keepChat(`chat-${i}`, ask(long), store)
    const chats = loadChats(store)
    expect(chats.length).toBeLessThan(40)
    expect(chats[0].id).toBe('chat-39')
    expect(chats.reduce((n, c) => n + c.turns.reduce((m, t) => m + t.content.length, 0), 0)).toBeLessThanOrEqual(MAX_CHARS)
    // Well inside what a browser gives one site.
    expect(store.size()).toBeLessThan(1_000_000)
  })

  it('keeps the chat being had even when it alone is past the size kept', () => {
    const big: KeptChat = { id: 'big', startedAt: '2026-11-25T10:00:00Z', updatedAt: '2026-11-25T10:00:00Z', turns: [{ role: 'user', content: 'x'.repeat(MAX_CHARS + 1) }] }
    const old: KeptChat = { id: 'old', startedAt: '2026-11-24T10:00:00Z', updatedAt: '2026-11-24T10:00:00Z', turns: [{ role: 'user', content: 'hi' }] }
    expect(pruneChats([old, big]).map((c) => c.id)).toEqual(['big'])
  })

  it('removes one by hand and leaves the rest', () => {
    let chats: KeptChat[] = []
    chats = withChat(chats, 'a', ask('one'), new Date('2026-11-25T10:00:00Z'))
    chats = withChat(chats, 'b', ask('two'), new Date('2026-11-25T11:00:00Z'))
    expect(withoutChat(chats, 'b').map((c) => c.id)).toEqual(['a'])
  })
})

describe('how a chat is listed', () => {
  it('is named by the first thing asked, on one line', () => {
    const chat: KeptChat = { id: 'a', startedAt: '', updatedAt: '', turns: [
      { role: 'system', content: 'answered #12' },
      { role: 'user', content: 'file an issue:\n  the rest timer skips' },
    ] }
    expect(chatTitle(chat)).toBe('file an issue: the rest timer skips')
  })

  it('says the time today, the day this year, and the year before that', () => {
    const now = new Date(2026, 10, 25, 21, 0)
    expect(chatWhen(new Date(2026, 10, 25, 19, 5).toISOString(), now)).toBe('7:05 pm')
    expect(chatWhen(new Date(2026, 10, 25, 0, 30).toISOString(), now)).toBe('12:30 am')
    expect(chatWhen(new Date(2026, 10, 24, 19, 5).toISOString(), now)).toBe('Nov 24')
    expect(chatWhen(new Date(2025, 11, 31, 19, 5).toISOString(), now)).toBe("Dec 31 '25")
    expect(chatWhen('nonsense', now)).toBe('')
  })
})
