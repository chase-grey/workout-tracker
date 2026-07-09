import { useState } from 'react'
import { DataProvider } from './store/DataContext'
import { BottomNav, type Tab } from './components/BottomNav'
import { TodayTab } from './features/today/TodayTab'
import { ProgressTab } from './features/progress/ProgressTab'
import { FlexTab } from './features/flex/FlexTab'
import { ChatTab } from './features/chat/ChatTab'
import { SettingsTab } from './features/settings/SettingsTab'

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
          {tab === 'flex' && <FlexTab />}
          {tab === 'chat' && <ChatTab />}
          {tab === 'settings' && <SettingsTab />}
        </main>
        <BottomNav active={tab} onChange={setTab} />
      </div>
    </DataProvider>
  )
}
