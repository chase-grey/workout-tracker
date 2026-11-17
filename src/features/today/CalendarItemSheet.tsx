import { useMemo } from 'react'
import { MdAdd, MdPlayArrow } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { exerciseName, repRangeLabel } from '../../config/plan'
import { parseISODate } from '../../lib/dates'
import { isSupplementalSet } from '../../lib/session'
import { useBackGuard } from '../../lib/useBackGuard'
import type { CalendarAction, CalendarDay, CalendarItem } from '../../lib/weekCalendar'

type Line = { name: string; detail: string }
type Group = { label?: string; lines: Line[] }

const ROW = 'flex items-baseline justify-between gap-3 py-1.5 text-sm'

/**
 * What one session on the week calendar holds, opened by tapping it: the
 * exercises a lift day or a stretch routine will ask for, the sets a finished
 * one logged, a cardio session's figures. Looking is free — starting is the
 * button at the foot, there only for a session that's today's to start.
 */
export function CalendarItemSheet({
  day,
  item,
  colour,
  onAction,
  onClose,
}: {
  day: CalendarDay
  item: CalendarItem
  colour: string
  onAction: (a: CalendarAction) => void
  onClose: () => void
}) {
  const { plan, flexPlans, workouts } = useData()
  useBackGuard(true, onClose)

  const what = item.what
  const done = item.status === 'done'
  const groups = useMemo<Group[]>(() => {
    if (!what) return []
    if (what.type === 'lift') {
      if (done) {
        // What was logged that day, in the order it was trained.
        const sets = new Map<string, string[]>()
        for (const r of workouts) {
          if (r.date !== day.date || r.day_type !== what.day || isSupplementalSet(r)) continue
          const set = r.weight_lbs != null ? `${r.weight_lbs}×${r.reps}` : `${r.reps}`
          sets.set(r.exercise, [...(sets.get(r.exercise) ?? []), set])
        }
        return [{ lines: [...sets].map(([key, s]) => ({ name: exerciseName(key), detail: s.join('  ') })) }]
      }
      return [
        {
          lines: plan[what.day].exercises.map((e) => ({
            name: e.name,
            detail: `${e.sets} × ${repRangeLabel(e)}`,
          })),
        },
      ]
    }
    if (what.type === 'stretch') {
      return flexPlans[what.routine].map((b) => ({
        label: b.label,
        lines: b.exercises.map((e) => ({
          name: e.name,
          detail: `${e.sets} × ${e.holdSec ? `${e.holdSec}s` : e.reps}${e.perSide ? ' a side' : ''}`,
        })),
      }))
    }
    const figures = [
      what.minutes ? `${Math.round(what.minutes)} min` : null,
      what.distanceMi ? `${Number(what.distanceMi.toFixed(2))} mi` : null,
    ]
      .filter(Boolean)
      .join(' · ')
    return what.kind && figures ? [{ lines: [{ name: what.kind, detail: figures }] }] : []
  }, [what, done, workouts, plan, flexPlans, day.date])

  const date = parseISODate(day.date)
    .toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    .toLowerCase()
  const action = item.action

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
        <p className="text-xs tracking-wide text-neutral-500">
          {date} · {done ? 'done' : 'planned'}
        </p>
        <h2 className="mb-3 mt-1 flex items-center gap-2 text-lg font-bold">
          <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colour }} />
          {item.amount ? `${item.label} ${item.amount}` : item.label}
        </h2>

        {groups.map((g, n) => (
          <div key={n} className="mb-2">
            {g.label && <h3 className="mt-3 text-xs tracking-wider text-neutral-500">{g.label}</h3>}
            <ul className="divide-y divide-surface-2">
              {g.lines.map((l, i) => (
                <li key={i} className={ROW}>
                  <span className="min-w-0 text-neutral-100">{l.name}</span>
                  <span className="shrink-0 tabular-nums text-neutral-400">{l.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {action && (
          <button
            onClick={() => {
              onClose()
              onAction(action)
            }}
            className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-accent text-lg font-bold text-on-accent"
          >
            {action.type === 'cardio' ? <MdAdd aria-hidden /> : <MdPlayArrow aria-hidden />}
            {action.type === 'cardio' ? 'log' : 'start'}
          </button>
        )}
        <button onClick={onClose} className="mt-2 min-h-[44px] w-full rounded-xl text-sm font-medium text-neutral-400">
          close
        </button>
      </div>
    </div>
  )
}
