import { useData } from '../../store/DataContext'

const CHOICES = ['simple', 'full', 'off'] as const
const LABELS: Record<(typeof CHOICES)[number], string> = { simple: 'minimal', full: 'expanded', off: 'off' }

/** Today's week calendar: how it opens, or not at all. */
export function WeekCalendarSetting() {
  const { settings, updateSettings } = useData()
  const current = settings.showWeekCalendar === false ? 'off' : (settings.weekCalendarView ?? 'simple')
  const choose = (c: (typeof CHOICES)[number]) =>
    updateSettings(
      c === 'off'
        ? { ...settings, showWeekCalendar: false }
        : { ...settings, showWeekCalendar: true, weekCalendarView: c },
    )
  return (
    <section className="flex flex-col gap-2">
      <label className="text-sm font-medium text-neutral-300">calendar</label>
      <div className="flex gap-1 rounded-xl bg-surface p-1">
        {CHOICES.map((c) => (
          <button
            key={c}
            onClick={() => choose(c)}
            aria-pressed={current === c}
            className={`min-h-[36px] flex-1 rounded-lg px-2 text-sm font-medium ${
              current === c ? 'bg-accent text-on-accent' : 'text-neutral-400'
            }`}
          >
            {LABELS[c]}
          </button>
        ))}
      </div>
    </section>
  )
}
