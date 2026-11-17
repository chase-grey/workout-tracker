import { useData } from '../../store/DataContext'

const CHOICES = ['full', 'simple', 'off'] as const

/** Today's week calendar: which form it takes, or none. */
export function WeekCalendarSetting() {
  const { settings, updateSettings } = useData()
  const current = settings.showWeekCalendar === false ? 'off' : (settings.weekCalendarView ?? 'full')
  const choose = (c: (typeof CHOICES)[number]) =>
    updateSettings(
      c === 'off'
        ? { ...settings, showWeekCalendar: false }
        : { ...settings, showWeekCalendar: true, weekCalendarView: c },
    )
  return (
    <section className="flex flex-col gap-2">
      <label className="text-sm font-medium text-neutral-300">week calendar</label>
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
            {c}
          </button>
        ))}
      </div>
    </section>
  )
}
