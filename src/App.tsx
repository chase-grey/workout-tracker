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

const CHAT_ENABLED = IS_DESKTOP

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
  const { celebrate } = useCelebrate()
  const controls = useActiveSession()
  const [stretching, setStretching] = useState(() => storage.loadStretch() != null)
  const [review, setReview] = useState<Review | null>(null)
  const [finishSummary, setFinishSummary] = useState<WorkoutFinishSummary | null>(null)

  // Scroll back to the top when switching tabs.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [tab])

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
    setStretching(true)
  }

  // Workouts and stretches take over the whole screen (no tabs / bottom nav).
  const immersive = controls.session != null || stretching || finishSummary != null

  const dismissFinish = () => {
    const ambient = finishSummary?.ambient ?? null
    setFinishSummary(null)
    // Any weekly-goal / all-time-record wins ride in after the recap closes.
    if (ambient) celebrate(ambient)
  }

  let content
  if (controls.session) {
    const { dayType } = controls.session
    content = (
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
        }}
      />
    )
  } else if (stretching) {
    content = (
      <StretchSession
        onClose={() => {
          storage.saveStretch(null)
          setStretching(false)
        }}
      />
    )
  } else {
    content = (
      <>
        {tab === 'today' && <TodayTab onStart={controls.start} onStartStretch={startStretch} />}
        {tab === 'progress' && <ProgressTab />}
        {tab === 'chat' && CHAT_ENABLED && <ChatTab />}
        {tab === 'settings' && <SettingsTab />}
      </>
    )
  }

  return (
    <div className="mx-auto flex h-[100dvh] max-w-md flex-col">
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto px-4 pb-4"
        style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top))' }}
      >
        {content}
      </main>
      {!immersive && <BottomNav active={tab} onChange={setTab} showChat={CHAT_ENABLED} />}
      {review && <ReviewOverlay review={review} onClose={dismissReview} />}
      {finishSummary && <WorkoutFinishOverlay summary={finishSummary} onClose={dismissFinish} />}
    </div>
  )
}
