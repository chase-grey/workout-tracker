import { useState } from 'react'
import { MdCheckCircle, MdMedication } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { mondayOf, toISODate, weekStartISO } from '../../lib/dates'
import { vitaminDayState, vitaminGoalDates } from '../../lib/vitamins'

const DOW = ['m', 't', 'w', 't', 'f', 's', 's']

/**
 * The daily pills, logged in a tap: the multivitamin every day and the iron that
 * rides along every other one (see lib/vitamins).
 *
 * Built like the calorie card, and for the same reason — the week reads across
 * the strip, and any day on it can be selected to log or correct. What the
 * buttons offer follows the selected day: on an iron day the one tap covers
 * both, off one there's only the multivitamin to take, and a day already in
 * offers the way back out.
 */
export function VitaminsCard() {
  const { vitaminEntries, logVitamins, goals } = useData()
  const now = new Date()
  const today = toISODate(now)
  const [selDate, setSelDate] = useState(today)

  const monday = mondayOf(now)
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return toISODate(d)
  })

  const thisWeek = weekStartISO(today)
  const doneThisWeek = vitaminGoalDates(vitaminEntries).filter(
    (d) => weekStartISO(d) === thisWeek,
  ).length
  const met = doneThisWeek >= goals.vitaminDays

  const sel = vitaminDayState(vitaminEntries, selDate)
  const log = (patch: { vitamins?: boolean; iron?: boolean }) => void logVitamins(patch, selDate)

  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs tracking-wider text-neutral-500">
          vitamins
          {selDate !== today && <> · {selDate.slice(5)}</>}
          {sel.ironDay && <> · iron day</>}
        </p>
        <p className="text-sm tabular-nums text-neutral-400">
          <span className={`text-lg font-bold ${met ? 'text-accent-2' : 'text-neutral-100'}`}>
            {doneThisWeek}
          </span>{' '}
          / {goals.vitaminDays}
        </p>
      </div>

      {/* Mon–Sun week: tap a day to log or correct it. A day short of what it
          owed shows the pill rather than the check — an iron day that only got
          the multivitamin isn't a day that went to plan. */}
      <div className="mt-3 flex gap-1">
        {week.map((d, i) => {
          const day = vitaminDayState(vitaminEntries, d)
          const isSel = d === selDate
          return (
            <button
              key={d}
              onClick={() => setSelDate(d)}
              className={`flex flex-1 flex-col items-center rounded-lg py-1 ${
                isSel ? 'bg-surface-2 ring-1 ring-accent' : ''
              }`}
            >
              <span className={`text-[10px] ${d === today ? 'text-accent' : 'text-neutral-500'}`}>
                {DOW[i]}
              </span>
              {day.done ? (
                <MdCheckCircle className="text-accent-2" aria-hidden />
              ) : day.vitamins ? (
                <MdMedication className="text-amber-400" aria-hidden />
              ) : (
                <span className="text-[10px] text-neutral-500">·</span>
              )}
              {/* The iron marker keeps its line whether or not there's iron to
                  mark, so the row of days stays level. */}
              <span className="text-[9px] leading-none text-accent">
                {day.iron ? 'fe' : '\xa0'}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex gap-2">
        {sel.done ? (
          <>
            <div className="flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-xl bg-accent-2/15 text-sm font-semibold text-accent-2">
              <MdCheckCircle aria-hidden /> taken
            </div>
            <button
              onClick={() => log({ vitamins: false, iron: false })}
              className="min-h-[44px] rounded-xl bg-surface-2 px-3 text-sm text-neutral-400 active:opacity-80"
            >
              undo
            </button>
          </>
        ) : (
          <>
            {sel.ironDue && (
              <button
                onClick={() => log({ vitamins: true, iron: true })}
                className="min-h-[44px] flex-1 rounded-xl bg-accent text-sm font-semibold text-black active:opacity-80"
              >
                {sel.vitamins ? 'iron' : 'vitamins + iron'}
              </button>
            )}
            {!sel.vitamins && (
              <button
                onClick={() => log({ vitamins: true })}
                className={`min-h-[44px] flex-1 rounded-xl text-sm font-semibold active:opacity-80 ${
                  sel.ironDue ? 'bg-surface-2' : 'bg-accent text-black'
                }`}
              >
                vitamins
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
