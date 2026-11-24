import type { IconType } from 'react-icons'
import { MdFitnessCenter, MdInsights, MdChatBubbleOutline, MdSettings } from 'react-icons/md'

export type Tab = 'today' | 'progress' | 'coach' | 'settings'

// The label is the tab's accessible name rather than anything drawn: the bar is
// icons only, and the glyphs are aria-hidden, so without this a screen reader
// would read four unnamed buttons.
const TABS: { id: Tab; Icon: IconType; label: string }[] = [
  { id: 'today', Icon: MdFitnessCenter, label: 'today' },
  { id: 'progress', Icon: MdInsights, label: 'progress' },
  { id: 'coach', Icon: MdChatBubbleOutline, label: 'coach' },
  { id: 'settings', Icon: MdSettings, label: 'settings' },
]

/** The bar's tabs, left to right, as it is drawn with the coach on or off. */
export function tabsShown(showChat: boolean): Tab[] {
  return TABS.filter((t) => t.id !== 'coach' || showChat).map((t) => t.id)
}

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
  const at = tabs.findIndex((t) => t.id === active)
  // Dark, the bar wears the ground rather than a surface: an installed app on
  // Android doesn't draw under the system navigation bar yet, and Chrome paints
  // that bar the manifest's theme_color — the dark ground. On the ground, the
  // two read as one bar instead of a grey strip sat on a black one. Light keeps
  // its white surface; the manifest has one colour, and it's the dark one.
  // viewport-fit=cover and the safe-area padding below already carry the bar to
  // the bottom edge for the day Chrome does draw under it.
  return (
    <nav
      className="sticky bottom-0 z-30 grid border-t border-border bg-bg/95 backdrop-blur [[data-mode=light]_&]:bg-surface/95"
      style={{
        gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* A soft pill of the accent under the tab you're on, which slides to the
          next one rather than blinking out and in. A cell wide, so moving it a
          whole tab is its own width; under the buttons, and never in a tap's way. */}
      {at >= 0 && (
        <span
          aria-hidden
          className="nav-pill pointer-events-none absolute left-0 top-0 -z-10 flex h-[44px] items-center justify-center"
          style={{ width: `${100 / tabs.length}%`, transform: `translateX(${at * 100}%)` }}
        >
          <span className="h-8 w-14 rounded-full bg-accent/15" />
        </span>
      )}
      {tabs.map((t) => (
        <button
          key={t.id}
          data-tab={t.id}
          onClick={() => onChange(t.id)}
          aria-label={alerts.includes(t.id) ? `${t.label}, needs attention` : t.label}
          aria-current={active === t.id ? 'page' : undefined}
          className={`flex min-h-[44px] items-center justify-center ${
            active === t.id ? 'text-accent' : 'text-neutral-500'
          }`}
        >
          {/* The dot rides on the icon, not the button, so it sits against the
              glyph rather than out in the tab's empty width. */}
          <span className="nav-icon relative leading-none">
            {/* A step up from the labelled bar's text-xl: with nothing written
                under it the glyph is the whole target, and it matches the icon
                buttons in the session header. */}
            <t.Icon className="text-2xl leading-none" aria-hidden />
            {alerts.includes(t.id) && (
              <span aria-hidden className="absolute -right-1 -bottom-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" />
            )}
          </span>
        </button>
      ))}
    </nav>
  )
}
