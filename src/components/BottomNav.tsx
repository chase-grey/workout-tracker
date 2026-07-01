export type Tab = 'today' | 'progress' | 'chat' | 'settings'

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'today', icon: '🏋️', label: 'Today' },
  { id: 'progress', icon: '📈', label: 'Progress' },
  { id: 'chat', icon: '💬', label: 'Chat' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
]

export function BottomNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      className="sticky bottom-0 z-30 grid grid-cols-4 border-t border-border bg-surface/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 ${
            active === t.id ? 'text-accent' : 'text-neutral-500'
          }`}
        >
          <span className="text-xl leading-none">{t.icon}</span>
          <span className="text-[11px] font-medium">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
