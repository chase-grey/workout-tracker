import { useEffect, useRef, useState } from 'react'
import { DataProvider, useData, type WorkoutFinishSummary } from './store/DataContext'
import { CelebrationProvider, useCelebrate } from './store/CelebrationContext'
import { BottomNav, type Tab } from './components/BottomNav'
import { ToastHost } from './components/ToastHost'
import { ReviewOverlay } from './components/ReviewOverlay'
import { WorkoutFinishOverlay } from './components/WorkoutFinishOverlay'
import { buildReview, monthKeyOf, pendingReview, yearKeyOf, type Review } from './lib/review'
import { TodayTab } from './features/today/TodayTab'
import { ProgressTab } from './features/progress/ProgressTab'
import { ChatTab } from './features/chat/ChatTab'
import { SettingsTab } from './features/settings/SettingsTab'
import { HeightSetup } from './features/setup/HeightSetup'
import { ActiveSession } from './features/today/ActiveSession'
import { useActiveSession } from './features/today/useActiveSession'
import { StretchSession } from './features/flex/StretchSession'
import { storage } from './services/storage'
import { IS_DESKTOP } from './lib/device'
import { useBackGuard } from './lib/useBackGuard'
import { MdFitnessCenter } from 'react-icons/md'
import type { DayType } from './types'
import type { VariantKey } from './config/plan'

/**
 * Chat needs a proxy holding an Epic key, which the deployed site doesn't have —
 * so it's hidden by default on a phone. A coach token means the user has pointed
 * this device at a laptop that IS running one, which brings the tab back.
 */
function chatEnabled(settings: { chatToken: string }): boolean {
  return IS_DESKTOP || settings.chatToken.trim().length > 0
}

export default function App() {
  return (
    <CelebrationProvider>
      <DataProvider>
        <AppShell />
        <ToastHost />
      </DataProvider>
    </CelebrationProvider>
  )
}

function AppShell() {
  const [tab, setTab] = useState<Tab>('today')
  const mainRef = useRef<HTMLElement>(null)
  const { saveSession, quickLog, settings, updateSettings } = useData()
  const showChat = chatEnabled(settings)
  const { celebrate } = useCelebrate()
  const controls = useActiveSession()
  const [stretching, setStretching] = useState(() => storage.loadStretch() != null)
  const [review, setReview] = useState<Review | null>(null)
  const [finishSummary, setFinishSummary] = useState<WorkoutFinishSummary | null>(null)
  // A session set aside — the rest of the app is usable while it keeps running.
  // The session stays mounted (just hidden), so its rest timer, rep pace and
  // elapsed-time accounting carry on untouched until you jump back in.
  const [minimized, setMinimized] = useState(false)
  const sessionActive = controls.session != null || stretching

  // Scroll back to the top when switching tabs.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [tab])

  // A finished/discarded session leaves nothing to jump back into.
  useEffect(() => {
    if (!sessionActive) setMinimized(false)
  }, [sessionActive])

  // Android back (and browser back) sets the session aside rather than leaving
  // the app — the workout keeps running behind the tabs.
  useBackGuard(sessionActive && !minimized, () => setMinimized(true))

  // Month/year in review, once per new period. On the feature's first run the
  // markers are unset — seed them to the current period so we never backfill a
  // surprise recap; from then on a recap shows on the first open of a new month
  // or year. Reads from storage (the cache is loaded synchronously) so it runs
  // on mount without waiting for the background sync.
  useEffect(() => {
    const s = storage.loadSettings()
    const now = new Date()
    if (s.lastReviewedMonth == null || s.lastReviewedYear == null) {
      updateSettings({ ...s, lastReviewedMonth: monthKeyOf(now), lastReviewedYear: yearKeyOf(now) })
      return
    }
    const data = {
      workouts: storage.loadWorkouts(),
      flexDates: storage.loadFlex().map((f) => f.date),
      calorieEntries: storage.loadCalories(),
      bodyWeights: storage.loadBodyWeights(),
    }
    const pending = pendingReview(s, data, now)
    if (pending) setReview(buildReview(data, pending.kind, pending.periodKey))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dismissReview = () => {
    const s = storage.loadSettings()
    const now = new Date()
    const next = { ...s, lastReviewedMonth: monthKeyOf(now) }
    // A year recap subsumes the month that just closed, so mark both reviewed.
    if (review?.kind === 'year') next.lastReviewedYear = yearKeyOf(now)
    updateSettings(next)
    setReview(null)
  }

  // First-run: capture height once before showing the app. Existing users who
  // already set a height are never prompted.
  if (!settings.setupComplete && settings.heightIn == null) return <HeightSetup />

  const startStretch = () => {
    if (!storage.loadStretch())
      storage.saveStretch({ step: 0, done: [], startedAt: new Date().toISOString() })
    setMinimized(false)
    setStretching(true)
  }

  const startWorkout = (dayType: DayType, variant?: VariantKey) => {
    setMinimized(false)
    controls.start(dayType, variant)
  }

  // Workouts and stretches take over the whole screen (no tabs / bottom nav)
  // unless they've been set aside.
  const immersive = (sessionActive && !minimized) || finishSummary != null

  const dismissFinish = () => {
    const ambient = finishSummary?.ambient ?? null
    setFinishSummary(null)
    setTab('today')
    // Any weekly-goal / all-time-record wins ride in after the recap closes.
    if (ambient) celebrate(ambient)
  }

  let session = null
  if (controls.session) {
    const { dayType } = controls.session
    session = (
      <ActiveSession
        session={controls.session}
        controls={controls}
        onFinish={(s, duration) => {
          // Show the full-screen recap first, then return to Today on dismiss.
          void saveSession(s, duration).then((summary) => setFinishSummary(summary))
          controls.clear()
        }}
        onSkip={() => {
          void quickLog(dayType)
          controls.clear()
          setTab('today')
        }}
        onMinimize={() => setMinimized(true)}
      />
    )
  } else if (stretching) {
    session = (
      <StretchSession
        onClose={() => {
          storage.saveStretch(null)
          setStretching(false)
          // A finished routine lands you home, under the celebration screen.
          setTab('today')
        }}
        onMinimize={() => setMinimized(true)}
      />
    )
  }

  return (
    <div className="app-shell mx-auto flex max-w-md flex-col">
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto px-4 pb-4"
        style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top))' }}
      >
        {/* A set-aside session stays mounted, only hidden — its timers, rep pace
            and elapsed-time accounting must not restart when you look away. */}
        {session && <div className={minimized ? 'hidden' : 'contents'}>{session}</div>}
        {(!session || minimized) && (
          <>
            {tab === 'today' && <TodayTab onStart={startWorkout} onStartStretch={startStretch} />}
            {tab === 'progress' && <ProgressTab />}
            {tab === 'coach' && showChat && <ChatTab />}
            {tab === 'settings' && <SettingsTab />}
          </>
        )}
      </main>
      {minimized && sessionActive && (
        <button
          onClick={() => setMinimized(false)}
          className="flex min-h-[52px] items-center justify-center gap-2 border-t border-border bg-accent text-base font-bold text-black active:opacity-80"
        >
          <MdFitnessCenter className="text-xl" aria-hidden />
          {controls.session ? 'back to your workout' : 'back to your stretch'}
        </button>
      )}
      {!immersive && <BottomNav active={tab} onChange={setTab} showChat={showChat} />}
      {review && <ReviewOverlay review={review} onClose={dismissReview} />}
      {finishSummary && <WorkoutFinishOverlay summary={finishSummary} onClose={dismissFinish} />}
    </div>
  )
}
