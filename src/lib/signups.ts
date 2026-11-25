/**
 * New accounts, as the owner hears of them.
 *
 * Sign-up is open and an account works the moment it is made, so the backend
 * leaves the owner a notice of each one (SimpleBackend.gs "new accounts"). The
 * owner keeps it, and the notice goes, or declines it, and the account goes.
 * This is the list those notices are held in on a device: read from the
 * backend, kept between visits, and shortened as each one is answered.
 */

/** One account the owner has not kept or declined yet. */
export type Signup = { id: string; name: string; email: string; createdAt: string }

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** The day an account was made, the way you'd say it: "nov 25". */
export function signupDay(iso: string): string {
  const d = new Date(iso)
  if (!iso || !Number.isFinite(d.getTime())) return ''
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

/**
 * A list of notices out of whatever was handed over: the backend's answer or
 * the copy kept on the device. Anything that isn't one is left out, so an
 * answer of another shape is no notices rather than a broken screen.
 */
export function readSignups(value: unknown): Signup[] {
  if (!Array.isArray(value)) return []
  const out: Signup[] = []
  for (const v of value as Partial<Signup>[]) {
    if (!v || typeof v.id !== 'string' || !v.id) continue
    out.push({
      id: v.id,
      name: typeof v.name === 'string' ? v.name : '',
      email: typeof v.email === 'string' ? v.email : '',
      createdAt: typeof v.createdAt === 'string' ? v.createdAt : '',
    })
  }
  return out
}

/** The notices a device shows: the owner's, and nobody else's. */
export function shownSignups(owner: boolean, signups: Signup[]): Signup[] {
  return owner ? signups : NONE
}
const NONE: Signup[] = []

/** Where the list comes from and goes to; the app's are the backend and the device's storage. */
export type SignupIO = {
  list: () => Promise<unknown>
  keep: (id: string) => Promise<unknown>
  decline: (id: string) => Promise<unknown>
  load: () => unknown
  save: (signups: Signup[]) => void
}

export type SignupStore = {
  get: () => Signup[]
  subscribe: (notify: () => void) => () => void
  refresh: () => Promise<void>
  keep: (id: string) => Promise<void>
  decline: (id: string) => Promise<void>
}

/**
 * One shared copy of the notices, for the dot on the nav and the list in
 * Settings to read alike.
 *
 * A read that fails changes nothing and says nothing: a backend not yet
 * updated answers `Unknown route`, an account that isn't the owner's is
 * refused, and a phone can be offline. None of those is the owner's problem.
 * An answer that fails is thrown to whoever asked, with the notice left where
 * it was.
 */
export function createSignupStore(io: SignupIO): SignupStore {
  let state: Signup[] | null = null
  let inFlight = false
  // Answered on this device. A read already on its way when the answer was
  // given still lists the account, and must not bring its notice back.
  const answered = new Set<string>()
  const subs = new Set<() => void>()

  const get = () => (state ??= readSignups(io.load()))
  const set = (next: Signup[]) => {
    state = next
    io.save(next)
    for (const notify of subs) notify()
  }
  const answer = async (id: string, send: (id: string) => Promise<unknown>) => {
    await send(id)
    answered.add(id)
    set(get().filter((s) => s.id !== id))
  }

  return {
    get,
    subscribe: (notify) => {
      subs.add(notify)
      return () => subs.delete(notify)
    },
    refresh: async () => {
      if (inFlight) return
      inFlight = true
      try {
        const list = readSignups(await io.list())
        set(list.filter((s) => !answered.has(s.id)))
      } catch {
        /* the last list stands */
      } finally {
        inFlight = false
      }
    },
    keep: (id) => answer(id, io.keep),
    decline: (id) => answer(id, io.decline),
  }
}
