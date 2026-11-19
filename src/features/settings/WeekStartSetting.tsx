import { useData } from '../../store/DataContext'
import { normalizeWeekStart, weekdayOrder } from '../../lib/dates'

/** `Date.getDay()` order: 0 = Sunday. */
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** The day a week starts on, everywhere a week is counted or drawn. Monday unless chosen. */
export function WeekStartSetting() {
  const { settings, updateSettings } = useData()
  const current = normalizeWeekStart(settings.weekStartDay)
  return (
    <section className="flex flex-col gap-2">
      <label htmlFor="week-start-day" className="text-sm font-medium text-neutral-300">
        week starts on
      </label>
      <select
        id="week-start-day"
        value={current}
        // Written as a number even for Monday: a deleted key would let an older
        // copy's choice come back in the settings merge.
        onChange={(e) => updateSettings({ ...settings, weekStartDay: normalizeWeekStart(Number(e.target.value)) })}
        className="min-h-[44px] rounded-xl bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
      >
        {weekdayOrder(1).map((d) => (
          <option key={d} value={d}>
            {DAY_NAMES[d]}
          </option>
        ))}
      </select>
    </section>
  )
}
