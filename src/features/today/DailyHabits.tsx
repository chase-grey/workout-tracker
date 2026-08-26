import { useEffect, useState } from 'react'
import { MdAutoAwesome, MdCheck, MdLocalFireDepartment, MdMedication } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { CALORIE_GOAL, caloriePaceFraction, foodLogStatus, totalForDate } from '../../lib/calories'
import { mondayOf, toISODate, weekStartISO } from '../../lib/dates'
import { vitaminDayState, vitaminGoalDates } from '../../lib/vitamins'
import { usedStrips, whiteningGoalDates } from '../../lib/whitening'

const DOW = ['m', 't', 'w', 't', 'f', 's', 's']
const QUICK_ADDS = [100, 500, 4000]

/**
 * The three things every day owes — the calories, the pills, and the whitening
 * strip — on one week timeline.
 *
 * They used to be three cards, each with its own Mon–Sun strip, which meant the
 * same week was drawn three times and the page scrolled to hold it. One strip
 * says everything the three said: a day shows an icon per habit it got, and a
 * day that got all three collapses to a single check, because at that point
 * which icons are lit is no longer information. The dim icons matter as much as
 * the bright ones — a day always draws all three slots, so the gap you have to
 * close is visible rather than absent.
 *
 * The selected day drives everything below the strip: the calorie readout and
 * bar, and the two toggles. The pill toggle cycles rather than branching into
 * separate buttons — nothing, then the multivitamin, then the iron that rides
 * along every other day — so an iron day that quietly dropped the iron is still
 * a state you can record and see (amber, not green), which is the whole reason
 * the pill log tracks the two doses apart.
 */
export function DailyHabits() {
  const { calorieEntries, vitaminEntries, whiteningEntries, logCalories, logVitamins, logWhitening, goals } =
    useData()

  // Ticks so the "2h ago" since the last log ages on screen instead of freezing
  // at whatever it read when the card mounted — the card is left open all day.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const today = toISODate(now)
  const [selDate, setSelDate] = useState(today)

  const monday = mondayOf(now)
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return toISODate(d)
  })

  const thisWeek = weekStartISO(today)
  const inThisWeek = (d: string) => weekStartISO(d) === thisWeek
  const vitDays = vitaminGoalDates(vitaminEntries).filter(inThisWeek).length
  const whtDays = whiteningGoalDates(whiteningEntries).filter(inThisWeek).length

  const selTotal = totalForDate(calorieEntries, selDate)
  const pct = Math.min(selTotal / CALORIE_GOAL, 1) * 100
  const { label: selLabel } = foodLogStatus(calorieEntries, selDate, now)

  // Pace marker: where you should be eating constantly across the 9am–9pm window.
  const pace = selDate === today ? caloriePaceFraction(now) : null

  const sel = vitaminDayState(vitaminEntries, selDate)
  const selStrip = usedStrips(whiteningEntries, selDate)

  const addCalories = (cal: number) => {
    if (cal === 0) return
    void logCalories(cal, selDate)
  }

  // none → multivitamin → multivitamin + iron → none. Only iron days have the
  // middle step; on the others the multivitamin alone is the whole day.
  const cyclePills = () => {
    if (sel.done) void logVitamins({ vitamins: false, iron: false }, selDate)
    else if (sel.ironDue && sel.vitamins) void logVitamins({ iron: true }, selDate)
    else void logVitamins({ vitamins: true }, selDate)
  }

  const pillTone = sel.done
    ? 'bg-accent-2/15 text-accent-2'
    : sel.vitamins
      ? 'bg-surface-2 text-amber-400'
      : 'bg-surface-2 text-neutral-500'
  const stripTone = selStrip ? 'bg-accent-2/15 text-accent-2' : 'bg-surface-2 text-neutral-500'

  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs tracking-wider text-neutral-500">
          daily
          {selLabel && <> · {selLabel}</>}
          {sel.ironDay && <> · fe</>}
        </p>
        <p className="text-sm tabular-nums text-neutral-400">
          <span
            className={`text-lg font-bold ${selTotal >= CALORIE_GOAL ? 'text-accent-2' : 'text-neutral-100'}`}
          >
            {selTotal}
          </span>{' '}
          / {CALORIE_GOAL}
        </p>
      </div>

      <div className="relative mt-1.5">
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        {pace != null && pace > 0 && pace < 1 && (
          <div
            className="absolute -top-0.5 h-3 w-0.5 -translate-x-1/2 rounded bg-white"
            style={{ left: `${pace * 100}%` }}
            title="on-pace target for now"
          />
        )}
      </div>

      {/* Mon–Sun week: tap a day to view, log, or correct it. */}
      <div className="mt-2 flex gap-1">
        {week.map((d, i) => {
          const cal = totalForDate(calorieEntries, d) >= CALORIE_GOAL
          const vit = vitaminDayState(vitaminEntries, d).done
          const wht = usedStrips(whiteningEntries, d)
          const all = cal && vit && wht
          return (
            <button
              key={d}
              onClick={() => setSelDate(d)}
              aria-label={d}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 ${
                d === selDate ? 'bg-surface-2 ring-1 ring-accent' : ''
              }`}
            >
              <span className={`text-[10px] leading-none ${d === today ? 'text-accent' : 'text-neutral-500'}`}>
                {DOW[i]}
              </span>
              {/* Both branches share the row height so the strip stays level. */}
              <span className="flex h-4 items-center gap-px">
                {all ? (
                  <MdCheck className="text-base text-accent-2" aria-hidden />
                ) : (
                  <>
                    <MdLocalFireDepartment
                      className={`text-[11px] ${cal ? 'text-accent' : 'text-neutral-700'}`}
                      aria-hidden
                    />
                    <MdMedication
                      className={`text-[11px] ${vit ? 'text-amber-400' : 'text-neutral-700'}`}
                      aria-hidden
                    />
                    <MdAutoAwesome
                      className={`text-[11px] ${wht ? 'text-sky-300' : 'text-neutral-700'}`}
                      aria-hidden
                    />
                  </>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {/* One row for the whole day: the calorie taps, then the two toggles,
          each carrying its week's count so the goal reads without a second line. */}
      <div className="mt-2 flex gap-1.5">
        {QUICK_ADDS.map((cal) => (
          <button
            key={cal}
            onClick={() => addCalories(cal)}
            className="min-h-[44px] flex-1 rounded-xl bg-surface-2 text-xs font-semibold active:opacity-80"
          >
            +{cal}
          </button>
        ))}
        <button
          onClick={() => addCalories(-100)}
          className="min-h-[44px] flex-1 rounded-xl bg-surface-2 text-xs font-semibold active:opacity-80"
        >
          −100
        </button>
        <button
          onClick={cyclePills}
          aria-label="vitamins"
          className={`flex min-h-[44px] w-11 flex-col items-center justify-center gap-0.5 rounded-xl active:opacity-80 ${pillTone}`}
        >
          <MdMedication aria-hidden />
          <span className="text-[9px] leading-none tabular-nums">
            {vitDays}/{goals.vitaminDays}
          </span>
        </button>
        <button
          onClick={() => void logWhitening(!selStrip, selDate)}
          aria-label="whitening"
          className={`flex min-h-[44px] w-11 flex-col items-center justify-center gap-0.5 rounded-xl active:opacity-80 ${stripTone}`}
        >
          <MdAutoAwesome aria-hidden />
          <span className="text-[9px] leading-none tabular-nums">
            {whtDays}/{goals.whiteningDays}
          </span>
        </button>
      </div>
    </div>
  )
}
