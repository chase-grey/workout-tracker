import { useState } from 'react'
import { api } from '../../services/api'
import { useData } from '../../store/DataContext'
import { PressButton, SETTINGS_BUTTON, SETTINGS_FIELD, SETTINGS_LABEL } from './PressButton'

const message = (e: unknown) => (e instanceof Error ? e.message : 'something went wrong')

/** Copy `text`; false when the browser won't let it. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function inviteLink(code: string): string {
  return `${location.origin}${location.pathname}?invite=${code}`
}

export function AccountSection() {
  const { settings, updateSettings, refresh, signInToAccount } = useData()
  const mode = settings.accountMode ?? 'legacy'
  const [code, setCode] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [invite, setInvite] = useState<string | null>(null)
  const secret = settings.chatToken.trim()

  const flashed = (text: string) => {
    setFlash(text)
    setTimeout(() => setFlash((cur) => (cur === text ? null : cur)), 1500)
  }

  const run = async (job: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await job()
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  const join = () =>
    run(async () => {
      const r = await api.join(code.trim(), settings.profile?.name ?? '')
      await updateSettings({ ...settings, accountMode: 'hosted', accountToken: r.token, accountName: r.name })
      setCode('')
      await refresh()
    })

  const signIn = () =>
    run(async () => {
      const k = key.trim()
      const r = await api.account(k)
      setKey('')
      // Not updateSettings: that would push this phone's settings over the
      // account's before reading them (see DataContext.signInToAccount).
      await signInToAccount({ accountMode: 'hosted', accountToken: k, accountName: r.name })
    })

  const saveKey = () =>
    run(async () => {
      const k = key.trim()
      await api.account(k)
      await updateSettings({ ...settings, accountToken: k })
      setKey('')
      flashed('saved ✓')
    })

  const mint = () =>
    run(async () => {
      setInvite((await api.invite(secret)).code)
    })

  const copyKey = async () => {
    if (await copyText(settings.accountToken ?? '')) flashed('copied ✓')
  }

  const copyInvite = async () => {
    if (invite && (await copyText(invite))) flashed('copied ✓')
  }

  const shareInvite = async () => {
    if (!invite) return
    const link = inviteLink(invite)
    if (navigator.share) {
      try {
        await navigator.share({ text: `join me on workout tracker: ${link}` })
      } catch {
        // dismissing the sheet is not an error
      }
    } else if (await copyText(link)) flashed('copied ✓')
  }

  const keyField = (
    <input
      type="password"
      value={key}
      onChange={(e) => setKey(e.target.value)}
      placeholder="account key"
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={false}
      className={SETTINGS_FIELD}
    />
  )

  return (
    <section className="flex flex-col gap-2">
      <label className={SETTINGS_LABEL}>account</label>

      {mode === 'hosted' && (
        <>
          {settings.accountName && <p className="text-sm">{settings.accountName}</p>}
          <PressButton onPress={() => void copyKey()} className={SETTINGS_BUTTON}>
            {flash === 'copied ✓' ? 'copied ✓' : 'copy account key'}
          </PressButton>
        </>
      )}

      {mode === 'local' && (
        <>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="invite code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className={`${SETTINGS_FIELD} font-mono`}
          />
          <PressButton onPress={() => void join()} disabled={busy || !code.trim()} className={SETTINGS_BUTTON}>
            join
          </PressButton>
          {keyField}
          <PressButton onPress={() => void signIn()} disabled={busy || !key.trim()} className={SETTINGS_BUTTON}>
            sign in
          </PressButton>
        </>
      )}

      {mode === 'legacy' && (
        <>
          {keyField}
          <PressButton onPress={() => void saveKey()} disabled={busy || !key.trim()} className={SETTINGS_BUTTON}>
            {flash === 'saved ✓' ? 'saved ✓' : 'save'}
          </PressButton>
        </>
      )}

      {secret && (
        <>
          <PressButton onPress={() => void mint()} disabled={busy} className={SETTINGS_BUTTON}>
            invite someone
          </PressButton>
          {invite && (
            <div className="flex flex-col gap-2 rounded-xl bg-surface p-3">
              <span className="select-all text-center font-mono text-3xl font-bold tracking-widest">
                {invite}
              </span>
              <div className="flex gap-2">
                <PressButton
                  onPress={() => void copyInvite()}
                  className="min-h-[44px] flex-1 rounded-xl bg-surface-2 font-medium"
                >
                  {flash === 'copied ✓' ? 'copied ✓' : 'copy'}
                </PressButton>
                <PressButton
                  onPress={() => void shareInvite()}
                  className="min-h-[44px] flex-1 rounded-xl bg-surface-2 font-medium"
                >
                  share
                </PressButton>
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="text-xs text-neutral-500">{error}</p>}
    </section>
  )
}
