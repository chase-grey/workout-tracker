import { useState } from 'react'
import { useData } from '../../store/DataContext'
import { api, type SignedIn } from '../../services/api'
import { emailOk, loginOk } from '../../lib/login'
import { SHELL_PAD_TOP, SHELL_PAD_X, SHELL_WIDTH } from '../../lib/shell'
import { PressButton, SETTINGS_FIELD, SETTINGS_LABEL } from '../settings/PressButton'
import { LoginFields } from './LoginFields'

type Mode = 'new' | 'signin'

/**
 * Between a device that was in use before accounts were required and the app
 * (see lib/account needsAccount). Everything already on the device stays and
 * goes up with the account; nothing reaches the app until there is one.
 *
 * The owner's own old phones (`legacy`) set the owner's email and password
 * here, proven by the issue token they carry: that makes the owner's account,
 * which is every workout already logged, and from then on the backend takes no
 * request without a key. A `local` device makes an ordinary account and its
 * outbox — everything it ever logged — uploads into it.
 */
export function AccountGate() {
  const { settings, updateSettings, signInToAccount } = useData()
  const legacy = settings.accountMode === 'legacy'
  const secret = settings.chatToken.trim()
  // Without the issue token an old phone can't prove it's the owner's, so all
  // it can do is sign in to the account another of the owner's phones made.
  const canMake = !legacy || secret !== ''
  const [mode, setMode] = useState<Mode>(canMake ? 'new' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ok = mode === 'new' ? loginOk(email, password) : emailOk(email) && password !== ''

  // The device's own data is the account's when it's the owner taking up the
  // owner's account, or anyone making a new one: keep it all, and let the
  // settings save that sets the key carry the rest up. Signing in to some
  // other account is a different person's device now (see signInToAccount).
  const adopt = (who: SignedIn) =>
    updateSettings({ ...settings, accountMode: 'hosted', accountToken: who.token, accountName: who.name })

  const submit = async () => {
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signin') {
        const who = await api.login(email.trim(), password)
        if (legacy && who.owner) adopt(who)
        else await signInToAccount({ accountMode: 'hosted', accountToken: who.token, accountName: who.name })
      } else if (legacy) {
        adopt(await api.claimOwner(secret, email.trim(), password))
      } else {
        const name = settings.profile?.name?.trim() || email.trim().split('@')[0]
        adopt(await api.register(email.trim(), password, name))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'something went wrong')
      setBusy(false)
    }
  }

  return (
    <div className="app-shell overflow-y-auto">
      <div className={`flex min-h-full flex-col gap-5 bg-bg ${SHELL_WIDTH} w-full ${SHELL_PAD_X} ${SHELL_PAD_TOP}`}>
        <h1 className="mt-2 text-2xl font-bold">your account</h1>
        {canMake && (
          <div className="flex gap-1 rounded-xl bg-surface p-1">
            {(['new', 'signin'] as const).map((m) => (
              <PressButton
                key={m}
                onPress={() => {
                  setMode(m)
                  setError(null)
                }}
                pressed={mode === m}
                className={`min-h-[36px] flex-1 rounded-lg px-2 text-sm font-medium ${
                  mode === m ? 'bg-accent text-on-accent' : 'text-neutral-400'
                }`}
              >
                {m === 'new' ? (legacy ? 'set up' : 'new account') : 'sign in'}
              </PressButton>
            ))}
          </div>
        )}
        <LoginFields
          email={email}
          password={password}
          onEmail={setEmail}
          onPassword={setPassword}
          fresh={mode === 'new'}
          fieldClass={SETTINGS_FIELD}
          labelClass={SETTINGS_LABEL}
        />
        <div className="flex-1" />
        <div className="mb-[calc(1rem+env(safe-area-inset-bottom))] flex flex-col gap-2">
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <PressButton
            onPress={() => void submit()}
            disabled={!ok || busy}
            className="min-h-[48px] w-full rounded-xl bg-accent font-semibold text-on-accent aria-disabled:opacity-50"
          >
            {busy ? 'saving…' : mode === 'signin' ? 'sign in' : 'save'}
          </PressButton>
        </div>
      </div>
    </div>
  )
}
