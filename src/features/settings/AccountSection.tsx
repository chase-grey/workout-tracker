import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { useData } from '../../store/DataContext'
import { loginOk } from '../../lib/login'
import { LoginFields } from '../setup/LoginFields'
import { PressButton, SETTINGS_BUTTON, SETTINGS_FIELD, SETTINGS_LABEL } from './PressButton'

/**
 * Who this device is signed in as, and the email and password that sign in
 * elsewhere. An account made by invite, before sign-in by email, has neither
 * yet, so for it the form is simply open.
 */
export function AccountSection() {
  const { settings } = useData()
  const token = settings.accountToken?.trim() ?? ''
  // null until the backend has said; '' for an account with no email yet.
  const [email, setEmail] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!token) return
    let alive = true
    api
      .account(token)
      .then((who) => alive && setEmail(who.email ?? ''))
      .catch(() => {
        /* offline: show what's known */
      })
    return () => {
      alive = false
    }
  }, [token])

  if (!token) return null

  const open = editing || email === ''

  const save = async () => {
    if (!loginOk(newEmail, password) || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.setLogin(newEmail.trim(), password)
      setEmail(newEmail.trim().toLowerCase())
      setEditing(false)
      setPassword('')
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <label className={SETTINGS_LABEL}>account</label>
      <div className="rounded-xl bg-surface px-3 py-2">
        {(settings.profile?.name || settings.accountName) && (
          <p className="text-sm">{settings.profile?.name || settings.accountName}</p>
        )}
        {email && <p className="text-xs text-neutral-400">{email}</p>}
      </div>
      {open ? (
        <>
          <LoginFields
            email={newEmail}
            password={password}
            onEmail={setNewEmail}
            onPassword={setPassword}
            fresh
            fieldClass={SETTINGS_FIELD}
            labelClass={SETTINGS_LABEL}
          />
          <PressButton
            onPress={() => void save()}
            disabled={!loginOk(newEmail, password) || busy}
            className={SETTINGS_BUTTON}
          >
            {busy ? 'saving…' : 'save'}
          </PressButton>
        </>
      ) : (
        <PressButton
          onPress={() => {
            setNewEmail(email ?? '')
            setEditing(true)
          }}
          className={SETTINGS_BUTTON}
        >
          {saved ? 'saved ✓' : 'change email or password'}
        </PressButton>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </section>
  )
}
