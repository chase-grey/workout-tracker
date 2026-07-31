import type { IconType } from 'react-icons'
import { MdFitnessCenter, MdInsights, MdChatBubbleOutline, MdSettings } from 'react-icons/md'

export type Tab = 'today' | 'progress' | 'chat' | 'settings'

const TABS: { id: Tab; Icon: IconType; label: string }[] = [
  { id: 'today', Icon: MdFitnessCenter, label: 'today' },
  { id: 'progress', Icon: MdInsights, label: 'progress' },
  { id: 'chat', Icon: MdChatBubbleOutline, label: 'chat' },
  { id: 'settings', Icon: MdSettings, label: 'settings' },
]

export function BottomNav({
  active,
  onChange,
  showChat = true,
}: {
  active: Tab
  onChange: (t: Tab) => void
  showChat?: boolean
}) {
  const tabs = TABS.filter((t) => t.id !== 'chat' || showChat)
  return (
    <nav
      className="sticky bottom-0 z-30 grid border-t border-border bg-surface/95 backdrop-blur"
      style={{
        gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 ${
            active === t.id ? 'text-accent' : 'text-neutral-500'
          }`}
        >
          <t.Icon className="text-xl leading-none" aria-hidden />
          <span className="text-[11px] font-medium">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
