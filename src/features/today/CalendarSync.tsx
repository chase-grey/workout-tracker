import { useEffect, useRef } from 'react'
import { useData } from '../../store/DataContext'
import { api } from '../../services/api'
import { storage } from '../../services/storage'
import { mergeSync, type Upcoming } from '../../lib/calendarSync'
import { withWeekPins } from '../../lib/weekCalendar'
import { useUpcomingSessions } from './useCalendarInput'

/** How long the schedule has to sit still before a change is sent. */
const SETTLE_MS = 3_000
/** How often an open app looks for changes made in Google. */
const POLL_MS = 5 * 60_000
/** The least time between two looks brought on by coming back to the app. */
const RETURN_MS = 30_000

/**
 * Keeps the schedule and the account's Google calendar in step, both ways,
 * while the setting is on. Renders nothing.
 *
 * It runs when the app opens, when it comes back to the front, every few
 * minutes while it stays open, and a few seconds after the schedule changes
 * here. A change made in Google therefore lands the next time the app is
 * looked at — which is the only place it could be seen.
 *
 * Each run asks the backend what the calendar holds and what was last agreed,
 * lets lib/calendarSync settle the three, sends Google its share and saves
 * the app's share as the weeks' own days. Saving those changes the schedule,
 * which schedules another run; that one finds everything agreed and stops.
 */
export function CalendarSync() {
  const { settings, updateSettings } = useData()
  const upcoming = useUpcomingSessions()
  const on = settings.gcalSync === true

  const latest = useRef<Upcoming>(upcoming)
  latest.current = upcoming
  const running = useRef(false)
  const again = useRef(false)
  const lastRun = useRef(0)

  const run = useRef(async () => {})
  run.current = async () => {
    if (running.current) {
      again.current = true
      return
    }
    if (!api.isConfigured() || !navigator.onLine) return
    running.current = true
    lastRun.current = Date.now()
    try {
      const want = latest.current
      const state = await api.gcalState(want.from, want.to)
      if (!state.connected) {
        // Access was taken away in Google, or the link dropped from another
        // device: the setting follows, so Settings offers to connect again.
        updateSettings({ ...storage.loadSettings(), gcalSync: false })
        return
      }
      const plan = mergeSync({
        from: want.from,
        to: want.to,
        base: state.base,
        app: want.events,
        remote: state.events,
        locked: want.locked,
      })
      if (plan.create.length || plan.update.length || plan.remove.length || plan.baseChanged) {
        const done = await api.gcalApply({
          create: plan.create,
          update: plan.update,
          remove: plan.remove,
          base: plan.base,
        })
        // Something didn't land in Google: leave the app as it is and let the
        // next run settle it against the base that was kept.
        if (done.failed > 0) return
      }
      if (plan.appChanges.length) {
        const current = storage.loadSettings()
        let weeks = current.calendarWeeks
        for (const c of plan.appChanges) weeks = withWeekPins(weeks, c.weekStart, c.pillar, c.weekdays, want.from)
        updateSettings({ ...current, calendarWeeks: weeks })
      }
    } catch {
      // Offline, or Google slow: the next trigger tries again.
    } finally {
      running.current = false
      if (again.current) {
        again.current = false
        void run.current()
      }
    }
  }

  // The schedule as one string: a run is owed whenever it changes.
  const signature = on ? JSON.stringify(upcoming.events) : ''
  useEffect(() => {
    if (!on) return
    const id = window.setTimeout(() => void run.current(), SETTLE_MS)
    return () => window.clearTimeout(id)
  }, [on, signature])

  useEffect(() => {
    if (!on) return
    const poll = window.setInterval(() => void run.current(), POLL_MS)
    const onReturn = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRun.current > RETURN_MS) void run.current()
    }
    document.addEventListener('visibilitychange', onReturn)
    return () => {
      window.clearInterval(poll)
      document.removeEventListener('visibilitychange', onReturn)
    }
  }, [on])

  return null
}
