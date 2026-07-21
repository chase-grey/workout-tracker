import { useEffect, useRef, useState } from 'react'
import { DataProvider, useData } from './store/DataContext'
import { BottomNav, type Tab } from './components/BottomNav'
import { ToastHost } from './components/ToastHost'
import { TodayTab } from './features/today/TodayTab'
import { ProgressTab } from './features/progress/ProgressTab'
import { ChatTab } from './features/chat/ChatTab'
import { SettingsTab } from './features/settings/SettingsTab'
import { ActiveSession } from './features/today/ActiveSession'
import { useActiveSession } from './features/today/useActiveSession'
import { StretchSession } from './features/flex/StretchSession'
import { storage } from './services/storage'
import { IS_DESKTOP } from './lib/device'

const CHAT_ENABLED = IS_DESKTOP

export default function App() {
  return (
    <DataProvider>
      <AppShell />
      <ToastHost />
    </DataProvider>
  )
}

function AppShell() {
  const [tab, setTab] = useState<Tab>('today')
  const mainRef = useRef<HTMLElement>(null)
  const { saveSession, quickLog } = useData()
  const controls = useActiveSession()
  const [stretching, setStretching] = useState(() => storage.loadStretch() != null)

  // Scroll back to the top when switching tabs.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [tab])

  const startStretch = () => {
    if (!storage.loadStretch()) storage.saveStretch({ step: 0, done: [] })
    setStretching(true)
  }

  // Workouts and stretches take over the whole screen (no tabs / bottom nav).
  const immersive = controls.session != null || stretching

  let content
  if (controls.session) {
    const { dayType } = controls.session
    content = (
      <ActiveSession
        session={controls.session}
        controls={controls}
        onFinish={(s) => {
          void saveSession(s)
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
    </div>
  )
}
