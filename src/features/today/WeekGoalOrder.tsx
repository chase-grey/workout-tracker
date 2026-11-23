import { MdDragIndicator } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { orderBy } from '../../lib/cardLayout'
import { moveItem } from '../../lib/homeTiles'
import { useDragSort } from '../../lib/useDragSort'
import { weekPace, type MetricKey } from '../../lib/weekPace'

export const METRIC_LABELS: Record<MetricKey, string> = {
  workouts: 'workouts',
  flex: 'stretch sessions',
  calDays: 'days on calorie target',
  cardio: 'cardio days',
}

/**
 * The order the week's goals are listed in on the this-week card, dragged by
 * the grip. Opened under the card's name while the page is being edited (see
 * components/EditableStack). Only the order is set here: which goals there are
 * and how many each asks for a week belong to what's tracked.
 */
export function WeekGoalOrder() {
  const { weekProgress, goals, settings, updateSettings } = useData()
  const metrics = orderBy(weekPace(weekProgress, goals, new Date()).metrics, (m) => m.key, settings.weekGoalOrder)
  const ids = metrics.map((m) => m.key)
  const sort = useDragSort(ids, (from, to) =>
    updateSettings({ ...settings, weekGoalOrder: moveItem(ids, from, to) }),
  )

  return (
    <ul className="flex flex-col gap-1.5">
      {metrics.map((m) => {
        const row = sort.row(m.key)
        return (
          <li
            key={m.key}
            ref={row.ref}
            style={row.style}
            className={`flex min-h-[44px] items-center rounded-xl bg-surface-2 pr-3 text-sm ${
              sort.draggingId === m.key ? 'shadow-lg shadow-black/40' : ''
            }`}
          >
            <span
              {...sort.handle(m.key)}
              role="button"
              tabIndex={0}
              aria-label={`move ${METRIC_LABELS[m.key]}`}
              className="flex h-11 w-11 shrink-0 cursor-grab items-center justify-center text-xl text-neutral-500"
            >
              <MdDragIndicator aria-hidden />
            </span>
            <span className="flex-1 text-neutral-300">{METRIC_LABELS[m.key]}</span>
            <span className="tabular-nums text-neutral-500">
              {m.done}/{m.goal}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
