import { useState } from 'react'
import { MdAutoAwesome, MdCheckCircle } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { mondayOf, toISODate, weekStartISO } from '../../lib/dates'
import { usedStrips, whiteningGoalDates } from '../../lib/whitening'

const DOW = ['m', 't', 'w', 't', 'f', 's', 's']

/**
 * The nightly whitening strip, logged in a tap.
 *
 * Built like the pill card next to it, and for the same reason — the week reads
 * across the strip, and any day on it can be selected to log or correct. One
 * button rather than two, since a day owes exactly one strip: either it went on
 * or it didn't.
 */
export function WhiteningCard() {
  const { whiteningEntries, logWhitening, goals } = useData()
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
  const doneThisWeek = whiteningGoalDates(whiteningEntries).filter(
    (d) => weekStartISO(d) === thisWeek,
  ).length
  const met = doneThisWeek >= goals.whiteningDays

  const selDone = usedStrips(whiteningEntries, selDate)

  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs tracking-wider text-neutral-500">
          whitening
          {selDate !== today && <> · {selDate.slice(5)}</>}
        </p>
        <p className="text-sm tabular-nums text-neutral-400">
          <span className={`text-lg font-bold ${met ? 'text-accent-2' : 'text-neutral-100'}`}>
            {doneThisWeek}
          </span>{' '}
          / {goals.whiteningDays}
        </p>
      </div>

      {/* Mon–Sun week: tap a day to log or correct it. */}
      <div className="mt-3 flex gap-1">
        {week.map((d, i) => {
          const done = usedStrips(whiteningEntries, d)
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
              {done ? (
                <MdCheckCircle className="text-accent-2" aria-hidden />
              ) : (
                <span className="text-[10px] text-neutral-500">·</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex gap-2">
        {selDone ? (
          <>
            <div className="flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-xl bg-accent-2/15 text-sm font-semibold text-accent-2">
              <MdCheckCircle aria-hidden /> worn
            </div>
            <button
              onClick={() => void logWhitening(false, selDate)}
              className="min-h-[44px] rounded-xl bg-surface-2 px-3 text-sm text-neutral-400 active:opacity-80"
            >
              undo
            </button>
          </>
        ) : (
          <button
            onClick={() => void logWhitening(true, selDate)}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-xl bg-accent text-sm font-semibold text-black active:opacity-80"
          >
            <MdAutoAwesome aria-hidden /> strip
          </button>
        )}
      </div>
    </div>
  )
}
