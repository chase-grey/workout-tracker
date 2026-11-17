import { useCallback, useEffect, useState } from 'react'
import { useData } from '../../store/DataContext'
import { api } from '../../services/api'
import { toICS } from '../../lib/calendarSync'
import { useUpcomingSessions } from '../today/useCalendarInput'
import { PressButton, SETTINGS_BUTTON, SETTINGS_LABEL } from './PressButton'

/** Set while this device is away at Google's consent page, so coming back can switch the sync on. */
const PENDING_KEY = 'wt.gcalPending'

type Link = { available: boolean; connected: boolean }

/**
 * The schedule outside the app: a two-way sync with Google Calendar, and a
 * calendar file for everything else.
 *
 * Only Google gets the sync, because only Google is reached through an
 * account the backend can hold a key to (see SimpleBackend.gs "google calendar
 * sync"); the row is absent until the backend has been given its Google
 * client. Apple, Outlook and the rest take the file, which is a copy as of the
 * download and not a link.
 */
export function CalendarExportSection() {
  const { settings, updateSettings } = useData()
  const upcoming = useUpcomingSessions()
  const [link, setLink] = useState<Link | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const syncing = settings.gcalSync === true

  const check = useCallback(async () => {
    if (!api.isConfigured()) return
    try {
      const status = await api.gcalStatus()
      setLink({ available: status.available, connected: status.connected })
    } catch {
      // A backend from before the route, or no network: the row stays away.
      setLink(null)
    }
  }, [])

  useEffect(() => {
    void check()
    // Consent happens on Google's page, in this tab or another; either way the
    // way back is this app becoming visible again.
    const onReturn = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onReturn)
    return () => document.removeEventListener('visibilitychange', onReturn)
  }, [check])

  // Back from Google with the link made: that was the "yes".
  useEffect(() => {
    if (!link?.connected || syncing || localStorage.getItem(PENDING_KEY) !== '1') return
    localStorage.removeItem(PENDING_KEY)
    updateSettings({ ...settings, gcalSync: true })
  }, [link, syncing, settings, updateSettings])

  const connect = async () => {
    setBusy(true)
    setError(null)
    try {
      if (link?.connected) {
        // Linked already, from another device or an earlier visit: just switch on.
        updateSettings({ ...settings, gcalSync: true })
        return
      }
      const { url } = await api.gcalConnect(location.origin + location.pathname)
      localStorage.setItem(PENDING_KEY, '1')
      location.assign(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not reach google')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.gcalDisconnect()
      localStorage.removeItem(PENDING_KEY)
      updateSettings({ ...settings, gcalSync: false })
      setLink((l) => (l ? { ...l, connected: false } : l))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not reach google')
    } finally {
      setBusy(false)
    }
  }

  const download = () => {
    const blob = new Blob([toICS(upcoming.events)], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'workout-schedule.ics'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  return (
    <section className="flex flex-col gap-2">
      <label className={SETTINGS_LABEL}>schedule in your calendar</label>
      {link?.available &&
        (syncing && link.connected ? (
          <PressButton onPress={() => void disconnect()} disabled={busy} className={SETTINGS_BUTTON}>
            syncing with google calendar · stop
          </PressButton>
        ) : (
          <PressButton onPress={() => void connect()} disabled={busy} className={SETTINGS_BUTTON}>
            sync with google calendar
          </PressButton>
        ))}
      <PressButton onPress={download} disabled={upcoming.events.length === 0} className={SETTINGS_BUTTON}>
        download for apple, outlook & others
      </PressButton>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </section>
  )
}
