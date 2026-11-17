import { useState } from 'react'
import { useData } from '../../store/DataContext'
import { useBackGuard } from '../../lib/useBackGuard'
import type { Pillar } from '../../lib/profile'
import {
  PIN_LABEL,
  WEEKDAY_SHORT,
  scheduledWeekdays,
  togglePin,
  toggleWeekday,
  weekDates,
  withWeekPins,
  withoutWeekPins,
  type CalendarDay,
  type PinnablePillar,
} from '../../lib/weekCalendar'


/**
 * Which days each kind of session falls on: for the one week on the calendar,
 * or for every week from here on (see lib/weekCalendar WeekPins and
 * CalendarPins). Each tap is saved as it lands, so the calendar behind the
 * sheet is the preview.
 *
 * A week's own days open on what the calendar already shows for it, so moving
 * Thursday's lift to Friday is two taps rather than a week rebuilt from blank.
 * Days already behind you can't be planned.
 */
export function ScheduleSheet({
  weekStart,
  weekLabel,
  today,
  days,
  pillars,
  colours,
  onClose,
}: {
  weekStart: string
  /** "this week", "next week". */
  weekLabel: string
  today: string
  days: CalendarDay[]
  /** The pillars whose days are set here, in order. */
  pillars: PinnablePillar[]
  colours: Record<Pillar, string>
  onClose: () => void
}) {
  const { settings, updateSettings } = useData()
  useBackGuard(true, onClose)

  const dates = weekDates(weekStart)
  // A week wholly behind you has nothing left to plan.
  const weekOpen = dates[6] >= today
  const [mode, setMode] = useState<'week' | 'always'>(weekOpen ? 'week' : 'always')
  const ownDays = settings.calendarWeeks?.[weekStart]

  const isOn = (p: PinnablePillar, d: number) =>
    mode === 'week' ? scheduledWeekdays(days, p).includes(d) : (settings.calendarPins?.[p]?.includes(d) ?? false)
  const locked = (d: number) => mode === 'week' && dates[d] < today

  const toggle = (p: PinnablePillar, d: number) => {
    if (mode === 'always') {
      updateSettings({ ...settings, calendarPins: togglePin(settings.calendarPins, p, d) })
      return
    }
    // Only the days still ahead are the week's to plan; what's done stays done.
    const planned = scheduledWeekdays(days, p).filter((w) => dates[w] >= today)
    updateSettings({
      ...settings,
      calendarWeeks: withWeekPins(settings.calendarWeeks, weekStart, p, toggleWeekday(planned, d), today),
    })
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
        <h2 className="mb-4 text-lg font-bold">schedule</h2>

        {weekOpen && (
          <div className="mb-4 flex gap-1 rounded-xl bg-surface-2 p-1">
            {(
              [
                ['week', weekLabel],
                ['always', 'every week'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`min-h-[40px] flex-1 rounded-lg px-2 text-sm font-medium ${
                  mode === m ? 'bg-accent text-on-accent' : 'text-neutral-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-4">
          {pillars.map((p) => (
            <div key={p} role="group" aria-label={PIN_LABEL[p]} className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-sm font-medium text-neutral-300">
                <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: colours[p] }} />
                {PIN_LABEL[p]}
              </h3>
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAY_SHORT.map((name, d) => (
                  <button
                    key={d}
                    onClick={() => toggle(p, d)}
                    disabled={locked(d)}
                    aria-label={WEEKDAY_SHORT[d]}
                    aria-pressed={isOn(p, d)}
                    className={`min-h-[44px] rounded-xl font-medium disabled:opacity-40 ${
                      isOn(p, d) ? 'bg-accent text-on-accent' : 'bg-surface-2 text-neutral-400'
                    }`}
                  >
                    {name[0]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {mode === 'week' && ownDays && (
          <button
            onClick={() => updateSettings({ ...settings, calendarWeeks: withoutWeekPins(settings.calendarWeeks, weekStart) })}
            className="mt-4 min-h-[44px] w-full rounded-xl bg-surface-2 text-sm font-medium text-neutral-300"
          >
            back to the usual week
          </button>
        )}
        <button
          onClick={onClose}
          className="mt-3 min-h-[52px] w-full rounded-2xl bg-accent text-lg font-bold text-on-accent"
        >
          done
        </button>
      </div>
    </div>
  )
}
