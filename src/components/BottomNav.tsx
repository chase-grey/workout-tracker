import type { IconType } from 'react-icons'
import { MdFitnessCenter, MdInsights, MdChatBubbleOutline, MdSettings } from 'react-icons/md'

export type Tab = 'today' | 'progress' | 'coach' | 'settings'

const TABS: { id: Tab; Icon: IconType; label: string }[] = [
  { id: 'today', Icon: MdFitnessCenter, label: 'today' },
  { id: 'progress', Icon: MdInsights, label: 'progress' },
  { id: 'coach', Icon: MdChatBubbleOutline, label: 'coach' },
  { id: 'settings', Icon: MdSettings, label: 'settings' },
]

export function BottomNav({
  active,
  onChange,
  showChat = true,
  alerts = [],
}: {
  active: Tab
  onChange: (t: Tab) => void
  showChat?: boolean
  /** Tabs with something waiting on you, marked with a dot on the icon. */
  alerts?: Tab[]
}) {
  const tabs = TABS.filter((t) => t.id !== 'coach' || showChat)
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
          {/* The dot rides on the icon, not the button, so it sits against the
              glyph rather than out in the tab's empty width. */}
          <span className="relative leading-none">
            <t.Icon className="text-xl leading-none" aria-hidden />
            {alerts.includes(t.id) && (
              <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" />
            )}
          </span>
          <span className="text-[11px] font-medium">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
