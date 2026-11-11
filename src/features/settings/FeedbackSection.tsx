import { useState } from 'react'
import { api } from '../../services/api'
import { APP_COMMIT } from '../../lib/version'
import { useData } from '../../store/DataContext'
import { PressButton, SETTINGS_BUTTON, SETTINGS_FIELD, SETTINGS_LABEL } from './PressButton'

export function FeedbackSection() {
  const { settings } = useData()
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (settings.accountMode !== 'hosted') return null

  const send = async () => {
    setPending(true)
    setError(null)
    try {
      await api.postFeedback(text.trim(), APP_COMMIT)
      setText('')
      setSent(true)
      setTimeout(() => setSent(false), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'something went wrong')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <label className={SETTINGS_LABEL}>feedback</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className={`${SETTINGS_FIELD} py-3`}
      />
      <PressButton onPress={() => void send()} disabled={pending || !text.trim()} className={SETTINGS_BUTTON}>
        {sent ? 'sent ✓' : 'send'}
      </PressButton>
      {error && <p className="text-xs text-neutral-500">{error}</p>}
    </section>
  )
}
