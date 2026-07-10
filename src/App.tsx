import { useState } from 'react'
import { DataProvider } from './store/DataContext'
import { BottomNav, type Tab } from './components/BottomNav'
import { TodayTab } from './features/today/TodayTab'
import { ProgressTab } from './features/progress/ProgressTab'
import { ChatTab } from './features/chat/ChatTab'
import { SettingsTab } from './features/settings/SettingsTab'

// The chat can't reach the Epic proxy from a deployed phone (internal-only +
// CORS + cert), so hide it there. Keep it on desktop, and in local dev (which
// includes `dev:host` viewed from a phone, where the dev proxy makes it work).
const isTouchDevice =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
const CHAT_ENABLED = import.meta.env.DEV || !isTouchDevice

export default function App() {
  const [tab, setTab] = useState<Tab>('today')

  return (
    <DataProvider>
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col">
        <main
          className="flex-1 overflow-y-auto px-4 pb-6"
          style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top))' }}
        >
          {tab === 'today' && <TodayTab />}
          {tab === 'progress' && <ProgressTab />}
          {tab === 'chat' && CHAT_ENABLED && <ChatTab />}
          {tab === 'settings' && <SettingsTab />}
        </main>
        <BottomNav active={tab} onChange={setTab} showChat={CHAT_ENABLED} />
      </div>
    </DataProvider>
  )
}
