import type { IconType } from 'react-icons'
import {
  MdFitnessCenter,
  MdInsights,
  MdSelfImprovement,
  MdChatBubbleOutline,
  MdSettings,
} from 'react-icons/md'

export type Tab = 'today' | 'progress' | 'flex' | 'chat' | 'settings'

const TABS: { id: Tab; Icon: IconType; label: string }[] = [
  { id: 'today', Icon: MdFitnessCenter, label: 'Today' },
  { id: 'progress', Icon: MdInsights, label: 'Progress' },
  { id: 'flex', Icon: MdSelfImprovement, label: 'Flex' },
  { id: 'chat', Icon: MdChatBubbleOutline, label: 'Chat' },
  { id: 'settings', Icon: MdSettings, label: 'Settings' },
]

export function BottomNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      className="sticky bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 backdrop-blur"
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
          <t.Icon className="text-xl leading-none" aria-hidden />
          <span className="text-[11px] font-medium">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
