import { useEffect, useState } from 'react'
import { api, type Person } from '../../services/api'
import { byLastSeen, lastSeenLabel, seenWithin } from '../../lib/lastSeen'
import { SETTINGS_LABEL } from './PressButton'

/**
 * Who has an account, for the owner: how many, how many used the app this
 * week, and when each last did. The backend refuses anyone else, so a failed
 * read just leaves the section out.
 */
export function PeopleSection() {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    api
      .people()
      .then((p) => alive && setPeople(byLastSeen(p)))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])

  if (failed) return null
  const now = new Date()
  const thisWeek = people?.filter((p) => seenWithin(p.lastSeen, now, 7)).length ?? 0

  return (
    <section className="flex flex-col gap-2">
      <label className={SETTINGS_LABEL}>people</label>
      {people === null ? (
        <p className="text-xs text-neutral-500">loading…</p>
      ) : (
        <>
          <p className="text-sm">
            {people.length} {people.length === 1 ? 'account' : 'accounts'} · {thisWeek} this week
          </p>
          {people.map((p, i) => (
            <div key={`${p.email}-${i}`} className="flex min-h-[44px] items-center gap-3 rounded-xl bg-surface px-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {p.name || p.email || 'unnamed'}
                  {p.owner && <span className="text-neutral-500"> · you</span>}
                </p>
                {p.name && p.email && <p className="truncate text-xs text-neutral-500">{p.email}</p>}
              </div>
              <span className="shrink-0 text-xs text-neutral-400">{lastSeenLabel(p.lastSeen, now)}</span>
            </div>
          ))}
        </>
      )}
    </section>
  )
}
