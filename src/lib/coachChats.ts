/**
 * The coach's past chats, kept on the device.
 *
 * A chat is one thread: with "keep context" off that is a question and its
 * answer, with it on everything said until the thread is let go. Each is saved
 * as it grows, so a reload, a closed app or an answer that never came still
 * leaves what was asked and what came back (Chase, 2026-11-25: a report the
 * coach failed to file was gone with the thread, and nobody could say what it
 * had been).
 *
 * They stay on the device that had them: a chat can hold anything typed to the
 * coach, and the synced settings are no place for that.
 *
 * They leave three ways, so the list cannot grow without end: only the newest
 * MAX_CHATS are kept, the oldest go first when the lot passes MAX_CHARS, and
 * any one can be removed from the list by hand.
 */

export type KeptStatus = 'pending' | 'approved' | 'rejected'

/** One turn as it is kept: what was on screen, without what a proposal would have saved. */
export type KeptTurn = {
  role: 'user' | 'assistant' | 'system'
  content: string
  error?: boolean
  proposal?: { changes: string[]; status: KeptStatus }
}

export type KeptChat = {
  id: string
  /** ISO time of the first turn. */
  startedAt: string
  /** ISO time of the newest turn. */
  updatedAt: string
  turns: KeptTurn[]
}

/** What a live turn has to carry to be kept. A proposal's plan is left behind. */
export type LiveTurn = {
  role: 'user' | 'assistant' | 'system'
  content: string
  error?: boolean
  proposal?: { changes: string[]; status: KeptStatus }
}

export const MAX_CHATS = 50
/** Characters of turn text across every kept chat: a few hundred kB of a 5 MB store. */
export const MAX_CHARS = 400_000

const KEY = 'wt:coachChats'

type Store = Pick<Storage, 'getItem' | 'setItem'>

const deviceStore = (): Store | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

export function keptTurns(turns: LiveTurn[]): KeptTurn[] {
  return turns.map((t) => ({
    role: t.role,
    content: t.content,
    ...(t.error ? { error: true } : {}),
    ...(t.proposal ? { proposal: { changes: [...t.proposal.changes], status: t.proposal.status } } : {}),
  }))
}

const sizeOf = (chat: KeptChat) =>
  chat.turns.reduce((n, t) => n + t.content.length + (t.proposal?.changes.join('').length ?? 0), 0)

/**
 * Newest first, cut to what may be kept. The newest chat always stays, however
 * long it is: it is the one being had.
 */
export function pruneChats(chats: KeptChat[]): KeptChat[] {
  const newest = [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_CHATS)
  const out: KeptChat[] = []
  let chars = 0
  for (const chat of newest) {
    chars += sizeOf(chat)
    if (out.length > 0 && chars > MAX_CHARS) break
    out.push(chat)
  }
  return out
}

/** The list with `id`'s turns set to `turns`: a new chat goes on top, a known one keeps its start. */
export function withChat(chats: KeptChat[], id: string, turns: LiveTurn[], now: Date = new Date()): KeptChat[] {
  if (turns.length === 0) return chats
  const at = now.toISOString()
  const before = chats.find((c) => c.id === id)
  const chat: KeptChat = { id, startedAt: before?.startedAt ?? at, updatedAt: at, turns: keptTurns(turns) }
  return pruneChats([chat, ...chats.filter((c) => c.id !== id)])
}

export function withoutChat(chats: KeptChat[], id: string): KeptChat[] {
  return chats.filter((c) => c.id !== id)
}

function isChat(value: unknown): value is KeptChat {
  const c = value as KeptChat | null
  return (
    !!c &&
    typeof c === 'object' &&
    typeof c.id === 'string' &&
    typeof c.startedAt === 'string' &&
    typeof c.updatedAt === 'string' &&
    Array.isArray(c.turns) &&
    c.turns.every((t) => t && typeof t.content === 'string' && typeof t.role === 'string')
  )
}

export function loadChats(store: Store | undefined = deviceStore()): KeptChat[] {
  try {
    const parsed: unknown = JSON.parse(store?.getItem(KEY) ?? 'null')
    return Array.isArray(parsed) ? pruneChats(parsed.filter(isChat)) : []
  } catch {
    return []
  }
}

export function saveChats(chats: KeptChat[], store: Store | undefined = deviceStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify(chats))
  } catch {
    // Storage full or blocked: the thread is still on screen, only not kept.
  }
}

/** Keep `turns` as chat `id`, on top of whatever is already kept. */
export function keepChat(id: string, turns: LiveTurn[], store: Store | undefined = deviceStore()): void {
  if (turns.length === 0) return
  saveChats(withChat(loadChats(store), id, turns), store)
}

/** What a chat is listed by: the first thing asked, on one line. */
export function chatTitle(chat: KeptChat): string {
  const first = chat.turns.find((t) => t.role === 'user') ?? chat.turns[0]
  return (first?.content ?? '').replace(/\s+/g, ' ').trim()
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** When a chat was had: `7:15 pm` today, `Nov 25` this year, `Nov 25 '25` before it. */
export function chatWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  if (sameDay) {
    const h = d.getHours()
    return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
  }
  const day = `${MONTHS[d.getMonth()]} ${d.getDate()}`
  return d.getFullYear() === now.getFullYear() ? day : `${day} '${String(d.getFullYear()).slice(2)}`
}
