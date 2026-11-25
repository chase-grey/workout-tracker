import { useState } from 'react'
import { signupDay, type Signup } from '../../lib/signups'
import { declineSignup, keepSignup } from '../../store/useSignups'
import { SETTINGS_LABEL } from './PressButton'

const ANSWER = 'min-h-[44px] flex-1 rounded-xl bg-surface-2 text-sm font-medium active:opacity-80 disabled:text-neutral-600'

/**
 * The accounts made since the owner last looked, each to be kept or declined.
 * Sign-up is open, so this is where the owner hears of one. Declining removes
 * the account and everything it logged, so it takes the second tap every
 * other removal in the app does. With nothing waiting the section isn't there.
 */
export function SignupsSection({ signups }: { signups: Signup[] }) {
  const [confirm, setConfirm] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  if (signups.length === 0) return null

  const answer = async (id: string, send: (id: string) => Promise<void>) => {
    if (busy) return
    setBusy(id)
    setFailed(false)
    setConfirm(null)
    try {
      await send(id)
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <label className={SETTINGS_LABEL}>new accounts</label>
      {signups.map((s) => (
        <div key={s.id} className="flex flex-col gap-2 rounded-xl bg-surface p-3">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{s.name || s.email || 'unnamed'}</p>
              {s.name && s.email && <p className="truncate text-xs text-neutral-500">{s.email}</p>}
            </div>
            <span className="shrink-0 text-xs text-neutral-400">{signupDay(s.createdAt)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void answer(s.id, keepSignup)} disabled={busy !== null} className={ANSWER}>
              keep
            </button>
            <button
              onClick={() => {
                if (confirm !== s.id) {
                  setConfirm(s.id)
                  return
                }
                void answer(s.id, declineSignup)
              }}
              onBlur={() => setConfirm(null)}
              disabled={busy !== null}
              className={`${ANSWER} ${confirm === s.id ? 'text-accent' : 'text-neutral-400'}`}
            >
              {confirm === s.id ? 'tap again to decline' : 'decline'}
            </button>
          </div>
        </div>
      ))}
      {failed && <p className="text-xs text-red-400">couldn’t save</p>}
    </section>
  )
}
